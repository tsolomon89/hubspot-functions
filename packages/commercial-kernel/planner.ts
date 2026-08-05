import { 
  OpportunitySnapshot, 
  EvaluationResult, 
  QualificationConfig, 
  TransitionIntent, 
  OpportunityType, 
  CommercialSubjectRef 
} from './types';

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
  const intents: TransitionIntent[] = [];

  if (config.featureFlags?.automationSuppressed) {
    return [{ kind: 'NOOP', reason: 'Automation suppressed by organization kill switch' }];
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
  intents.push({
    kind: 'UPDATE_OPPORTUNITY',
    opportunityKey: snapshot.opportunityKey,
    newState: 'WON',
    qualificationState: 'SATISFIED'
  });

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
