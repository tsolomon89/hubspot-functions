import { computeDealKey } from './index';

export interface DealInput {
  companyKey: string;
  companyName: string;
  productKey: string;
  contactEmail: string;
  pipeline?: 'b2b_pipeline' | 'partnership_pipeline';
  role?: 'Decision Maker' | 'End User' | 'Influencer';
}

export interface CommercialDealState {
  dealKey: string;
  dealName: string;
  companyKey: string;
  productKey: string;
  pipeline: 'b2b_pipeline' | 'partnership_pipeline';
  opportunityType: 'MQL' | 'SQL' | 'FTP' | 'RTP';
  opportunityStage: string;
  opportunityState: 'Open' | 'Lost';
  opportunityStatus: 'New' | 'Working' | 'Closed';
  automationSuppressed: boolean;
}

export interface ManualReviewTask {
  subject: string;
  taskCode: string;
  dealKey: string;
  contactEmail: string;
  reason: string;
}

const B2B_STAGE_PROGRESSION_ORDER: Record<string, number> = {
  'marketing_consent': 1,
  'demo_booking': 2,
  'demo_confirmation': 3,
  'demo_hosted': 4,
  'proposal_preparation': 5,
  'commercial_agreement': 6,
  'onboarding': 7,
  'renewal': 8
};

export function isPartnershipPipeline(pipelineName?: string): boolean {
  return pipelineName === 'partnership_pipeline' || pipelineName === 'partnership';
}

export function validateProductKey(productKey: string): { valid: boolean; ambiguous: boolean } {
  if (!productKey || productKey.trim().length === 0) {
    return { valid: false, ambiguous: true };
  }
  if (productKey.toLowerCase().includes('unknown') || productKey.toLowerCase().includes('ambiguous')) {
    return { valid: false, ambiguous: true };
  }
  return { valid: true, ambiguous: false };
}

export function createInitialProductDeal(input: DealInput): CommercialDealState {
  const dealKey = computeDealKey(input.companyKey, input.productKey);
  const dealName = `${input.companyName} - ${input.productKey}`;
  const pipeline = isPartnershipPipeline(input.pipeline) ? 'partnership_pipeline' : 'b2b_pipeline';

  return {
    dealKey,
    dealName,
    companyKey: input.companyKey,
    productKey: input.productKey,
    pipeline,
    opportunityType: 'MQL',
    opportunityStage: 'marketing_consent',
    opportunityState: 'Open',
    opportunityStatus: 'New',
    automationSuppressed: isPartnershipPipeline(input.pipeline) // Partnership automation is suppressed by default
  };
}

export function createAmbiguousProductReviewTask(input: DealInput, rawProduct: string): ManualReviewTask {
  return {
    subject: `[Manual Review] Ambiguous product interest for ${input.companyName}`,
    taskCode: '[ambiguous_product]',
    dealKey: computeDealKey(input.companyKey, rawProduct),
    contactEmail: input.contactEmail,
    reason: `Unresolved or ambiguous product key string: ${rawProduct}`
  };
}

export function canAdvanceStage(currentStage: string, targetStage: string): boolean {
  const currentOrder = B2B_STAGE_PROGRESSION_ORDER[currentStage] || 0;
  const targetOrder = B2B_STAGE_PROGRESSION_ORDER[targetStage] || 0;
  
  // Monotonic advancement: target order must be strictly greater than current order
  return targetOrder > currentOrder;
}

export function evaluateDealUpdate(
  existingDeal: CommercialDealState,
  targetStage?: string
): CommercialDealState {
  if (existingDeal.automationSuppressed || existingDeal.pipeline === 'partnership_pipeline') {
    return existingDeal; // Suppressed or Partnership: no B2B automation mutations allowed
  }

  if (existingDeal.opportunityState === 'Lost') {
    return existingDeal; // Closed Lost deals stay lost
  }

  let updatedStage = existingDeal.opportunityStage;
  if (targetStage && canAdvanceStage(existingDeal.opportunityStage, targetStage)) {
    updatedStage = targetStage;
  }

  return {
    ...existingDeal,
    opportunityStage: updatedStage,
    opportunityStatus: existingDeal.opportunityStatus === 'New' ? 'Working' : existingDeal.opportunityStatus
  };
}
