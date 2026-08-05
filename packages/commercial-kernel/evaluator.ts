import { 
  OpportunitySnapshot, 
  GoalDefinition, 
  QualificationConfig, 
  EvaluationResult, 
  QualificationState,
  OpportunityType,
  EvidenceRecord
} from './types';

// Universal Minimum Goals that cannot be deleted or weakened by configuration
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
  const matchingEvidence = snapshot.evidence.filter(ev => {
    if (goal.scope === 'opportunity' && ev.occurredAt < snapshot.openedAt) {
      return false; // Out-of-window evidence ignored
    }
    return true;
  });

  switch (goal.predicate) {
    case 'anyCommunicationChannel': {
      const email = snapshot.facts.email || snapshot.facts.contactEmail;
      const phone = snapshot.facts.phone;
      const satisfied = Boolean(email || phone);
      return { satisfied, evidenceRefs: satisfied ? ['fact_communication_channel'] : [] };
    }
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
    case 'transactionExists': {
      const evMatches = matchingEvidence.filter(e => e.predicate === 'transactionExists' || e.data?.transactionId || e.data?.orderId);
      const hasFactTransaction = Boolean(snapshot.facts.transactionCompleted || snapshot.facts.orderCompleted);
      const satisfied = hasFactTransaction || evMatches.length > 0;
      const refs = evMatches.map(e => e.id);
      if (hasFactTransaction) refs.push('fact_transaction_completed');
      return { satisfied, evidenceRefs: refs };
    }
    case 'property': {
      const propName = goal.params?.property as string;
      const expectedValue = goal.params?.equals;
      const val = snapshot.facts[propName];
      const satisfied = expectedValue !== undefined ? val === expectedValue : val !== undefined && val !== null;
      return { satisfied, evidenceRefs: satisfied ? [`fact_prop_${propName}`] : [] };
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
  }

  return {
    qualificationState,
    satisfiedGoalKeys,
    unsatisfiedGoalKeys,
    evidenceRefsByGoal,
    evaluatedConfigVersion: fullConfig.configVersion
  };
}
