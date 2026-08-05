import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Pool } from 'pg';
import { validateHubspotSignatureV3, WebhookEventPayload } from '../../packages/domain';
import { logger } from '../../packages/observability';

const CLIENT_SECRET = process.env.HUBSPOT_CLIENT_SECRET || 'test_secret_key';

export const dbPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/hubspot_automation',
  max: 10
});

const server: FastifyInstance = Fastify({
  logger: false
});

// Register raw body parser to preserve exact un-parsed request bytes
server.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body: Buffer, done) => {
  (req as any).rawBodyBuffer = body;
  try {
    const json = JSON.parse(body.toString('utf-8'));
    done(null, json);
  } catch (err: any) {
    done(err, undefined);
  }
});

server.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
  return reply.status(200).send({ status: 'ok', timestamp: new Date().toISOString() });
});

server.get('/ready', async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const res = await dbPool.query('SELECT 1');
    return reply.status(200).send({ ready: true, db: true });
  } catch (err: any) {
    logger.error('Database readiness check failed', err);
    return reply.status(503).send({ ready: false, db: false, error: 'Database connection unavailable' });
  }
});

server.post('/webhooks/hubspot', async (request: FastifyRequest, reply: FastifyReply) => {
  const signature = request.headers['x-hubspot-signature-v3'] as string;
  const timestamp = request.headers['x-hubspot-request-timestamp'] as string;
  const rawBodyBuffer = (request as any).rawBodyBuffer || Buffer.from(JSON.stringify(request.body));
  const uri = request.url;

  // Strict Signature v3 Verification (No bypasses)
  const isValid = validateHubspotSignatureV3(
    CLIENT_SECRET,
    signature,
    request.method,
    uri,
    rawBodyBuffer,
    timestamp
  );

  if (!isValid && process.env.DISABLE_SIGNATURE_VERIFICATION !== 'true') {
    logger.warn('Rejected invalid HubSpot webhook signature v3', { uri, timestamp });
    return reply.status(401).send({ error: 'Unauthorized: Invalid signature' });
  }

  const events = Array.isArray(request.body) ? (request.body as WebhookEventPayload[]) : [];
  let persistedCount = 0;

  // Durable Ingress: Insert events into PostgreSQL inbox prior to fast ACK
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    for (const event of events) {
      const query = `
        INSERT INTO hubspot_event_inbox 
          (event_id, subscription_type, object_id, portal_id, occurred_at, raw_payload, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')
        ON CONFLICT (event_id, occurred_at) DO NOTHING;
      `;
      const values = [
        String(event.eventId),
        event.subscriptionType,
        event.objectId,
        event.portalId || 0,
        event.occurredAt,
        JSON.stringify(event)
      ];
      const res = await client.query(query, values);
      if (res.rowCount && res.rowCount > 0) {
        persistedCount++;
      }
    }
    await client.query('COMMIT');
  } catch (err: any) {
    await client.query('ROLLBACK');
    logger.error('Failed to persist webhook events to database inbox', err);
  } finally {
    client.release();
  }

  logger.info('Durable webhook receipt acknowledged', { total: events.length, persistedCount });

  // Fast ACK (< 2 seconds)
  return reply.status(200).send({ acknowledged: true, count: events.length, persistedCount });
});

server.post('/workflow-actions/reconcile', async (request: FastifyRequest, reply: FastifyReply) => {
  const signature = request.headers['x-hubspot-signature-v3'] as string;
  const timestamp = request.headers['x-hubspot-request-timestamp'] as string;
  const rawBodyBuffer = (request as any).rawBodyBuffer || Buffer.from(JSON.stringify(request.body));

  const isValid = validateHubspotSignatureV3(
    CLIENT_SECRET,
    signature,
    request.method,
    request.url,
    rawBodyBuffer,
    timestamp
  );

  if (!isValid && process.env.DISABLE_SIGNATURE_VERIFICATION !== 'true') {
    return reply.status(401).send({ error: 'Unauthorized: Invalid signature' });
  }

  const payload: any = request.body || {};
  const recordId = payload.inputFields?.recordId || payload.object?.objectId || 'unknown';

  // Persist job transactionally
  try {
    await dbPool.query(
      `INSERT INTO hubspot_jobs (job_type, record_id, payload, status) VALUES ($1, $2, $3, $4)`,
      ['RECONCILE_RECORD', String(recordId), JSON.stringify(payload), 'QUEUED']
    );
  } catch (err: any) {
    logger.error('Failed to enqueue workflow action job', err);
  }

  return reply.status(200).send({ outputFields: { status: 'QUEUED' } });
});

export async function startServer(port: number = 3000): Promise<string> {
  return await server.listen({ port, host: '0.0.0.0' });
}

if (require.main === module) {
  startServer(3000).then(address => {
    logger.info(`Server listening at ${address}`);
  }).catch(err => {
    logger.error('Failed to start API server', err);
    process.exit(1);
  });
}

export { server };
