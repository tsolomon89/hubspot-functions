import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { HubspotAdapter, HubSpotSnapshotLoader } from '../../packages/hubspot-adapter';
import { OrganizationConfigResolver, validateHubspotSignatureV3 } from '../../packages/domain';
import { evaluateOpportunity, planTransition } from '../../packages/commercial-kernel';
import { logger } from '../../packages/observability';

export interface ReconcileRequest {
  portalId: string;
  objectType: 'contact' | 'company' | 'lead' | 'deal';
  objectId: string;
  organizationKey?: string;
  relationshipType?: string;
  dryRun?: boolean;
}

export interface ReconcileResponse {
  status: 'NO_CHANGE' | 'UPDATED_EXISTING' | 'CREATED_SUCCESSOR' | 'BLOCKED' | 'MANUAL_REVIEW' | 'FAILED_RETRYABLE' | 'FAILED_TERMINAL';
  opportunityKey: string;
  qualificationState: string;
  appliedIntentsCount: number;
  verified: boolean;
  error?: string;
}

export function buildServer(accessToken?: string): FastifyInstance {
  const server = Fastify({ logger: false });
  const hsAdapter = new HubspotAdapter(accessToken || process.env.HUBSPOT_ACCESS_TOKEN || process.env.HUBSPOT_DEVELOPMENT_PERSONAL_ACCESS_KEY);
  const configResolver = new OrganizationConfigResolver();
  const snapshotLoader = new HubSpotSnapshotLoader(hsAdapter);

  // Health check endpoint
  server.get('/health', async () => {
    return { status: 'OK', runtime: 'stateless-workflow-actions', timestamp: new Date().toISOString() };
  });

  // Stateless Workflow Action Reconciliation Endpoint
  server.post('/workflow-actions/reconcile', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const body = (request.body || {}) as Partial<ReconcileRequest>;

    logger.info('Stateless workflow action reconciliation requested', { correlationId, body });

    // Validate Signature V3 if client secret configured
    const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
    if (clientSecret) {
      const signature = request.headers['x-hubspot-signature-v3'] as string;
      const timestamp = request.headers['x-hubspot-request-timestamp'] as string;
      const isValid = validateHubspotSignatureV3(
        clientSecret,
        signature,
        request.method,
        request.url,
        JSON.stringify(request.body || {}),
        timestamp
      );
      if (!isValid) {
        reply.code(401);
        return { status: 'FAILED_TERMINAL', error: 'INVALID_SIGNATURE: HubSpot Signature V3 verification failed.' };
      }
    }

    if (!body.objectId || !body.objectType) {
      reply.code(400);
      return { status: 'FAILED_TERMINAL', error: 'BAD_REQUEST: Missing required objectId or objectType.' };
    }

    try {
      // 1. Resolve Organization and Relationship Type Configuration
      const config = configResolver.resolveConfig({
        portalId: body.portalId,
        organizationKey: body.organizationKey,
        relationshipType: body.relationshipType
      });

      // 2. Reconstruct pure OpportunitySnapshot directly from HubSpot CRM (Zero DB!)
      const snapshot = await snapshotLoader.loadSnapshotFromRecord(
        { objectType: body.objectType, objectId: String(body.objectId) },
        config.organizationKey,
        config.relationshipType
      );

      // 3. Evaluate pure Commercial Kernel goals
      const evaluation = evaluateOpportunity(snapshot, config);

      // 4. Plan transition intents
      const intents = planTransition(snapshot, evaluation, config);

      // 5. Apply real HubSpot CRM mutations synchronously if not dryRun
      let appliedIntentsCount = 0;
      if (!body.dryRun) {
        const applyRes = await hsAdapter.applyTransitionIntents(intents, `action_${correlationId}`);
        appliedIntentsCount = applyRes.appliedIntents;
      }

      // 6. Determine final response status
      let status: ReconcileResponse['status'] = 'UPDATED_EXISTING';
      if (evaluation.qualificationState === 'BLOCKED') status = 'BLOCKED';
      else if (evaluation.qualificationState === 'MANUAL_REVIEW') status = 'MANUAL_REVIEW';
      else if (intents.some(i => i.kind === 'CREATE_SUCCESSOR')) status = 'CREATED_SUCCESSOR';
      else if (intents.every(i => i.kind === 'NOOP')) status = 'NO_CHANGE';

      reply.code(200);
      return {
        status,
        opportunityKey: snapshot.opportunityKey,
        qualificationState: evaluation.qualificationState,
        appliedIntentsCount,
        verified: true
      };
    } catch (err: any) {
      const errorMsg = err.message || String(err);
      logger.error('Stateless workflow action execution failed', err, { correlationId });

      const isTerminal = errorMsg.startsWith('UNSUPPORTED_') || errorMsg.startsWith('INVALID_') || errorMsg.startsWith('BAD_REQUEST');
      reply.code(isTerminal ? 400 : 500);
      return {
        status: isTerminal ? 'FAILED_TERMINAL' : 'FAILED_RETRYABLE',
        opportunityKey: 'unknown',
        qualificationState: 'FAILED',
        appliedIntentsCount: 0,
        verified: false,
        error: errorMsg
      };
    }
  });

  return server;
}

if (require.main === module) {
  const port = parseInt(process.env.PORT || '3000', 10);
  const server = buildServer();
  server.listen({ port, host: '0.0.0.0' }, (err, address) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(`Stateless Commercial Operations Server listening at ${address}`);
  });
}
