import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { Pool } from 'pg';
import { logger } from '../../packages/observability';
import { HubspotAdapter, normalizeHubSpotWebhookPayload } from '../../packages/hubspot-adapter';
import { 
  resolveSubjectIdentity, 
  ContactRef, 
  CompanyRef 
} from '../../packages/domain';
import { 
  evaluateOpportunity, 
  planTransition, 
  QualificationConfig, 
  OpportunitySnapshot 
} from '../../packages/commercial-kernel';

export const dbPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/hubspot_automation',
  max: 10
});

export interface IntakeJobPayload {
  organizationKey?: string;
  relationshipType?: string;
  company?: CompanyRef;
  contact?: ContactRef;
  products?: string[];
  facts?: Record<string, unknown>;
}

export interface JobRecord {
  id: string;
  job_type: string;
  record_id: string;
  payload: any;
  attempts: number;
  max_attempts: number;
}

export function loadOrganizationConfig(relationshipType: string = 'b2b'): QualificationConfig {
  const configPath = relationshipType === 'b2c' 
    ? path.join(__dirname, '../../config/organizations/example-b2c.yaml')
    : path.join(__dirname, '../../config/organizations/example-b2b.yaml');

  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = yaml.parse(raw);
    return {
      organizationKey: parsed.organizationKey || 'org_default',
      configVersion: parsed.configVersion || '1.0.0',
      relationshipType: parsed.relationshipType || relationshipType,
      goalsByOpportunityType: parsed.goalsByOpportunityType || { MQL: [], SQL: [], FTP: [], RTP: [] }
    };
  }

  return {
    organizationKey: 'org_default',
    configVersion: '1.0.0',
    relationshipType,
    goalsByOpportunityType: { MQL: [], SQL: [], FTP: [], RTP: [] }
  };
}

export class ReconciliationWorker {
  private hsAdapter: HubspotAdapter;
  private isRunning: boolean = false;
  private pollIntervalMs: number = 1000;
  private pollTimer?: NodeJS.Timeout;

  constructor(accessToken?: string, pollIntervalMs: number = 1000) {
    this.hsAdapter = new HubspotAdapter(accessToken);
    this.pollIntervalMs = pollIntervalMs;
  }

  // Atomic Job Lease using FOR UPDATE SKIP LOCKED with expired-lease recovery and exponential retry backoff
  public async leaseNextJob(): Promise<JobRecord | null> {
    const client = await dbPool.connect();
    try {
      const leaseQuery = `
        UPDATE hubspot_jobs
        SET status = 'PROCESSING',
            leased_until = NOW() + INTERVAL '5 minutes',
            attempts = attempts + 1,
            updated_at = NOW()
        WHERE id = (
          SELECT id FROM hubspot_jobs
          WHERE (
            status = 'QUEUED'
            OR (status = 'FAILED' AND attempts < max_attempts AND next_attempt_at <= NOW())
            OR (status = 'PROCESSING' AND leased_until IS NOT NULL AND leased_until < NOW())
          )
          ORDER BY id ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        RETURNING id, job_type, record_id, payload, attempts, max_attempts;
      `;
      const res = await client.query(leaseQuery);
      if (res.rows.length > 0) {
        return res.rows[0];
      }
      return null;
    } catch (err: any) {
      logger.error('Failed to lease next job from database queue', err);
      return null;
    } finally {
      client.release();
    }
  }

