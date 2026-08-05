import { Pool } from 'pg';
import { logger } from '../../packages/observability';
import { HubspotClientWrapper } from '../../packages/hubspot-client';
import { 
  resolveIdentity, 
  createInitialProductDeal, 
  validateProductKey,
  createAmbiguousProductReviewTask,
  requiresActivationTask, 
  createActivationTask,
  CompanyInput,
  ContactInput,
  ManualReviewTask
} from '../../packages/domain';

export const dbPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/hubspot_automation',
  max: 10
});

export interface IntakeJobPayload {
  company: CompanyInput;
  contact: ContactInput;
  products: string[];
  pipeline?: 'b2b_pipeline' | 'partnership_pipeline';
  role?: 'Decision Maker' | 'End User' | 'Influencer';
}

export interface JobRecord {
  id: string;
  job_type: string;
  record_id: string;
  payload: any;
  attempts: number;
  max_attempts: number;
}

export class ReconciliationWorker {
  private hsClient: HubspotClientWrapper;
  private isRunning: boolean = false;
  private pollIntervalMs: number = 1000;
  private pollTimer?: NodeJS.Timeout;

  constructor(accessToken?: string, pollIntervalMs: number = 1000) {
    this.hsClient = new HubspotClientWrapper(accessToken);
    this.pollIntervalMs = pollIntervalMs;
  }

  // Lease next available job, reclaiming crashed processing jobs whose lease expired
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
            OR (status = 'FAILED' AND attempts < max_attempts AND updated_at < NOW() - INTERVAL '1 minute')
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

