import { describe, it, expect } from 'vitest';
import { 
  createInitialProductDeal, 
  canAdvanceStage, 
  evaluateDealUpdate, 
  validateProductKey,
  createAmbiguousProductReviewTask,
  CommercialDealState 
} from '../../packages/domain';

describe('Company x Product Deal Engine Domain Logic', () => {
  it('should create initial product deal with deal_key = companyKey::productKey', () => {
    const deal = createInitialProductDeal({
      companyKey: 'globex.com',
      companyName: 'Globex Corp',
      productKey: 'SKU-360-FIXED',
      contactEmail: 'alice@globex.com',
      role: 'Decision Maker'
    });

    expect(deal.dealKey).toBe('globex.com::SKU-360-FIXED');
    expect(deal.dealName).toBe('Globex Corp - SKU-360-FIXED');
    expect(deal.pipeline).toBe('b2b_pipeline');
    expect(deal.opportunityType).toBe('MQL');
    expect(deal.opportunityStage).toBe('marketing_consent');
    expect(deal.opportunityState).toBe('Open');
    expect(deal.opportunityStatus).toBe('New');
    expect(deal.automationSuppressed).toBe(false);
  });

  it('should route partnership pipeline deals to partnership_pipeline and suppress automation', () => {
    const deal = createInitialProductDeal({
      companyKey: 'partner.com',
      companyName: 'Partner Co',
      productKey: 'SKU-PARTNER-REF',
      contactEmail: 'partner@partner.com',
      pipeline: 'partnership_pipeline'
    });

    expect(deal.pipeline).toBe('partnership_pipeline');
    expect(deal.automationSuppressed).toBe(true); // Partnership deals bypass B2B automation
  });

  it('should detect ambiguous product keys and generate manual review task', () => {
    const check1 = validateProductKey('SKU-360-FIXED');
    expect(check1.ambiguous).toBe(false);

    const check2 = validateProductKey('unknown_product_sku');
    expect(check2.ambiguous).toBe(true);

    const reviewTask = createAmbiguousProductReviewTask({
      companyKey: 'globex.com',
      companyName: 'Globex Corp',
      productKey: 'unknown_product_sku',
      contactEmail: 'alice@globex.com'
    }, 'unknown_product_sku');

    expect(reviewTask.taskCode).toBe('[ambiguous_product]');
    expect(reviewTask.subject).toContain('[Manual Review] Ambiguous product interest for Globex Corp');
  });

  it('should prevent stage regression (monotonic advancement)', () => {
    expect(canAdvanceStage('marketing_consent', 'demo_booking')).toBe(true);
    expect(canAdvanceStage('demo_booking', 'marketing_consent')).toBe(false);
    expect(canAdvanceStage('proposal_preparation', 'onboarding')).toBe(true);
    expect(canAdvanceStage('onboarding', 'proposal_preparation')).toBe(false);
  });

  it('should respect master kill switch (automation_suppressed = true)', () => {
    const suppressedDeal: CommercialDealState = {
      dealKey: 'globex.com::SKU-360-FIXED',
      dealName: 'Globex Corp - SKU-360-FIXED',
      companyKey: 'globex.com',
      productKey: 'SKU-360-FIXED',
      pipeline: 'b2b_pipeline',
      opportunityType: 'MQL',
      opportunityStage: 'marketing_consent',
      opportunityState: 'Open',
      opportunityStatus: 'New',
      automationSuppressed: true
    };

    const result = evaluateDealUpdate(suppressedDeal, 'demo_booking');
    expect(result.opportunityStage).toBe('marketing_consent'); // Unchanged due to suppression
  });

  it('should not mutate Lost deals', () => {
    const lostDeal: CommercialDealState = {
      dealKey: 'globex.com::SKU-360-FIXED',
      dealName: 'Globex Corp - SKU-360-FIXED',
      companyKey: 'globex.com',
      productKey: 'SKU-360-FIXED',
      pipeline: 'b2b_pipeline',
      opportunityType: 'MQL',
      opportunityStage: 'marketing_consent',
      opportunityState: 'Lost',
      opportunityStatus: 'Closed',
      automationSuppressed: false
    };

    const result = evaluateDealUpdate(lostDeal, 'demo_booking');
    expect(result.opportunityStage).toBe('marketing_consent');
    expect(result.opportunityState).toBe('Lost');
  });
});
