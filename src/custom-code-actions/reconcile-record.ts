import { OrganizationConfigResolver } from '../../packages/domain';
import { HubspotAdapter, HubSpotSnapshotLoader } from '../../packages/hubspot-adapter';
import { evaluateOpportunity, planTransition } from '../../packages/commercial-kernel';
import { logger } from '../../packages/observability';

export interface HubSpotEventPayload {
  origin?: { portalId?: number };
  object?: { objectId?: string; id?: string; objectType?: string };
  inputFields?: Record<string, any>;
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
  const portalId = event?.origin?.portalId;
  const rawObjectId = event?.object?.objectId || event?.object?.id;
  const rawObjectType = event?.object?.objectType;

  if (!portalId || !rawObjectId || rawObjectId === '0' || !rawObjectType) {
    throw new Error("INVALID_ENROLLMENT: Missing valid origin.portalId, object.objectId, or object.objectType in HubSpot event payload");
  }

  const objectType = String(rawObjectType).toLowerCase();

  logger.info("Executing stateless HubSpot Custom Code Action", {
    event: { origin: event?.origin, object: { objectId: rawObjectId, objectType } }
  });

  const relTypeInput = event?.inputFields?.relationshipType || event?.inputFields?.coa_relationship_type;
  const offeringInput = event?.inputFields?.offeringKeys || event?.inputFields?.coa_offering_keys;

  const config = OrganizationConfigResolver.resolveConfigByPortalId(portalId, { relationshipType: relTypeInput });
  const adapter = adapterInstance || new HubspotAdapter(accessToken);
  const snapshotLoader = new HubSpotSnapshotLoader(adapter);

  // Load subject snapshot first
  const snapshot = await snapshotLoader.loadSnapshotFromRecord(
    { objectType, objectId: rawObjectId },
    config.organizationKey,
    config.relationshipType
  );

  logger.info("Loading pure opportunity snapshot directly from HubSpot CRM", { objectType, objectId: rawObjectId });

  // Early Suppression Gate: check if automation is suppressed BEFORE Lead bootstrap
  if (snapshot.facts.automationSuppressed === true || config.featureFlags?.automationSuppressed === true) {
    logger.info("Automation suppressed for subject record", { objectType, objectId: rawObjectId });
    return {
      outputFields: {
        objectId: rawObjectId,
        objectType,
        opportunityKey: snapshot.opportunityKey,
        qualificationState: 'BLOCKED',
        appliedIntentsCount: 0,
        verified: true,
        status: 'BLOCKED'
      }
    };
  }

  if (objectType === 'contact' || objectType === '0-1' || objectType === 'company' || objectType === '0-2') {
    const lead = await adapter.findOrCreateLeadForSubject(
      snapshot.subject,
      snapshot.relationshipKey,
      config.relationshipType,
      config,
      offeringInput
    );

    if (lead) {
      const leadSnapshot = await snapshotLoader.loadSnapshotFromRecord(
        { objectType: 'lead', objectId: lead.id },
        config.organizationKey,
        config.relationshipType
      );

      const evalRes = evaluateOpportunity(leadSnapshot, config);
      const intents = planTransition(leadSnapshot, evalRes, config);

      const mutationResult = await adapter.applyTransitionIntents(intents, leadSnapshot.opportunityKey, config);

      if (!mutationResult.success) {
        const failedReceipts = mutationResult.receipts.filter(r => !r.verified);
        throw new Error(`ACTION_UNVERIFIED: Mutation readback verification failed: ${JSON.stringify(failedReceipts)}`);
      }

      let status = 'NO_CHANGE';
      if (mutationResult.receipts.some(r => r.intentKind === 'CREATE_SUCCESSOR' && r.operation === 'CREATE' && r.verified)) {
        status = 'CREATED_SUCCESSOR';
      } else if (mutationResult.receipts.some(r => r.intentKind === 'CREATE_SUCCESSOR' && r.operation === 'NOOP' && r.verified)) {
        status = config.featureFlags?.dryRunTransactions ? 'DRY_RUN_SUCCESSOR_PLANNED' : 'NO_CHANGE';
      } else if (mutationResult.receipts.some(r => r.intentKind === 'CREATE_MANUAL_REVIEW')) {
        status = 'MANUAL_REVIEW_REQUIRED';
      } else if (evalRes.qualificationState === 'BLOCKED') {
        status = 'BLOCKED';
      } else if (mutationResult.receipts.some(r => r.operation === 'UPDATE' && r.verified)) {
        status = 'UPDATED_EXISTING';
      }

      return {
        outputFields: {
          objectId: lead.id,
          objectType: 'lead',
          opportunityKey: leadSnapshot.opportunityKey,
          qualificationState: evalRes.qualificationState,
          appliedIntentsCount: mutationResult.appliedIntents,
          verified: mutationResult.success,
          status
        }
      };
    }
  }

  const evaluation = evaluateOpportunity(snapshot, config);
  const intents = planTransition(snapshot, evaluation, config);

  const mutationResult = await adapter.applyTransitionIntents(intents, snapshot.opportunityKey, config);

  if (!mutationResult.success) {
    const failedReceipts = mutationResult.receipts.filter(r => !r.verified);
    throw new Error(`ACTION_UNVERIFIED: Mutation readback verification failed: ${JSON.stringify(failedReceipts)}`);
  }

  let status = 'NO_CHANGE';
  if (mutationResult.receipts.some(r => r.intentKind === 'CREATE_SUCCESSOR' && r.operation === 'CREATE' && r.verified)) {
    status = 'CREATED_SUCCESSOR';
  } else if (mutationResult.receipts.some(r => r.intentKind === 'CREATE_SUCCESSOR' && r.operation === 'NOOP' && r.verified)) {
    status = config.featureFlags?.dryRunTransactions ? 'DRY_RUN_SUCCESSOR_PLANNED' : 'NO_CHANGE';
  } else if (mutationResult.receipts.some(r => r.intentKind === 'CREATE_MANUAL_REVIEW')) {
    status = 'MANUAL_REVIEW_REQUIRED';
  } else if (evaluation.qualificationState === 'BLOCKED') {
    status = 'BLOCKED';
  } else if (mutationResult.receipts.some(r => r.operation === 'UPDATE' && r.verified)) {
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
  } catch (err) {
    logger.error("HubSpot Custom Code Action execution error", { error: err });
    throw err;
  }
}
