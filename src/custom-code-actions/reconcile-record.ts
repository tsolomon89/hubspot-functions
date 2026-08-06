import { HubSpotSnapshotLoader, HubspotAdapter, VerificationReceipt } from '../../packages/hubspot-adapter';
import { OrganizationConfigResolver } from '../../packages/domain/config-resolver';
import { evaluateOpportunity, planTransition } from '../../packages/commercial-kernel';
import { logger } from '../../packages/observability';

export interface HubSpotEventPayload {
  origin?: {
    portalId?: number;
    userUserId?: number;
  };
  object?: {
    objectId?: string | number;
    objectType?: string;
  };
  inputFields?: {
    organizationKey?: string;
    relationshipType?: string;
    productType?: string;
    offeringKeys?: string;
  };
}

export interface CustomCodeActionResult {
  outputFields: {
    objectId: string;
    objectType: string;
    opportunityKey: string;
    qualificationState: string;
    appliedIntentsCount: number;
    verified: boolean;
    status: string;
  };
}

export async function processHubSpotCustomCodeAction(
  event: HubSpotEventPayload,
  accessToken?: string,
  adapterInstance?: HubspotAdapter
): Promise<CustomCodeActionResult> {
  logger.info("Executing stateless HubSpot Custom Code Action", { event });

  const rawPortalId = event?.origin?.portalId;
  const rawObjectId = event?.object?.objectId ? String(event.object.objectId) : undefined;
  const objectType = event?.object?.objectType;

  if (!rawObjectId || rawObjectId === '0' || !objectType) {
    throw new Error(`INVALID_ENROLLMENT: Missing valid objectId ('${rawObjectId}') or objectType ('${objectType}') in event payload`);
  }

  const token = accessToken || process.env.PRIVATE_APP_ACCESS_TOKEN || process.env.HUBSPOT_ACCESS_TOKEN;
  if (!adapterInstance && (!token || token.trim() === '')) {
    throw new Error("MISSING_AUTHENTICATION_SECRET: PRIVATE_APP_ACCESS_TOKEN secret is missing or empty in execution environment");
  }

  const adapter = adapterInstance || new HubspotAdapter(token);
  const loader = new HubSpotSnapshotLoader(adapter);
  const resolver = new OrganizationConfigResolver();

  const inputOrgKey = event?.inputFields?.organizationKey;
  const inputRelType = event?.inputFields?.relationshipType;
  const inputProductType = event?.inputFields?.productType;

  let config = resolver.resolveConfig({
    portalId: rawPortalId,
    organizationKey: inputOrgKey,
    relationshipType: inputRelType,
    productType: inputProductType
  });

  const snapshot = await loader.loadPureSnapshotFromHubSpot(
    { objectId: rawObjectId, objectType },
    config.organizationKey,
    config.relationshipType
  );

  if (snapshot.facts?.manualReviewRequired || snapshot.facts?.ambiguousPrimaryContact || snapshot.facts?.ambiguousPrimaryCompany || snapshot.facts?.missingCompany) {
    logger.warn("Ambiguity or missing relationship detected on snapshot; generating Manual Review Task intent", { snapshot });
    
    const taskIntent = {
      kind: 'CREATE_MANUAL_REVIEW' as const,
      opportunityKey: snapshot.opportunityKey,
      reason: snapshot.facts?.missingCompany 
        ? 'B2B Relationship missing required Company association'
        : (snapshot.facts?.ambiguousPrimaryCompany ? 'Ambiguous primary Company association detected' : 'Ambiguous primary Contact association detected'),
      subject: snapshot.subject
    };

    const mutationResult = await adapter.applyTransitionIntents([taskIntent], snapshot.opportunityKey, config);
    return {
      outputFields: {
        objectId: rawObjectId,
        objectType,
        opportunityKey: snapshot.opportunityKey,
        qualificationState: 'MANUAL_REVIEW',
        appliedIntentsCount: mutationResult.appliedIntents,
        verified: mutationResult.success,
        status: 'MANUAL_REVIEW_REQUIRED'
      }
    };
  }

  if (snapshot.facts?.automationSuppressed) {
    logger.info("Automation suppressed for subject; returning SUPPRESSED response", { snapshot });
    return {
      outputFields: {
        objectId: rawObjectId,
        objectType,
        opportunityKey: snapshot.opportunityKey,
        qualificationState: 'BLOCKED',
        appliedIntentsCount: 0,
        verified: true,
        status: 'SUPPRESSED'
      }
    };
  }

  if ((objectType.toLowerCase() === 'contact' || objectType === '0-1') && snapshot.opportunityType === 'MQL') {
    const inputOfferings = event?.inputFields?.offeringKeys;
    const initialLead = await adapter.findOrCreateLeadForSubject(
      snapshot.subject,
      snapshot.relationshipKey,
      snapshot.relationshipType,
      config,
      inputOfferings
    );

    if (initialLead && initialLead.id) {
      const leadSnapshot = await loader.loadPureSnapshotFromHubSpot(
        { objectId: initialLead.id, objectType: 'LEAD' },
        config.organizationKey,
        config.relationshipType
      );

      const evalResult = evaluateOpportunity(leadSnapshot, config);
      const intents = planTransition(leadSnapshot, evalResult, config);

      const mutationResult = await adapter.applyTransitionIntents(intents, leadSnapshot.opportunityKey, config);

      if (!mutationResult.success) {
        const failedReceipts = mutationResult.receipts.filter((r: VerificationReceipt) => !r.verified);
        throw new Error(`ACTION_UNVERIFIED: Initial Lead mutation readback verification failed: ${JSON.stringify(failedReceipts)}`);
      }

      const hasSuccessor = mutationResult.receipts.some((r: VerificationReceipt) => r.intentKind === 'CREATE_SUCCESSOR');
      return {
        outputFields: {
          objectId: initialLead.id,
          objectType: 'lead',
          opportunityKey: leadSnapshot.opportunityKey,
          qualificationState: evalResult.qualificationState,
          appliedIntentsCount: mutationResult.appliedIntents + 1,
          verified: mutationResult.success,
          status: hasSuccessor ? 'CREATED_SUCCESSOR' : 'UPDATED_EXISTING'
        }
      };
    }
  }

  const evaluation = evaluateOpportunity(snapshot, config);
  const intents = planTransition(snapshot, evaluation, config);

  const mutationResult = await adapter.applyTransitionIntents(intents, snapshot.opportunityKey, config);

  if (!mutationResult.success) {
    const failedReceipts = mutationResult.receipts.filter((r: VerificationReceipt) => !r.verified);
    throw new Error(`ACTION_UNVERIFIED: Mutation readback verification failed: ${JSON.stringify(failedReceipts)}`);
  }

  let status = 'NO_CHANGE';
  if (mutationResult.receipts.some((r: VerificationReceipt) => r.intentKind === 'CREATE_SUCCESSOR' && r.operation === 'CREATE' && r.verified)) {
    status = 'CREATED_SUCCESSOR';
  } else if (mutationResult.receipts.some((r: VerificationReceipt) => r.intentKind === 'CREATE_SUCCESSOR' && r.operation === 'NOOP' && r.verified)) {
    status = config.featureFlags?.dryRunTransactions ? 'DRY_RUN_SUCCESSOR_PLANNED' : 'NO_CHANGE';
  } else if (mutationResult.receipts.some((r: VerificationReceipt) => r.intentKind === 'CREATE_MANUAL_REVIEW')) {
    status = 'MANUAL_REVIEW_REQUIRED';
  } else if (evaluation.qualificationState === 'BLOCKED') {
    status = 'BLOCKED';
  } else if (mutationResult.receipts.some((r: VerificationReceipt) => r.operation === 'UPDATE' && r.verified)) {
    status = 'UPDATED_EXISTING';
  }

  logger.info("Stateless HubSpot Custom Code Action executed successfully", {
    objectId: rawObjectId,
    objectType,
    opportunityKey: snapshot.opportunityKey,
    qualificationState: evaluation.qualificationState,
    appliedIntentsCount: mutationResult.appliedIntents,
    verified: mutationResult.success,
    status
  });

  return {
    outputFields: {
      objectId: rawObjectId,
      objectType,
      opportunityKey: snapshot.opportunityKey,
      qualificationState: evaluation.qualificationState,
      appliedIntentsCount: mutationResult.appliedIntents,
      verified: mutationResult.success,
      status
    }
  };
}

export async function main(
  event: HubSpotEventPayload,
  callback?: (result: CustomCodeActionResult) => void
): Promise<CustomCodeActionResult> {
  try {
    const result = await processHubSpotCustomCodeAction(event);
    if (callback) {
      callback(result);
    }
    return result;
  } catch (err: any) {
    logger.error("HubSpot Custom Code Action execution error", { error: err });
    if (callback) {
      callback({
        outputFields: {
          objectId: String(event?.object?.objectId || '0'),
          objectType: String(event?.object?.objectType || 'CONTACT'),
          opportunityKey: 'UNKNOWN',
          qualificationState: 'MANUAL_REVIEW',
          appliedIntentsCount: 0,
          verified: false,
          status: 'FAILED'
        }
      });
    }
    throw err;
  }
}