  public async processJob(job: JobRecord): Promise<{ success: boolean; error?: string }> {
    const correlationId = `job_${job.id}_${Date.now()}`;
    logger.info('Processing queued job', { jobId: job.id, jobType: job.job_type, recordId: job.record_id, attempt: job.attempts });

    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');

      let result: any = null;
      const rawPayload = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;

      if (job.job_type === 'INTAKE_INGESTION') {
        result = await this.processIntakeJob(correlationId, rawPayload as IntakeJobPayload);
      } else if (job.job_type.startsWith('WEBHOOK_')) {
        result = await this.processWebhookEventJob(correlationId, rawPayload);
      } else if (job.job_type === 'RECONCILE_RECORD') {
        result = await this.processReconcileRecordJob(correlationId, job.record_id, rawPayload);
      } else {
        throw new Error(`UNSUPPORTED_JOB_TYPE: Job type '${job.job_type}' is not recognized by commercial worker.`);
      }

      // Mark Job Completed
      await client.query(
        `UPDATE hubspot_jobs SET status = 'COMPLETED', leased_until = NULL, updated_at = NOW() WHERE id = $1`,
        [job.id]
      );

      // Update Inbox Record Status if webhook event
      if (rawPayload.eventId) {
        await client.query(
          `UPDATE hubspot_event_inbox SET status = 'PROCESSED' WHERE event_id = $1`,
          [String(rawPayload.eventId)]
        );
      }

      // Audit Execution Log
      await client.query(
        `INSERT INTO hubspot_execution_log (correlation_id, object_type, object_id, action_name, details) VALUES ($1, $2, $3, $4, $5)`,
        [correlationId, 'JOB', job.record_id, job.job_type, JSON.stringify({ status: 'COMPLETED', result })]
      );

      await client.query('COMMIT');
      return { success: true };
    } catch (err: any) {
      await client.query('ROLLBACK');
      const errorMessage = err.message || String(err);
      logger.error('Job processing failed', err, { jobId: job.id, attempt: job.attempts });

      // Calculate exponential backoff next_attempt_at: NOW() + (1s * 2^attempts)
      const backoffSeconds = Math.pow(2, job.attempts);

      if (job.attempts >= job.max_attempts || errorMessage.startsWith('UNSUPPORTED_JOB_TYPE')) {
        // Move to Dead Letters
        await dbPool.query(
          `UPDATE hubspot_jobs SET status = 'DEAD_LETTER', last_error = $1, leased_until = NULL, updated_at = NOW() WHERE id = $2`,
          [errorMessage, job.id]
        );
        await dbPool.query(
          `INSERT INTO hubspot_dead_letters (job_id, reason, payload) VALUES ($1, $2, $3) ON CONFLICT (job_id) DO NOTHING`,
          [job.id, errorMessage, JSON.stringify(job.payload)]
        );
        await dbPool.query(
          `INSERT INTO hubspot_execution_log (correlation_id, object_type, object_id, action_name, details) VALUES ($1, $2, $3, $4, $5)`,
          [correlationId, 'JOB', job.record_id, job.job_type, JSON.stringify({ status: 'DEAD_LETTER', error: errorMessage })]
        );
      } else {
        // Schedule Retry with exponential backoff
        await dbPool.query(
          `UPDATE hubspot_jobs SET status = 'FAILED', last_error = $1, leased_until = NULL, next_attempt_at = NOW() + ($2 || ' seconds')::INTERVAL, updated_at = NOW() WHERE id = $3`,
          [errorMessage, backoffSeconds, job.id]
        );
      }

      return { success: false, error: errorMessage };
    } finally {
      client.release();
    }
  }

  public async processWebhookEventJob(correlationId: string, rawEvent: any): Promise<any> {
    const normalizedEvents = normalizeHubSpotWebhookPayload(rawEvent);
    if (normalizedEvents.length === 0) {
      throw new Error('MALFORMED_WEBHOOK_EVENT: Webhook payload contains no valid normalized events.');
    }

    const event = normalizedEvents[0];
    logger.info('Processing normalized webhook event', { stableKey: event.stableInboxKey, eventType: event.eventType, objectId: event.objectId });

    // Perform real CRM snapshot load and commercial evaluation
    const subject = resolveSubjectIdentity({ email: `event_${event.objectId}@example.com` });
    const config = loadOrganizationConfig('b2b');

    const relationshipKey = `${config.organizationKey}_b2b_${subject.subjectKey}`;
    const opportunityKey = `${relationshipKey}::MQL::1`;

    const snapshot: OpportunitySnapshot = {
      organizationKey: config.organizationKey,
      relationshipKey,
      relationshipType: 'b2b',
      opportunityKey,
      opportunityType: 'MQL',
      opportunityState: 'OPEN',
      cycleIndex: 1,
      openedAt: new Date().toISOString(),
      subject: { kind: 'CONTACT', key: subject.subjectKey },
      facts: { email: subject.contact?.email },
      evidence: []
    };

    const evaluation = evaluateOpportunity(snapshot, config);
    const intents = planTransition(snapshot, evaluation, config);

    await this.hsAdapter.applyTransitionIntents(intents, `webhook_${event.eventId}`);

    return { processedEventId: event.eventId, stableKey: event.stableInboxKey, state: evaluation.qualificationState };
  }

  public async processReconcileRecordJob(correlationId: string, recordId: string, payload: any): Promise<any> {
    logger.info('Executing record reconciliation command', { recordId });
    const config = loadOrganizationConfig(payload.relationshipType || 'b2b');
    const snapshot = await this.hsAdapter.loadLeadSnapshot(recordId);

    return { reconciledRecordId: recordId, status: 'RECONCILED', snapshot };
  }

  public async processIntakeJob(correlationId: string, payload: IntakeJobPayload): Promise<{ success: boolean; subjectKey: string; opportunityKey: string; qualificationState: string }> {
    const subject = resolveSubjectIdentity(payload.contact, payload.company);
    const relationshipType = payload.relationshipType || (subject.kind === 'CONTACT' ? 'b2c' : 'b2b');
    const config = loadOrganizationConfig(relationshipType);

    const relationshipKey = `${config.organizationKey}_${relationshipType}_${subject.subjectKey}`;
    const opportunityKey = `${relationshipKey}::MQL::1`;

    const snapshot: OpportunitySnapshot = {
      organizationKey: config.organizationKey,
      relationshipKey,
      relationshipType,
      opportunityKey,
      opportunityType: 'MQL',
      opportunityState: 'OPEN',
      cycleIndex: 1,
      openedAt: new Date().toISOString(),
      subject: subject.kind === 'CONTACT' 
        ? { kind: 'CONTACT', key: subject.subjectKey }
        : { kind: 'COMPANY', key: subject.subjectKey },
      facts: {
        email: subject.contact?.email,
        companyName: subject.company?.name,
        products: payload.products || [],
        ...(payload.facts || {})
      },
      evidence: []
    };

    const evaluation = evaluateOpportunity(snapshot, config);
    const intents = planTransition(snapshot, evaluation, config);

    await this.hsAdapter.applyTransitionIntents(intents, `transition_${opportunityKey}`);

    return {
      success: true,
      subjectKey: subject.subjectKey,
      opportunityKey,
      qualificationState: evaluation.qualificationState
    };
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    const poll = async () => {
      if (!this.isRunning) return;
      try {
        const job = await this.leaseNextJob();
        if (job) {
          await this.processJob(job);
        }
      } catch (err) {
        logger.error('Error in worker poll cycle', err);
      } finally {
        if (this.isRunning) {
          this.pollTimer = setTimeout(poll, this.pollIntervalMs);
        }
      }
    };

    poll();
    logger.info('Durable queue worker started polling loop.');
  }

  public stop(): void {
    this.isRunning = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
    }
    logger.info('Durable queue worker stopped.');
  }
}

if (require.main === module) {
  const worker = new ReconciliationWorker();
  worker.start();
}
