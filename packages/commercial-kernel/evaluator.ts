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
    const customGoals = config.goalsByOpportunityType[oppType] || [];
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

export function evaluatePredicate(
  goal: GoalDefinition,
  snapshot: OpportunitySnapshot
): { satisfied: boolean; evidenceRefs: string[] } {
  // Enforce evidence window scope rules
  const matchingEvidence = snapshot.evidence.filter(ev => {
    if (goal.scope === 'opportunity' && ev.occurredAt < snapshot.openedAt) {
      return false;
    }
    if (goal.scope === 'sincePredecessorCompletion') {
      if (!snapshot.predecessorCompletedAt || ev.occurredAt <= snapshot.predecessorCompletedAt) {
        return false;
      }
    }
    return true;
  });

  switch (goal.predicate) {
    case 'hasIdentity':
    case 'anyCommunicationChannel': {
      const email = snapshot.facts.email || snapshot.facts.contactEmail;
      const phone = snapshot.facts.phone;
      const satisfied = Boolean(email || phone);
      return { satisfied, evidenceRefs: satisfied ? ['fact_communication_channel'] : [] };
    }
    case 'hasOfferingInterest':
    case 'offeringKnown': {
      const products = snapshot.facts.products || snapshot.facts.offeringKeys || snapshot.facts.offering;
      const hasOffering = Array.isArray(products) ? products.length > 0 : Boolean(products);
      const evMatches = matchingEvidence.filter(e => e.predicate === 'offeringKnown' || e.data?.productKey);
      const satisfied = hasOffering || evMatches.length > 0;
      const refs = evMatches.map(e => e.id);
      if (hasOffering) refs.push('fact_offering_known');
      return { satisfied, evidenceRefs: refs };
    }
    case 'activityExists': {
      const activityType = goal.params?.activityType;
      const requiredOutcome = goal.params?.outcome;
      const evMatches = matchingEvidence.filter(e => {
        if (activityType && e.data?.activityType !== activityType) return false;
        if (requiredOutcome && e.data?.outcome !== requiredOutcome) return false;
        return true;
      });
      return { satisfied: evMatches.length > 0, evidenceRefs: evMatches.map(e => e.id) };
    }
    case 'associationExists': {
      const objectType = goal.params?.objectType;
      const evMatches = matchingEvidence.filter(e => e.data?.associatedObjectType === objectType || e.predicate === 'associationExists');
      return { satisfied: evMatches.length > 0, evidenceRefs: evMatches.map(e => e.id) };
    }
    case 'transactionComplete':
    case 'transactionExists': {
      const evMatches = matchingEvidence.filter(e => e.predicate === 'transactionExists' || e.data?.transactionId || e.data?.orderId);
      
      let hasFactTransaction = false;
      if (snapshot.facts.transactionCompleted || snapshot.facts.orderCompleted || snapshot.facts.amount) {
        const factTxTime = (snapshot.facts.transactionCompletedAt as string) || snapshot.openedAt;
        if (goal.scope === 'sincePredecessorCompletion') {
          hasFactTransaction = Boolean(snapshot.predecessorCompletedAt && factTxTime > snapshot.predecessorCompletedAt);
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
      const propName = goal.params?.property as string;
      const val = snapshot.facts[propName];

      let satisfied = false;
      if (goal.params?.equals !== undefined) {
        satisfied = val === goal.params.equals;
      } else if (goal.params?.notEquals !== undefined) {
        satisfied = val !== goal.params.notEquals;
      } else if (Array.isArray(goal.params?.in)) {
        satisfied = (goal.params.in as any[]).includes(val);
      } else if (goal.params?.greaterThan !== undefined) {
        satisfied = Number(val) > Number(goal.params.greaterThan);
      } else if (goal.params?.lessThan !== undefined) {
        satisfied = Number(val) < Number(goal.params.lessThan);
      } else {
        satisfied = val !== undefined && val !== null;
      }

      return { satisfied, evidenceRefs: satisfied ? [`fact_prop_${propName}`] : [] };
    }
    case 'count': {
      const targetPredicate = goal.params?.targetPredicate as string;
      const threshold = Number(goal.params?.threshold || 1);
      const evMatches = matchingEvidence.filter(e => e.predicate === targetPredicate);
      const satisfied = evMatches.length >= threshold;
      return { satisfied, evidenceRefs: evMatches.map(e => e.id) };
    }
    case 'all': {
      const subGoals = (goal.params?.goals as GoalDefinition[]) || [];
      const results = subGoals.map(g => evaluatePredicate(g, snapshot));
      const satisfied = results.every(r => r.satisfied);
      const refs = results.flatMap(r => r.evidenceRefs);
      return { satisfied, evidenceRefs: refs };
    }
    case 'any': {
      const subGoals = (goal.params?.goals as GoalDefinition[]) || [];
      const results = subGoals.map(g => evaluatePredicate(g, snapshot));
      const satisfied = results.some(r => r.satisfied);
      const refs = results.flatMap(r => r.evidenceRefs);
      return { satisfied, evidenceRefs: refs };
    }
    case 'not': {
      const subGoal = goal.params?.goal as GoalDefinition;
      const result = subGoal ? evaluatePredicate(subGoal, snapshot) : { satisfied: false, evidenceRefs: [] };
      return { satisfied: !result.satisfied, evidenceRefs: [] };
    }
    default: {
      return { satisfied: false, evidenceRefs: [] };
    }
  }
}

export function evaluateOpportunity(
  snapshot: OpportunitySnapshot,
  config: QualificationConfig
): EvaluationResult {
  const fullConfig = injectUniversalGoals(config);
  const goals = fullConfig.goalsByOpportunityType[snapshot.opportunityType] || [];
  
  const satisfiedGoalKeys: string[] = [];
  const unsatisfiedGoalKeys: string[] = [];
  const evidenceRefsByGoal: Record<string, string[]> = {};

  for (const goal of goals) {
    const res = evaluatePredicate(goal, snapshot);
    if (res.satisfied) {
      satisfiedGoalKeys.push(goal.key);
      evidenceRefsByGoal[goal.key] = res.evidenceRefs;
    } else {
      unsatisfiedGoalKeys.push(goal.key);
      evidenceRefsByGoal[goal.key] = [];
    }
  }

  let qualificationState: QualificationState = 'PENDING';
  if (unsatisfiedGoalKeys.length === 0) {
    qualificationState = 'SATISFIED';
  } else if (snapshot.facts.blocked === true) {
    qualificationState = 'BLOCKED';
  } else if (snapshot.facts.manualReviewRequired === true) {
    qualificationState = 'MANUAL_REVIEW';
  }

  return {
    qualificationState,
    satisfiedGoalKeys,
    unsatisfiedGoalKeys,
    evidenceRefsByGoal,
    evaluatedConfigVersion: fullConfig.configVersion
  };
}
