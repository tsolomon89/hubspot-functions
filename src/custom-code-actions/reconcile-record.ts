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
    objectId?: number | string;
    id?: number | string;
    objectType?: string; // Documented HubSpot values: 'CONTACT', 'COMPANY', 'DEAL', 'LEAD'
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
  
  // Extract enrolled Record ID using documented event.object.objectId first!
  const objectId = String(event.object?.objectId || event.object?.id || event.inputFields?.recordId || '0');
  if (!objectId || objectId === '0') {
    throw new Error('INVALID_ENROLLMENT: Missing valid record ID in HubSpot Custom Code Action event.');
  }

  // Extract enrolled Object Type using documented uppercase objectType strings ('CONTACT', 'COMPANY', 'DEAL', 'LEAD')
  let objectType: 'contact' | 'company' | 'lead' | 'deal' = 'contact';
  const rawType = String(event.object?.objectType || event.inputFields?.objectType || 'CONTACT').toUpperCase();

  switch (rawType) {
    case 'CONTACT':
    case '0-1':
      objectType = 'contact';
      break;
    case 'COMPANY':
    case '0-2':
      objectType = 'company';
      break;
    case 'DEAL':
    case '0-3':
      objectType = 'deal';
      break;
    case 'LEAD':
    case '0-5':
      objectType = 'lead';
      break;
    default:
      if (event.inputFields?.objectType) {
        objectType = event.inputFields.objectType;
      }
      break;
  }

  const token = accessToken || process.env.HUBSPOT_ACCESS_TOKEN || process.env.HUBSPOT_DEVELOPMENT_PERSONAL_ACCESS_KEY;
  const hsAdapter = new HubspotAdapter(token);
  const configResolver = new OrganizationConfigResolver();
  const snapshotLoader = new HubSpotSnapshotLoader(hsAdapter);

  // 1. Resolve Organization Configuration (Pure In-Memory)
  const config = configResolver.resolveConfig({
    portalId,
    organizationKey: event.inputFields?.organizationKey,
    relationshipType: event.inputFields?.relationshipType
  });

  // 2. Load pure OpportunitySnapshot directly from HubSpot CRM API
  const snapshot = await snapshotLoader.loadSnapshotFromRecord(
    { objectType, objectId },
    config.organizationKey,
    config.relationshipType,
    config
  );

  // 3. Evaluate Commercial Kernel Goals
  const evaluation = evaluateOpportunity(snapshot, config);

  // 4. Plan transition intents
  const intents = planTransition(snapshot, evaluation, config);

  // 5. Apply real CRM mutations synchronously
  const correlationKey = `cc_${Date.now()}_${snapshot.opportunityKey}`;
  const applyRes = await hsAdapter.applyTransitionIntents(intents, correlationKey, config);

  let status: CustomCodeCallbackResult['outputFields']['status'] = 'UPDATED_EXISTING';
  if (evaluation.qualificationState === 'BLOCKED') status = 'BLOCKED';
  else if (evaluation.qualificationState === 'MANUAL_REVIEW') status = 'MANUAL_REVIEW';
  else if (intents.some(i => i.kind === 'CREATE_SUCCESSOR')) status = 'CREATED_SUCCESSOR';
  else if (intents.every(i => i.kind === 'NOOP')) status = 'NO_CHANGE';

  const verified = applyRes.success && applyRes.receipts.length > 0 && applyRes.receipts.every(r => r.verified);

  if (!verified) {
    throw new Error(`ACTION_UNVERIFIED: Action execution produced unverified mutation receipts. Applied: ${applyRes.appliedIntents}`);
  }

  logger.info('Stateless HubSpot Custom Code Action executed successfully', {
    objectId,
    objectType,
    opportunityKey: snapshot.opportunityKey,
    qualificationState: evaluation.qualificationState,
    appliedIntentsCount: applyRes.appliedIntents,
    verified
  });

  return {
    outputFields: {
      status,
      opportunityKey: snapshot.opportunityKey,
      qualificationState: evaluation.qualificationState,
      appliedIntentsCount: applyRes.appliedIntents,
      verified
    }
  };
}

// HubSpot Custom Code Action deployable entry point contract: exports.main
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
