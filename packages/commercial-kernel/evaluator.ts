import { 
  OpportunitySnapshot, 
  GoalDefinition, 
  QualificationConfig, 
  EvaluationResult, 
  QualificationState,
  OpportunityType,
  EvidenceRecord
} from './types';

export const UNIVERSAL_MINIMUM_GOALS: Record<OpportunityType, GoalDefinition[]> = {
  MQL: [
    {
      key: 'universal_mql_communication_channel',
      name: 'Identifiable subject with usable communication channel',
      predicate: 'anyCommunicationChannel',
      scope: 'relationship',
      universal: true
    }
  ],
  SQL: [
    {
      key: 'universal_sql_offering_known',
      name: 'Intended commercial offering or proposition is known',
      predicate: 'offeringKnown',
      scope: 'opportunity',
      universal: true
    }
  ],
  FTP: [
    {
      key: 'universal_ftp_first_transaction',
      name: 'First transaction in relationship is complete',
      predicate: 'transactionExists',
      scope: 'opportunity',
      universal: true
    }
  ],
  RTP: [
    {
      key: 'universal_rtp_subsequent_transaction',
      name: 'Subsequent transaction complete after preceding completion boundary',
      predicate: 'transactionExists',
      scope: 'sincePredecessorCompletion',
      universal: true
    }
  ]
};

export function injectUniversalGoals(config: QualificationConfig): QualificationConfig {
  const mergedGoals: Record<OpportunityType, GoalDefinition[]> = {
    MQL: [...UNIVERSAL_MINIMUM_GOALS.MQL],
    SQL: [...UNIVERSAL_MINIMUM_GOALS.SQL],
    FTP: [...UNIVERSAL_MINIMUM_GOALS.FTP],
    RTP: [...UNIVERSAL_MINIMUM_GOALS.RTP]
  };

  for (const oppType of ['MQL', 'SQL', 'FTP', 'RTP'] as OpportunityType[]) {
    const customGoals = config.goalsByOpportunityType?.[oppType] || [];
    for (const custom of customGoals) {
      if (!mergedGoals[oppType].some(g => g.key === custom.key)) {
        mergedGoals[oppType].push(custom);
      }
    }
  }

  return {
    ...config,
    goalsByOpportunityType: mergedGoals
  };
}

export function evaluateSinglePredicate(
  predicateName: string,
  params: Record<string, unknown> | undefined,
  scope: string | undefined,
  snapshot: OpportunitySnapshot,
  matchingEvidence: EvidenceRecord[]
): { satisfied: boolean; manualReviewRequired?: boolean; evidenceRefs: string[] } {
  switch (predicateName) {
    case 'manualReview': {
      const isTriggered = snapshot.facts[params?.property as string] === true || params?.forceReview === true;
      return { satisfied: !isTriggered, manualReviewRequired: isTriggered, evidenceRefs: isTriggered ? ['fact_manual_review'] : [] };
    }
    case 'hasIdentity':
    case 'anyCommunicationChannel': {
      const email = snapshot.facts.email || snapshot.facts.contactEmail;
      const phone = snapshot.facts.phone;
      const satisfied = Boolean(email || phone);
      return { satisfied, evidenceRefs: satisfied ? ['fact_communication_channel'] : [] };
    }
    case 'marketingConsent': {
      const satisfied = snapshot.facts.marketingConsent === true;
      return { satisfied, evidenceRefs: satisfied ? ['fact_marketing_consent'] : [] };
    }
    case 'hasOfferingInterest':
    case 'offeringKnown': {
      const products = snapshot.facts.products || snapshot.facts.offeringKeys || snapshot.facts.offering || snapshot.facts.lineItems;
      const hasOffering = Array.isArray(products) ? products.length > 0 : Boolean(products);
      const evMatches = matchingEvidence.filter(e => e.predicate === 'offeringKnown' || e.data?.productKey);
      const satisfied = hasOffering || evMatches.length > 0;
      const refs = evMatches.map(e => e.id);
      if (hasOffering) refs.push('fact_offering_known');
      return { satisfied, evidenceRefs: refs };
    }
    case 'activityExists': {
      const activityType = params?.activityType;
      const requiredOutcome = params?.outcome;
      const evMatches = matchingEvidence.filter(e => {
        if (activityType && e.data?.activityType !== activityType) return false;
        if (requiredOutcome && e.data?.outcome !== requiredOutcome) return false;
        return true;
      });
      return { satisfied: evMatches.length > 0, evidenceRefs: evMatches.map(e => e.id) };
    }
    case 'associationExists': {
      const objectType = params?.objectType;
      const evMatches = matchingEvidence.filter(e => e.data?.associatedObjectType === objectType || e.predicate === 'associationExists');
      return { satisfied: evMatches.length > 0, evidenceRefs: evMatches.map(e => e.id) };
    }
    case 'transactionComplete':
    case 'transactionExists': {
      const evMatches = matchingEvidence.filter(e => e.predicate === 'transactionExists' || e.data?.transactionId || e.data?.orderId);
      
      let hasFactTransaction = false;
      if (snapshot.facts.transactionCompleted === true || snapshot.facts.stage === 'closedwon') {
        const factTxTime = (snapshot.facts.transactionCompletedAt as string) || snapshot.openedAt;
        if (scope === 'sincePredecessorCompletion') {
          hasFactTransaction = Boolean(snapshot.predecessorCompletedAt && factTxTime >= snapshot.predecessorCompletedAt);
        } else {
          hasFactTransaction = true;
        }
      }

      const satisfied = hasFactTransaction || evMatches.length > 0;
      const refs = evMatches.map(e => e.id);
      if (hasFactTransaction) refs.push('fact_transaction_completed');
      return { satisfied, evidenceRefs: refs };
    }
    case 'property': {
      const propName = params?.property as string;
      const val = snapshot.facts[propName];

      let satisfied = false;
      if (params?.equals !== undefined) {
        satisfied = val === params.equals;
      } else if (params?.notEquals !== undefined) {
        satisfied = val !== params.notEquals;
      } else if (params?.greaterThan !== undefined) {
        satisfied = typeof val === 'number' && val > Number(params.greaterThan);
      } else if (params?.lessThan !== undefined) {
        satisfied = typeof val === 'number' && val < Number(params.lessThan);
      } else if (params?.in !== undefined && Array.isArray(params.in)) {
        satisfied = params.in.includes(val);
      } else if (params?.contains !== undefined && typeof val === 'string') {
        satisfied = val.includes(String(params.contains));
      } else if (params?.isTruthy) {
        satisfied = Boolean(val);
      } else if (params?.isFalsy) {
        satisfied = !val;
      }

      return { satisfied, evidenceRefs: satisfied ? [`fact_prop_${propName}`] : [] };
    }
    default:
      return { satisfied: false, evidenceRefs: [] };
  }
}

