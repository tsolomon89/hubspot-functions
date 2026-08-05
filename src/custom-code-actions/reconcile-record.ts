import { HubspotAdapter, HubSpotSnapshotLoader } from '../../packages/hubspot-adapter';
import { OrganizationConfigResolver } from '../../packages/domain/config-resolver';
import { evaluateOpportunity, planTransition } from '../../packages/commercial-kernel';
import { logger } from '../../packages/observability';

export interface HubSpotCustomCodeEvent {
  origin?: {
    portalId?: number | string;
    actionDefinitionId?: number;
  };
  object?: {
    id: number | string;
    objectType?: string; // e.g. '0-1' for contact, '0-2' for company, '0-3' for deal
  };
  inputFields?: {
    recordId?: string;
    objectType?: 'contact' | 'company' | 'lead' | 'deal';
    organizationKey?: string;
    relationshipType?: string;
  };
}

export interface CustomCodeCallbackResult {
  outputFields: {
    status: 'NO_CHANGE' | 'UPDATED_EXISTING' | 'CREATED_SUCCESSOR' | 'BLOCKED' | 'MANUAL_REVIEW';
    opportunityKey: string;
    qualificationState: string;
    appliedIntentsCount: number;
    verified: boolean;
  };
}

export async function processHubSpotCustomCodeAction(
  event: HubSpotCustomCodeEvent,
  accessToken?: string
): Promise<CustomCodeCallbackResult> {
  const portalId = event.origin?.portalId || process.env.HUBSPOT_PORTAL_ID || '149041124';
  
  // Resolve Object Type
  let objectType: 'contact' | 'company' | 'lead' | 'deal' = event.inputFields?.objectType || 'contact';
  if (event.object?.objectType === '0-2') objectType = 'company';
  else if (event.object?.objectType === '0-3') objectType = 'deal';

  // Resolve Record ID
  const objectId = String(event.inputFields?.recordId || event.object?.id || '0');
  if (!objectId || objectId === '0') {
    throw new Error('INVALID_ENROLLMENT: Missing valid record ID in HubSpot Custom Code Action event.');
  }

  const token = accessToken || process.env.HUBSPOT_ACCESS_TOKEN || process.env.HUBSPOT_DEVELOPMENT_PERSONAL_ACCESS_KEY;
  const hsAdapter = new HubspotAdapter(token);
  const configResolver = new OrganizationConfigResolver();
  const snapshotLoader = new HubSpotSnapshotLoader(hsAdapter);

  // 1. Resolve Organization Configuration
  const config = configResolver.resolveConfig({
    portalId,
    organizationKey: event.inputFields?.organizationKey,
    relationshipType: event.inputFields?.relationshipType
  });

  // 2. Load pure OpportunitySnapshot directly from HubSpot CRM API
  const snapshot = await snapshotLoader.loadSnapshotFromRecord(
    { objectType, objectId },
    config.organizationKey,
    config.relationshipType
  );

  // 3. Evaluate Commercial Kernel Goals
  const evaluation = evaluateOpportunity(snapshot, config);

  // 4. Plan transition intents
  const intents = planTransition(snapshot, evaluation, config);

  // 5. Apply real CRM mutations synchronously
  const correlationKey = `cc_${Date.now()}_${snapshot.opportunityKey}`;
  const applyRes = await hsAdapter.applyTransitionIntents(intents, correlationKey);

  let status: CustomCodeCallbackResult['outputFields']['status'] = 'UPDATED_EXISTING';
  if (evaluation.qualificationState === 'BLOCKED') status = 'BLOCKED';
  else if (evaluation.qualificationState === 'MANUAL_REVIEW') status = 'MANUAL_REVIEW';
  else if (intents.some(i => i.kind === 'CREATE_SUCCESSOR')) status = 'CREATED_SUCCESSOR';
  else if (intents.every(i => i.kind === 'NOOP')) status = 'NO_CHANGE';

  logger.info('Stateless HubSpot Custom Code Action executed successfully', {
    objectId,
    objectType,
    opportunityKey: snapshot.opportunityKey,
    qualificationState: evaluation.qualificationState,
    appliedIntentsCount: applyRes.appliedIntents
  });

  return {
    outputFields: {
      status,
      opportunityKey: snapshot.opportunityKey,
      qualificationState: evaluation.qualificationState,
      appliedIntentsCount: applyRes.appliedIntents,
      verified: true
    }
  };
}

// HubSpot Custom Code Action standard export
export async function main(event: HubSpotCustomCodeEvent, callback?: (res: CustomCodeCallbackResult) => void) {
  try {
    const result = await processHubSpotCustomCodeAction(event);
    if (callback) {
      callback(result);
    }
    return result;
  } catch (err: any) {
    logger.error('HubSpot Custom Code Action execution error', err);
    throw err; // Throw error so HubSpot Workflow retries action natively!
  }
}