    try {
      let result: any = null;
      const rawPayload = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;

      if (job.job_type === 'INTAKE_INGESTION') {
        result = await this.processIntakeJob(correlationId, rawPayload as IntakeJobPayload);
      } else if (job.job_type.startsWith('WEBHOOK_')) {
        result = await this.processWebhookEventJob(correlationId, rawPayload);
      } else if (job.job_type === 'RECONCILE_RECORD') {
        result = await this.processReconcileRecordJob(correlationId, job.record_id, rawPayload);
      }

      // Mark Job Completed
      await dbPool.query(
        `UPDATE hubspot_jobs SET status = 'COMPLETED', leased_until = NULL, updated_at = NOW() WHERE id = $1`,
        [job.id]
      );

      // Update Inbox Record Status if webhook event
      if (rawPayload.eventId) {
        await dbPool.query(
          `UPDATE hubspot_event_inbox SET status = 'PROCESSED' WHERE event_id = $1`,
          [String(rawPayload.eventId)]
        );
      }

      // Audit Execution Log
      await dbPool.query(
        `INSERT INTO hubspot_execution_log (correlation_id, object_type, object_id, action_name, details) VALUES ($1, $2, $3, $4, $5)`,
        [correlationId, 'JOB', job.record_id, job.job_type, JSON.stringify({ status: 'COMPLETED', result })]
      );

      return { success: true };
    } catch (err: any) {
      const errorMessage = err.message || String(err);
      logger.error('Job processing failed', err, { jobId: job.id, attempt: job.attempts });

      if (job.attempts >= job.max_attempts) {
        // Move to Dead Letters
        await dbPool.query(
          `UPDATE hubspot_jobs SET status = 'DEAD_LETTER', last_error = $1, leased_until = NULL, updated_at = NOW() WHERE id = $2`,
          [errorMessage, job.id]
        );
        await dbPool.query(
          `INSERT INTO hubspot_dead_letters (job_id, reason, payload) VALUES ($1, $2, $3)`,
          [job.id, errorMessage, JSON.stringify(job.payload)]
        );
        await dbPool.query(
          `INSERT INTO hubspot_execution_log (correlation_id, object_type, object_id, action_name, details) VALUES ($1, $2, $3, $4, $5)`,
          [correlationId, 'JOB', job.record_id, job.job_type, JSON.stringify({ status: 'DEAD_LETTER', error: errorMessage })]
        );
      } else {
        // Schedule Retry with backoff
        await dbPool.query(
          `UPDATE hubspot_jobs SET status = 'FAILED', last_error = $1, leased_until = NULL, updated_at = NOW() WHERE id = $2`,
          [errorMessage, job.id]
        );
      }

      return { success: false, error: errorMessage };
    }
  }

  public async processWebhookEventJob(correlationId: string, event: any): Promise<any> {
    const objectId = event.objectId;
    const subscriptionType = (event.subscriptionType || '').toLowerCase();

    if (subscriptionType.startsWith('contact')) {
      const contact = await this.hsClient.getContactById(objectId);
      if (contact && contact.properties?.email) {
        const email = contact.properties.email;
        const companyName = contact.properties.company || email.split('@')[1] || 'Unknown Company';
        return await this.processIntakeJob(correlationId, {
          company: { name: companyName, domain: email.split('@')[1] },
          contact: { email, firstName: contact.properties.firstname, lastName: contact.properties.lastname },
          products: ['jurnii_360']
        });
      }
    } else if (subscriptionType.startsWith('company')) {
      const company = await this.hsClient.getCompanyById(objectId);
      if (company && company.properties?.company_key) {
        logger.info('Reconciled company from webhook event', { companyKey: company.properties.company_key });
        return { reconciledCompany: company.properties.company_key };
      }
    }

    return { processedEvent: event.eventId, subscriptionType };
  }

  public async processReconcileRecordJob(correlationId: string, recordId: string, payload: any): Promise<any> {
    logger.info('Executing workflow action record reconciliation', { recordId });
    return { reconciledRecordId: recordId, payload };
  }

  public async processIntakeJob(correlationId: string, payload: IntakeJobPayload): Promise<{ success: boolean; createdDeals: string[]; taskCreated: boolean }> {
    // 1. Resolve Contact & Company identity
    const resolvedIdentity = resolveIdentity(payload.company, payload.contact);

    // 2. Race-Safe Upsert Company and Contact records
    const companyId = await this.hsClient.upsertCompany(resolvedIdentity);
    const contactId = await this.hsClient.upsertContact(resolvedIdentity);

    // Associate Contact to Company
    await this.hsClient.associateContactToCompany(contactId, companyId);

    const createdDeals: string[] = [];
    const ambiguousProductDeals: string[] = [];

    // 3. For each product of interest, validate and create/upsert Deal
    for (const rawProduct of payload.products) {
      const validation = validateProductKey(rawProduct);

      if (validation.ambiguous) {
        ambiguousProductDeals.push(rawProduct);
        const reviewTask = createAmbiguousProductReviewTask({
          companyKey: resolvedIdentity.companyKey,
          companyName: resolvedIdentity.companyName,
          productKey: rawProduct,
          contactEmail: resolvedIdentity.contactEmail
        }, rawProduct);

        await this.hsClient.createManualReviewTask(reviewTask, contactId);
        logger.warn('Raised manual review task for ambiguous product', { rawProduct, contactEmail: resolvedIdentity.contactEmail });
        continue;
      }

      const initialDeal = createInitialProductDeal({
        companyKey: resolvedIdentity.companyKey,
        companyName: resolvedIdentity.companyName,
        productKey: rawProduct,
        contactEmail: resolvedIdentity.contactEmail,
        pipeline: payload.pipeline,
        role: payload.role
      });

      const dealId = await this.hsClient.upsertProductDeal(initialDeal, companyId);
      createdDeals.push(dealId);

      // Associate Contact to Deal
      if (payload.role) {
        await this.hsClient.associateContactToDeal(contactId, dealId, payload.role);
      }
    }

    // 4. Sequence Activation Gate Logic (B2B Pipeline only)
    let taskCreated = false;

    if (payload.pipeline !== 'partnership_pipeline' && payload.role === 'Decision Maker') {
      if (createdDeals.length > 1) {
        // Multi-Product Ambiguity for Decision Maker: Raise multi_product_sequence_ambiguous review task
        const reviewTask: ManualReviewTask = {
          subject: `[Manual Review] Multi-product sequence ambiguous for ${resolvedIdentity.companyName}`,
          taskCode: 'multi_product_sequence_ambiguous',
          dealKey: resolvedIdentity.companyKey,
          contactEmail: resolvedIdentity.contactEmail,
          reason: `Decision maker registered with ${createdDeals.length} valid product deals. Human rep must select primary sequence target.`
        };
        await this.hsClient.createManualReviewTask(reviewTask, contactId);
        taskCreated = true;
        logger.warn('Raised multi_product_sequence_ambiguous task for multi-product decision maker', { contactEmail: resolvedIdentity.contactEmail });
      } else if (createdDeals.length === 1) {
        // Single Deal: Check activation gate
        const sequenceState = {
          contactEmail: resolvedIdentity.contactEmail,
          dealKey: createdDeals[0],
          role: payload.role,
          sequenceActivatedAt: null
        };

        if (requiresActivationTask(sequenceState)) {
          const contactName = `${resolvedIdentity.contactFirstName || ''} ${resolvedIdentity.contactLastName || ''}`.trim() || resolvedIdentity.contactEmail;
          const activationTask = createActivationTask(resolvedIdentity.contactEmail, contactName, sequenceState.dealKey);
          await this.hsClient.createActivationTask(activationTask, contactId, createdDeals[0]);
          taskCreated = true;
          logger.info('Raised sequence activation task', { contactEmail: resolvedIdentity.contactEmail, taskCode: activationTask.taskCode });
        }
      }
    }

    return { success: true, createdDeals, taskCreated };
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
