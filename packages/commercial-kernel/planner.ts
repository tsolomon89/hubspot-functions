import { 
  OpportunitySnapshot, 
  EvaluationResult, 
  QualificationConfig, 
  TransitionIntent, 
  OpportunityType, 
  CommercialSubjectRef 
} from './types';

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
  config: QualificationConfig
): TransitionIntent[] {
  // Replay Safety: Prevent re-evaluating already closed opportunities
  if (snapshot.opportunityState === 'WON' || snapshot.opportunityState === 'LOST') {
    return [{ kind: 'NOOP', reason: `Opportunity is already closed (${snapshot.opportunityState})` }];
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
      reason: 'Opportunity requires human manual review' 
    }];
  }

  if (evaluation.qualificationState !== 'SATISFIED') {
    return [{ 
      kind: 'UPDATE_OPPORTUNITY', 
      opportunityKey: snapshot.opportunityKey, 
      newState: 'OPEN', 
      qualificationState: 'PENDING',
      details: { unsatisfiedGoalKeys: evaluation.unsatisfiedGoalKeys }
    }];
  }

  // Opportunity is SATISFIED -> Close current opportunity as WON and plan successor
  const intents: TransitionIntent[] = [{
    kind: 'UPDATE_OPPORTUNITY',
    opportunityKey: snapshot.opportunityKey,
    newState: 'WON',
    qualificationState: 'SATISFIED'
  }];

  // Derived Lifecycle Stage projection
  const projectedStage = projectLifecycleStage(snapshot.opportunityType, 'SATISFIED');
  intents.push({
    kind: 'PROJECT_LIFECYCLE_STAGE',
    subject: snapshot.subject,
    stage: projectedStage
  });

  // Determine successor type & cycle index
  let successorType: OpportunityType | null = null;
  let nextCycleIndex = 1;

  switch (snapshot.opportunityType) {
    case 'MQL':
      successorType = 'SQL';
      nextCycleIndex = 1;
      break;
    case 'SQL':
      successorType = 'FTP';
      nextCycleIndex = 1;
      break;
    case 'FTP':
      successorType = 'RTP';
      nextCycleIndex = 1;
      break;
    case 'RTP':
      successorType = 'RTP';
      nextCycleIndex = snapshot.cycleIndex + 1;
      break;
  }

  if (successorType) {
    const successorKey = deriveSuccessorKey(snapshot.relationshipKey, successorType, nextCycleIndex);
    intents.push({
      kind: 'CREATE_SUCCESSOR',
      predecessorKey: snapshot.opportunityKey,
      successorKey,
      successorType,
      cycleIndex: nextCycleIndex
    });
  }

  return intents;
}
