import { describe, it, expect, beforeEach, vi } from 'vitest';
import { validateProductKey, createInitialProductDeal, requiresActivationTask } from '../../packages/domain';

describe('Worker Queue Engine & Domain Integration Suite', () => {
  it('should validate canonical base product keys strictly', () => {
    expect(validateProductKey('jurnii_360').valid).toBe(true);
    expect(validateProductKey('jurnii_ux').valid).toBe(true);
    expect(validateProductKey('jurnii_cortex').valid).toBe(true);
    
    // Invalid/unrecognized product keys return ambiguous: true
    expect(validateProductKey('unrecognized_product_xyz').ambiguous).toBe(true);
    expect(validateProductKey('').ambiguous).toBe(true);
  });

  it('should create initial product deal with deal_key = companyKey::productKey', () => {
    const deal = createInitialProductDeal({
      companyKey: 'globex.com',
      companyName: 'Globex Corp',
      productKey: 'jurnii_360',
      contactEmail: 'alice@globex.com',
      role: 'Decision Maker'
    });

    expect(deal.dealKey).toBe('globex.com::jurnii_360');
    expect(deal.pipeline).toBe('b2b_pipeline');
    expect(deal.opportunityStage).toBe('marketing_consent');
    expect(deal.automationSuppressed).toBe(false);
  });

  it('should suppress B2B automation for partnership pipeline deals', () => {
    const deal = createInitialProductDeal({
      companyKey: 'partner.com',
      companyName: 'Partner Co',
      productKey: 'jurnii_ux',
      contactEmail: 'partner@partner.com',
      pipeline: 'partnership_pipeline'
    });

    expect(deal.pipeline).toBe('partnership_pipeline');
    expect(deal.automationSuppressed).toBe(true);
  });

  it('should check activation task requirements accurately', () => {
    const stateActive = {
      contactEmail: 'alice@globex.com',
      dealKey: 'globex.com::jurnii_360',
      role: 'Decision Maker',
      sequenceActivatedAt: '2026-08-05T00:00:00Z'
    };
    expect(requiresActivationTask(stateActive)).toBe(false);

    const stateUnactivated = {
      contactEmail: 'alice@globex.com',
      dealKey: 'globex.com::jurnii_360',
      role: 'Decision Maker',
      sequenceActivatedAt: null
    };
    expect(requiresActivationTask(stateUnactivated)).toBe(true);
  });
});
