import { 
  evaluateOpportunity, 
  planTransition 
} from '../../packages/commercial-kernel';
import { 
  HubspotAdapter, 
  HubSpotSnapshotLoader 
} from '../../packages/hubspot-adapter';
import { OrganizationConfigResolver } from '../../packages/domain/config-resolver';
import { logger } from '../../packages/observability';

export interface HubSpotCustomCodeResult {
  outputFields: {
    objectId: string;
    objectType: string;
    opportunityKey: string;
    qualificationState: string;
    appliedIntentsCount: number;
    verified: boolean;
    status: 'NO_CHANGE' | 'UPDATED' | 'CREATED_SUCCESSOR' | 'MANUAL_REVIEW_REQUIRED' | 'BLOCKED';
  };
}

export async function processHubSpotCustomCodeAction(
  event: any,
  accessToken?: string,
  adapterInstance?: HubspotAdapter
): Promise<HubSpotCustomCodeResult> {
  const portalId = event?.origin?.portalId || 149041124;
  const rawObjectId = event?.object?.objectId || event?.object?.id || '0';
  const objectType = (event?.object?.objectType || 'contact').toLowerCase();

  if (!rawObjectId || rawObjectId === '0') {
    throw new Error('INVALID_ENROLLMENT: HubSpot Custom Code action missing valid object.objectId in event payload');
  }

  logger.info('Executing stateless HubSpot Custom Code Action', {
    event: { origin: event?.origin, object: { objectId: rawObjectId, objectType } }
  });

  const config = OrganizationConfigResolver.resolveConfigByPortalId(portalId);

  const adapter = adapterInstance || new HubspotAdapter(accessToken);
  const snapshotLoader = new HubSpotSnapshotLoader(adapter);

  const snapshot = await snapshotLoader.loadSnapshotFromRecord(
    { objectType, objectId: rawObjectId },
    config.organizationKey
  );

  logger.info('Loading pure opportunity snapshot directly from HubSpot CRM', { objectType, objectId: rawObjectId });

  // Special Lead Bootstrap Handling for raw Contact or Company enrollment
  if (objectType === 'contact' || objectType === '0-1' || objectType === 'company' || objectType === '0-2') {
    const lead = await adapter.findOrCreateLeadForSubject(
      snapshot.subject,
      snapshot.relationshipKey,
      config.relationshipType,
      config
    );

    if (lead) {
      const leadSnapshot = await snapshotLoader.loadSnapshotFromRecord(
        { objectType: 'lead', objectId: lead.id },
        config.organizationKey
      );
      const evalRes = evaluateOpportunity(leadSnapshot, config);
      const intents = planTransition(leadSnapshot, evalRes, config);
      const mutationResult = await adapter.applyTransitionIntents(intents, leadSnapshot.opportunityKey, config);

      if (!mutationResult.success) {
        const failedReceipts = mutationResult.receipts.filter(r => !r.verified);
        throw new Error(`ACTION_UNVERIFIED: Mutation readback verification failed: ${JSON.stringify(failedReceipts)}`);
      }

      let status: HubSpotCustomCodeResult['outputFields']['status'] = 'NO_CHANGE';
      if (intents.some(i => i.kind === 'CREATE_SUCCESSOR')) {
        status = 'CREATED_SUCCESSOR';
      } else if (intents.some(i => i.kind === 'UPDATE_OPPORTUNITY')) {
        status = 'UPDATED';
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

  // Standard Opportunity Reconciliation
  const evaluation = evaluateOpportunity(snapshot, config);
  const intents = planTransition(snapshot, evaluation, config);
  const mutationResult = await adapter.applyTransitionIntents(intents, snapshot.opportunityKey, config);

  if (!mutationResult.success) {
    const failedReceipts = mutationResult.receipts.filter(r => !r.verified);
    throw new Error(`ACTION_UNVERIFIED: Mutation readback verification failed: ${JSON.stringify(failedReceipts)}`);
  }

  let status: HubSpotCustomCodeResult['outputFields']['status'] = 'NO_CHANGE';
  if (intents.some(i => i.kind === 'CREATE_SUCCESSOR')) {
    status = 'CREATED_SUCCESSOR';
  } else if (intents.some(i => i.kind === 'CREATE_MANUAL_REVIEW')) {
    status = 'MANUAL_REVIEW_REQUIRED';
  } else if (evaluation.qualificationState === 'BLOCKED') {
    status = 'BLOCKED';
  } else if (intents.some(i => i.kind === 'UPDATE_OPPORTUNITY')) {
    status = 'UPDATED';
  }

  logger.info('Stateless HubSpot Custom Code Action executed successfully', {
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

export async function main(event: any, callback?: Function): Promise<HubSpotCustomCodeResult> {
  try {
    const result = await processHubSpotCustomCodeAction(event);
    if (callback) {
      callback(result);
    }
    return result;
  } catch (err: any) {
    logger.error('HubSpot Custom Code Action execution error', { error: err });
    throw err;
  }
}
