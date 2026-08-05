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
  ContactInput
} from '../../packages/domain';

export interface IntakeJobPayload {
  company: CompanyInput;
  contact: ContactInput;
  products: string[];
  pipeline?: 'b2b_pipeline' | 'partnership_pipeline';
  role?: 'Decision Maker' | 'End User' | 'Influencer';
}

export class ReconciliationWorker {
  private hsClient: HubspotClientWrapper;

  constructor(accessToken?: string) {
    this.hsClient = new HubspotClientWrapper(accessToken);
  }

  public async processIntakeJob(jobId: string, payload: IntakeJobPayload): Promise<{ success: boolean; createdDeals: string[]; taskCreated: boolean }> {
    logger.info('Processing intake identity & deal upsert job', { jobId, contact: payload.contact.email, company: payload.company.name });

    // 1. Resolve Contact & Company identity
    const resolvedIdentity = resolveIdentity(payload.company, payload.contact);

    // 2. Upsert Company and Contact records
    const companyId = await this.hsClient.upsertCompany(resolvedIdentity);
    const contactId = await this.hsClient.upsertContact(resolvedIdentity);

    // Associate Contact to Company (Primary Association)
    await this.hsClient.associateContactToCompany(contactId, companyId);

    const createdDeals: string[] = [];
    const role = payload.role || 'Decision Maker';

    // 3. For each product of interest, create/upsert Deal
    for (const rawProduct of payload.products) {
      const validation = validateProductKey(rawProduct);

      if (validation.ambiguous) {
        // Multi-Product Ambiguity: Raise Manual Review Task
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
        role
      });

      const dealId = await this.hsClient.upsertProductDeal(initialDeal, companyId);
      createdDeals.push(dealId);

      // Associate Contact to Deal with Labeled Association
      await this.hsClient.associateContactToDeal(contactId, dealId, role);
    }

    // 4. Check Sequence Activation Gate (B2B Pipeline only)
    let taskCreated = false;
    if (payload.pipeline !== 'partnership_pipeline' && createdDeals.length > 0) {
      const sequenceState = {
        contactEmail: resolvedIdentity.contactEmail,
        dealKey: createdDeals[0],
        role,
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

    return { success: true, createdDeals, taskCreated };
  }
}

if (require.main === module) {
  const worker = new ReconciliationWorker();
  logger.info('Reconciliation worker initialized.');
}