export function evaluatePredicate(
  goal: GoalDefinition,
  snapshot: OpportunitySnapshot
): { satisfied: boolean; manualReviewRequired?: boolean; evidenceRefs: string[] } {
  // Enforce evidence window scope rules
  const matchingEvidence = snapshot.evidence.filter(ev => {
    if (goal.scope === 'opportunity' && ev.occurredAt < snapshot.openedAt) {
      return false;
    }
    if (goal.scope === 'sincePredecessorCompletion') {
      if (!snapshot.predecessorCompletedAt || ev.occurredAt < snapshot.predecessorCompletedAt) {
        return false;
      }
    }
    return true;
  });

  const predicatesList = goal.predicates && goal.predicates.length > 0 
    ? goal.predicates.map(p => ({ predicate: p.predicate, params: { ...goal.params, ...p, equals: (p as any).value ?? goal.params?.equals } }))
    : [{ predicate: goal.predicate || 'property', params: goal.params }];

  let allSatisfied = true;
  let manualReviewRequired = false;
  const allRefs: string[] = [];

  for (const pred of predicatesList) {
    const res = evaluateSinglePredicate(pred.predicate, pred.params, goal.scope, snapshot, matchingEvidence);
    if (res.manualReviewRequired) manualReviewRequired = true;
    if (!res.satisfied) allSatisfied = false;
    allRefs.push(...res.evidenceRefs);
  }

  return { satisfied: allSatisfied, manualReviewRequired, evidenceRefs: allRefs };
}

export function evaluateOpportunity(
  snapshot: OpportunitySnapshot,
  config: QualificationConfig
): EvaluationResult {
  // Early kill switch checks
  if (config.featureFlags?.automationSuppressed || snapshot.facts.automationSuppressed === true) {
    return {
      qualificationState: 'BLOCKED',
      satisfiedGoalKeys: [],
      unsatisfiedGoalKeys: [],
      evidenceRefsByGoal: {},
      evaluatedConfigVersion: config.configVersion
    };
  }

  const mergedConfig = injectUniversalGoals(config);
  const goals = mergedConfig.goalsByOpportunityType[snapshot.opportunityType] || [];

  const satisfiedGoalKeys: string[] = [];
  const unsatisfiedGoalKeys: string[] = [];
  const evidenceRefsByGoal: Record<string, string[]> = {};
  let manualReviewNeeded = false;

  for (const goal of goals) {
    const res = evaluatePredicate(goal, snapshot);
    evidenceRefsByGoal[goal.key] = res.evidenceRefs;

    if (res.manualReviewRequired) {
      manualReviewNeeded = true;
    }

    if (res.satisfied) {
      satisfiedGoalKeys.push(goal.key);
    } else {
      unsatisfiedGoalKeys.push(goal.key);
    }
  }

  let qualificationState: QualificationState = 'PENDING';
  if (manualReviewNeeded) {
    qualificationState = 'MANUAL_REVIEW';
  } else if (unsatisfiedGoalKeys.length === 0) {
    qualificationState = 'SATISFIED';
  } else {
    qualificationState = 'PENDING';
  }

  return {
    qualificationState,
    satisfiedGoalKeys,
    unsatisfiedGoalKeys,
    evidenceRefsByGoal,
    evaluatedConfigVersion: config.configVersion
  };
}
