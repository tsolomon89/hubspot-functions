import { 
  OpportunitySnapshot, 
  EvaluationResult, 
  QualificationConfig, 
  TransitionIntent, 
  OpportunityType, 
  CommercialSubjectRef,
  GoalDefinition
} from './types';

export const SUPPORTED_PREDICATES = new Set([
  'anyCommunicationChannel',
  'property',
  'associationExists',
  'activityExists',
  'offeringKnown',
  'transactionExists',
  'count',
  'all',
  'any',
  'not',
  'manualReview',
  'hasIdentity',
  'marketingConsent',
  'hasOfferingInterest',
  'transactionComplete'
]);

function validateGoal(goal: GoalDefinition, path: string, errors: string[]) {
  if (!goal.key) errors.push(`${path}: Missing goal key`);
  if (!goal.predicate) errors.push(`${path}: Missing predicate`);
  if (goal.predicate && !SUPPORTED_PREDICATES.has(goal.predicate)) {
    errors.push(`${path}: Unsupported predicate '${goal.predicate}'`);
  }
  if (['all', 'any', 'not'].includes(goal.predicate) && goal.conditions) {
    goal.conditions.forEach((sub, i) => validateGoal(sub, `${path}.conditions[${i}]`, errors));
  }
}

export function validateCommercialModel(config: QualificationConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!config.organizationKey) errors.push('Missing organizationKey');
  if (!config.configVersion) errors.push('Missing configVersion');
  if (!config.relationshipType) errors.push('Missing relationshipType');
  if (!config.goalsByOpportunityType) {
    errors.push('Missing goalsByOpportunityType');
  } else {
    for (const oppType of ['MQL', 'SQL', 'FTP', 'RTP'] as OpportunityType[]) {
      if (!Array.isArray(config.goalsByOpportunityType[oppType])) {
        errors.push(`goalsByOpportunityType.${oppType} must be an array`);
      } else {
        config.goalsByOpportunityType[oppType].forEach((g, i) => {
          validateGoal(g, `goalsByOpportunityType.${oppType}[${i}]`, errors);
        });
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

export function deriveSuccessorKey(
  relationshipKey: string,
  successorType: OpportunityType,
  cycleIndex: number
): string {
  if (successorType === 'MQL' || successorType === 'SQL') {
    return `${relationshipKey}::LEAD::1`;
  }
  return `${relationshipKey}::${successorType}::${cycleIndex}`;
}

export function projectLifecycleStage(
  opportunityType: OpportunityType,
  qualificationState: string
): string {
  if (qualificationState !== 'SATISFIED') {
    return opportunityType === 'MQL' ? 'lead' : 'marketingqualifiedlead';
  }

  switch (opportunityType) {
    case 'MQL':
      return 'marketingqualifiedlead';
    case 'SQL':
      return 'salesqualifiedlead';
    case 'FTP':
      return 'customer';
    case 'RTP':
      return 'customer';
    default:
      return 'lead';
  }
}

export function planTransition(
  snapshot: OpportunitySnapshot,
  evaluation: EvaluationResult,
  config: QualificationConfig,
  nowInstant?: string
): TransitionIntent[] {
  const currentNow = nowInstant || new Date().toISOString();

  // Replay Safety: Lost opportunities are terminal NOOP
  if (snapshot.opportunityState === 'LOST') {
    return [{ kind: 'NOOP', reason: 'Opportunity is LOST' }];
  }

  if (config.featureFlags?.automationSuppressed) {
    return [{ kind: 'NOOP', reason: 'Automation suppressed by organization kill switch' }];
  }

  if (evaluation.qualificationState === 'BLOCKED') {
    return [{ kind: 'NOOP', reason: 'Opportunity qualification is BLOCKED' }];
  }

  if (evaluation.qualificationState === 'MANUAL_REVIEW') {
    return [{ 
      kind: 'CREATE_MANUAL_REVIEW', 
      opportunityKey: snapshot.opportunityKey, 
      reason: 'Opportunity requires human manual review',
      subject: snapshot.subject
    }];
  }

  if (evaluation.qualificationState !== 'SATISFIED') {
    // Preserve current stage on pending evaluation
    const currentLeadStage = snapshot.opportunityType === 'MQL' ? 'mql' : 'sql';
    const currentDealStage = snapshot.facts.stage ? String(snapshot.facts.stage) : 'open';
    return [{ 
      kind: 'UPDATE_OPPORTUNITY', 
      opportunityKey: snapshot.opportunityKey, 
      newState: 'OPEN', 
      qualificationState: 'PENDING',
      details: { 
        unsatisfiedGoalKeys: evaluation.unsatisfiedGoalKeys,
        targetLeadStage: currentLeadStage,
        targetDealStage: currentDealStage,
        offerings: snapshot.offerings
      }
    }];
  }

  // Opportunity is SATISFIED
  const intents: TransitionIntent[] = [];

  // Single Lead Progression: MQL satisfied -> Lead remains OPEN, advances stage to SQL
  if (snapshot.opportunityType === 'MQL') {
    intents.push({
      kind: 'UPDATE_OPPORTUNITY',
      opportunityKey: snapshot.opportunityKey,
      newState: 'OPEN',
      qualificationState: 'SATISFIED',
      details: { 
        targetOpportunityType: 'SQL', 
        targetLeadStage: 'sql', 
        mqlCompletedAt: currentNow,
        offerings: snapshot.offerings
      }
    });
    intents.push({
      kind: 'PROJECT_LIFECYCLE_STAGE',
      subject: snapshot.subject,
      stage: 'marketingqualifiedlead'
    });
  } else if (snapshot.opportunityType === 'SQL') {
    // SQL satisfied -> Lead stage moves to qualified and creates first FTP Deal
    intents.push({
      kind: 'UPDATE_OPPORTUNITY',
      opportunityKey: snapshot.opportunityKey,
      newState: 'WON',
      qualificationState: 'SATISFIED',
      details: { targetLeadStage: 'qualified', offerings: snapshot.offerings }
    });
    intents.push({
      kind: 'PROJECT_LIFECYCLE_STAGE',
      subject: snapshot.subject,
      stage: 'salesqualifiedlead'
    });
    const successorKey = deriveSuccessorKey(snapshot.relationshipKey, 'FTP', 1);
    intents.push({
      kind: 'CREATE_SUCCESSOR',
      predecessorKey: snapshot.opportunityKey,
      successorKey,
      successorType: 'FTP',
      cycleIndex: 1,
      subject: snapshot.subject,
      offerings: snapshot.offerings,
      predecessorCompletedAt: snapshot.mqlCompletedAt || currentNow
    });
  } else if (snapshot.opportunityType === 'FTP') {
    intents.push({
      kind: 'UPDATE_OPPORTUNITY',
      opportunityKey: snapshot.opportunityKey,
      newState: 'WON',
      qualificationState: 'SATISFIED',
      details: { targetDealStage: 'closedwon' }
    });
    intents.push({
      kind: 'PROJECT_LIFECYCLE_STAGE',
      subject: snapshot.subject,
      stage: 'customer'
    });
    const successorKey = deriveSuccessorKey(snapshot.relationshipKey, 'RTP', 1);
    const rtpOfferings = config.offeringPolicy?.rtpPolicy === 'emptyUntilKnown' ? [] : (snapshot.offerings || []);
    intents.push({
      kind: 'CREATE_SUCCESSOR',
      predecessorKey: snapshot.opportunityKey,
      successorKey,
      successorType: 'RTP',
      cycleIndex: 1,
      subject: snapshot.subject,
      offerings: rtpOfferings,
      predecessorCompletedAt: (snapshot.facts.closedAt as string) || currentNow
    });
  } else if (snapshot.opportunityType === 'RTP') {
    intents.push({
      kind: 'UPDATE_OPPORTUNITY',
      opportunityKey: snapshot.opportunityKey,
      newState: 'WON',
      qualificationState: 'SATISFIED',
      details: { targetDealStage: 'closedwon' }
    });
    intents.push({
      kind: 'PROJECT_LIFECYCLE_STAGE',
      subject: snapshot.subject,
      stage: 'customer'
    });
    const nextCycle = (snapshot.cycleIndex || 1) + 1;
    const successorKey = deriveSuccessorKey(snapshot.relationshipKey, 'RTP', nextCycle);
    const rtpOfferings = config.offeringPolicy?.rtpPolicy === 'emptyUntilKnown' ? [] : (snapshot.offerings || []);
    intents.push({
      kind: 'CREATE_SUCCESSOR',
      predecessorKey: snapshot.opportunityKey,
      successorKey,
      successorType: 'RTP',
      cycleIndex: nextCycle,
      subject: snapshot.subject,
      offerings: rtpOfferings,
      predecessorCompletedAt: (snapshot.facts.closedAt as string) || currentNow
    });
  }

  return intents;
}
