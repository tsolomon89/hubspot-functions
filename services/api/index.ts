import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Pool } from 'pg';
import { validateHubspotSignatureV3, WebhookEventPayload } from '../../packages/domain';
import { logger } from '../../packages/observability';

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
    await dbPool.query('SELECT 1');
    return reply.status(200).send({ ready: true, db: true });
  } catch (err: any) {
    logger.error('Database readiness check failed', err);
    return reply.status(503).send({ ready: false, db: false, error: 'Database connection unavailable' });
  }
});

function getCompleteUrl(request: FastifyRequest): string {
  const proto = (request.headers['x-forwarded-proto'] as string) || 'https';
  const host = (request.headers['x-forwarded-host'] as string) || (request.headers['host'] as string) || request.hostname;
  return `${proto}://${host}${request.raw.url}`;
}

server.post('/webhooks/hubspot', async (request: FastifyRequest, reply: FastifyReply) => {
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
  
  if (!clientSecret && process.env.NODE_ENV === 'production') {
    logger.error('HUBSPOT_CLIENT_SECRET missing in production environment');
    return reply.status(500).send({ error: 'Internal Server Error: Security configuration missing' });
  }

  const signature = request.headers['x-hubspot-signature-v3'] as string;
  const timestamp = request.headers['x-hubspot-request-timestamp'] as string;
  const rawBodyBuffer = (request as any).rawBodyBuffer || Buffer.from(JSON.stringify(request.body));
  const completeUrl = getCompleteUrl(request);

  if (clientSecret) {
    const isValid = validateHubspotSignatureV3(
      clientSecret,
      signature,
      request.method,
      completeUrl,
      rawBodyBuffer,
      timestamp
    );

    if (!isValid) {
      logger.warn('Rejected invalid HubSpot webhook signature v3', { completeUrl, timestamp });
      return reply.status(401).send({ error: 'Unauthorized: Invalid signature' });
    }
  }

  const events = Array.isArray(request.body) ? (request.body as WebhookEventPayload[]) : [];
  let persistedCount = 0;

  // Transactional Ingress: Write into inbox AND enqueue job in a single transaction
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    for (const event of events) {
      // 1. Insert into inbox
      const inboxQuery = `
        INSERT INTO hubspot_event_inbox 
          (event_id, subscription_type, object_id, portal_id, occurred_at, raw_payload, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')
        ON CONFLICT (event_id, occurred_at) DO NOTHING;
      `;
      const inboxValues = [
        String(event.eventId),
        event.subscriptionType,
        event.objectId,
        event.portalId || 0,
        event.occurredAt,
        JSON.stringify(event)
      ];
      const res = await client.query(inboxQuery, inboxValues);
      
      if (res.rowCount && res.rowCount > 0) {
        persistedCount++;
        // 2. Enqueue job transactionally
        const jobQuery = `
          INSERT INTO hubspot_jobs (job_type, record_id, payload, status)
          VALUES ($1, $2, $3, 'QUEUED');
        `;
        await client.query(jobQuery, [
          `WEBHOOK_${event.subscriptionType.toUpperCase()}`,
          String(event.objectId),
          JSON.stringify(event)
        ]);
      }
    }
    await client.query('COMMIT');
  } catch (err: any) {
    await client.query('ROLLBACK');
    logger.error('Failed to transactionally persist webhook events', err);
    return reply.status(500).send({ error: 'Internal Server Error: Ingress persistence failed' });
  } finally {
    client.release();
  }

  logger.info('Durable webhook receipt acknowledged', { total: events.length, persistedCount });

  // Fast ACK (< 2 seconds) only after successful DB transaction
  return reply.status(200).send({ acknowledged: true, count: events.length, persistedCount });
});

server.post('/workflow-actions/reconcile', async (request: FastifyRequest, reply: FastifyReply) => {
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
  const signature = request.headers['x-hubspot-signature-v3'] as string;
  const timestamp = request.headers['x-hubspot-request-timestamp'] as string;
  const rawBodyBuffer = (request as any).rawBodyBuffer || Buffer.from(JSON.stringify(request.body));
  const completeUrl = getCompleteUrl(request);

  if (clientSecret) {
    const isValid = validateHubspotSignatureV3(
      clientSecret,
      signature,
      request.method,
      completeUrl,
      rawBodyBuffer,
      timestamp
    );

    if (!isValid) {
      return reply.status(401).send({ error: 'Unauthorized: Invalid signature' });
    }
  }

  const payload: any = request.body || {};
  const recordId = payload.inputFields?.recordId || payload.object?.objectId || 'unknown';

  // Transactionally persist job
  try {
    await dbPool.query(
      `INSERT INTO hubspot_jobs (job_type, record_id, payload, status) VALUES ($1, $2, $3, $4)`,
      ['RECONCILE_RECORD', String(recordId), JSON.stringify(payload), 'QUEUED']
    );
  } catch (err: any) {
    logger.error('Failed to enqueue workflow action job', err);
    return reply.status(500).send({ error: 'Internal Server Error: Job queueing failed' });
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
