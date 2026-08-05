import { 
  evaluateOpportunity, 
  planTransition,
  CommercialSubjectRef
} from '../../packages/commercial-kernel';
import { OrganizationConfigResolver } from '../../packages/domain/config-resolver';
import { HubspotAdapter, HubSpotSnapshotLoader } from '../../packages/hubspot-adapter';
import { logger } from '../../packages/observability';

export interface HubSpotCustomCodeEvent {
  origin?: {
    portalId?: number;
  };
  object?: {
    objectId: string | number;
    objectType: string;
  };
  inputFields?: Record<string, string>;
}

export interface HubSpotCustomCodeCallbackResult {
  outputFields: {
    qualificationState: string;
    opportunityKey: string;
    appliedIntentsCount: number;
    status: 'NO_CHANGE' | 'UPDATED_EXISTING' | 'CREATED_SUCCESSOR' | 'DRY_RUN_SUCCESSOR_PLANNED' | 'BLOCKED' | 'MANUAL_REVIEW';
    verified: boolean;
    errorReason?: string;
  };
}

export async function processHubSpotCustomCodeAction(
  event: HubSpotCustomCodeEvent,
  accessToken?: string
): Promise<HubSpotCustomCodeCallbackResult> {
  logger.info('Executing stateless HubSpot Custom Code Action', { event });

  try {
    const rawObjectType = event.object?.objectType?.toUpperCase() || '';
    const rawObjectId = String(event.object?.objectId || '').trim();

    if (!rawObjectId || rawObjectId === '0') {
      throw new Error('INVALID_ENROLLMENT: Missing event.object.objectId in HubSpot custom code payload.');
    }

    const portalId = event.origin?.portalId;
    if (!portalId) {
      throw new Error('INVALID_ENROLLMENT: Missing event.origin.portalId in HubSpot custom code payload.');
    }

    let objectType: 'contact' | 'company' | 'lead' | 'deal';
    if (rawObjectType === 'CONTACT' || rawObjectType === '0-1') {
      objectType = 'contact';
    } else if (rawObjectType === 'COMPANY' || rawObjectType === '0-2') {
      objectType = 'company';
    } else if (rawObjectType === 'LEAD' || rawObjectType === '0-136') {
      objectType = 'lead';
    } else if (rawObjectType === 'DEAL' || rawObjectType === '0-3') {
      objectType = 'deal';
    } else {
      throw new Error(`UNSUPPORTED_OBJECT_TYPE: Enrolled object type '${event.object?.objectType}' is not supported by Commercial Operations Kernel.`);
    }

    const config = OrganizationConfigResolver.resolveConfigByPortalId(portalId);
    const token = accessToken || process.env.PRIVATE_APP_ACCESS_TOKEN || process.env.HUBSPOT_ACCESS_TOKEN;
    const adapter = new HubspotAdapter(token);
    const snapshotLoader = new HubSpotSnapshotLoader(adapter);

    const snapshot = await snapshotLoader.loadSnapshotFromRecord(
      { objectType, objectId: rawObjectId },
      config.organizationKey,
      config.relationshipType,
      config
    );

    const evalRes = evaluateOpportunity(snapshot, config);
    const intents = planTransition(snapshot, evalRes, config);
    const correlationKey = `${snapshot.opportunityKey}:${Date.now()}`;
    const mutationResult = await adapter.applyTransitionIntents(intents, correlationKey, config);

    if (!mutationResult.success) {
      const unverified = mutationResult.receipts.filter(r => !r.verified);
      throw new Error(`ACTION_UNVERIFIED: Custom Code Action mutation verification failed for ${unverified.length} receipt(s): ${JSON.stringify(unverified)}`);
    }

    let status: 'NO_CHANGE' | 'UPDATED_EXISTING' | 'CREATED_SUCCESSOR' | 'DRY_RUN_SUCCESSOR_PLANNED' | 'BLOCKED' | 'MANUAL_REVIEW' = 'NO_CHANGE';

    if (evalRes.qualificationState === 'BLOCKED') {
      status = 'BLOCKED';
    } else if (mutationResult.receipts.some(r => r.intentKind === 'CREATE_MANUAL_REVIEW')) {
      status = 'MANUAL_REVIEW';
    } else if (mutationResult.receipts.some(r => r.intentKind === 'CREATE_SUCCESSOR' && r.operation === 'CREATE')) {
      status = 'CREATED_SUCCESSOR';
    } else if (mutationResult.receipts.some(r => r.intentKind === 'CREATE_SUCCESSOR' && r.operation === 'NOOP' && r.verified)) {
      status = config.featureFlags?.dryRunTransactions ? 'DRY_RUN_SUCCESSOR_PLANNED' : 'NO_CHANGE';
    } else if (mutationResult.receipts.some(r => r.operation === 'UPDATE' && r.verified)) {
      status = 'UPDATED_EXISTING';
    }

    logger.info('Stateless HubSpot Custom Code Action executed successfully', {
      objectId: rawObjectId,
      objectType,
      opportunityKey: snapshot.opportunityKey,
      qualificationState: evalRes.qualificationState,
      appliedIntentsCount: mutationResult.appliedIntents,
      verified: mutationResult.success,
      status
    });

    return {
      outputFields: {
        qualificationState: evalRes.qualificationState,
        opportunityKey: snapshot.opportunityKey,
        appliedIntentsCount: mutationResult.appliedIntents,
        status,
        verified: mutationResult.success
      }
    };
  } catch (err: any) {
    logger.error('HubSpot Custom Code Action execution error', { error: err });
    throw err;
  }
}

export async function main(
  event: HubSpotCustomCodeEvent,
  callback?: (result: HubSpotCustomCodeCallbackResult) => void
): Promise<HubSpotCustomCodeCallbackResult> {
  const result = await processHubSpotCustomCodeAction(event);
  if (callback) {
    callback(result);
  }
  return result;
}
