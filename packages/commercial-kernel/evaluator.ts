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

export function parseInstant(val?: string | number): number {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  const parsed = Date.parse(val);
  return isNaN(parsed) ? 0 : parsed;
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
      const email = snapshot.facts.email || snapshot.facts.contactEmail || (snapshot.subject.kind === 'CONTACT' && snapshot.subject.email);
      const phone = snapshot.facts.phone || (snapshot.subject.kind === 'CONTACT' && snapshot.subject.phone);
      const satisfied = Boolean((email && String(email).trim() !== '') || (phone && String(phone).trim() !== ''));
      return { satisfied, evidenceRefs: satisfied ? ['fact_communication_channel'] : [] };
    }
    case 'marketingConsent': {
      const satisfied = snapshot.facts.marketingConsent === true;
      return { satisfied, evidenceRefs: satisfied ? ['fact_marketing_consent'] : [] };
    }
    case 'hasOfferingInterest':
    case 'offeringKnown': {
      const hasSnapshotOfferings = Boolean(snapshot.offerings && snapshot.offerings.length > 0);
      const products = snapshot.facts.products || snapshot.facts.offeringKeys || snapshot.facts.offering || snapshot.facts.lineItems;
      const hasOfferingFact = Array.isArray(products) ? products.length > 0 : Boolean(products);
      const evMatches = matchingEvidence.filter(e => e.predicate === 'offeringKnown' || e.data?.productKey || e.data?.offeringKey);
      const satisfied = hasSnapshotOfferings || hasOfferingFact || evMatches.length > 0;
      const refs = evMatches.map(e => e.id);
      if (hasSnapshotOfferings || hasOfferingFact) refs.push('fact_offering_known');
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
      if (snapshot.facts.transactionCompleted === true || snapshot.facts.stage === 'closedwon' || snapshot.opportunityState === 'WON') {
        const factTxTime = parseInstant((snapshot.facts.transactionCompletedAt as string) || snapshot.openedAt);
        if (scope === 'sincePredecessorCompletion') {
          const predTime = parseInstant(snapshot.predecessorCompletedAt);
          hasFactTransaction = Boolean(predTime > 0 && factTxTime >= predTime);
        } else {
          hasFactTransaction = true;
        }
      }

      const satisfied = hasFactTransaction || evMatches.length > 0;
      const refs = evMatches.map(e => e.id);
      if (hasFactTransaction) refs.push('fact_transaction_completed');
      return { satisfied, evidenceRefs: refs };
    }
    case 'count': {
      const targetPredicate = params?.targetPredicate as string;
      const minCount = Number(params?.minCount ?? 1);
      const maxCount = params?.maxCount !== undefined ? Number(params.maxCount) : Infinity;
      const filtered = matchingEvidence.filter(e => e.predicate === targetPredicate);
      const count = filtered.length;
      const satisfied = count >= minCount && count <= maxCount;
      return { satisfied, evidenceRefs: satisfied ? filtered.map(e => e.id) : [] };
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
      throw new Error(`UNKNOWN_PREDICATE_ERROR: Evaluator received unsupported predicate '${predicateName}'`);
  }
}

export function evaluatePredicate(
  goal: GoalDefinition,
  snapshot: OpportunitySnapshot
): { satisfied: boolean; manualReviewRequired?: boolean; evidenceRefs: string[] } {
  // Enforce evidence window scope rules with strict instant parsing
  const openedAtInstant = parseInstant(snapshot.openedAt);
  const predecessorCompletedAtInstant = parseInstant(snapshot.predecessorCompletedAt);

  const matchingEvidence = snapshot.evidence.filter(ev => {
    const evInstant = parseInstant(ev.occurredAt);
    if (goal.scope === 'opportunity' && openedAtInstant > 0 && evInstant < openedAtInstant) {
      return false;
    }
    if (goal.scope === 'sincePredecessorCompletion') {
      if (!predecessorCompletedAtInstant || evInstant < predecessorCompletedAtInstant) {
        return false;
      }
    }
    return true;
  });

  // Handle recursive composition: all, any, not
  if (goal.predicate === 'all') {
    const subGoals = goal.conditions || [];
    const allRefs: string[] = [];
    for (const sub of subGoals) {
      const res = evaluatePredicate(sub, snapshot);
      if (res.manualReviewRequired) return { satisfied: false, manualReviewRequired: true, evidenceRefs: [] };
      if (!res.satisfied) return { satisfied: false, evidenceRefs: [] };
      allRefs.push(...res.evidenceRefs);
    }
    return { satisfied: true, evidenceRefs: allRefs };
  }

  if (goal.predicate === 'any') {
    const subGoals = goal.conditions || [];
    const allRefs: string[] = [];
    for (const sub of subGoals) {
      const res = evaluatePredicate(sub, snapshot);
      if (res.satisfied) {
        allRefs.push(...res.evidenceRefs);
        return { satisfied: true, evidenceRefs: allRefs };
      }
    }
    return { satisfied: false, evidenceRefs: [] };
  }

  if (goal.predicate === 'not') {
    const subGoals = goal.conditions || [];
    if (subGoals.length === 0) return { satisfied: false, evidenceRefs: [] };
    const res = evaluatePredicate(subGoals[0], snapshot);
    return { satisfied: !res.satisfied, evidenceRefs: res.satisfied ? [] : ['fact_not_satisfied'] };
  }

  return evaluateSinglePredicate(goal.predicate, goal.params, goal.scope, snapshot, matchingEvidence);
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
