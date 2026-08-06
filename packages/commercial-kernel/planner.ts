import { 
  OpportunitySnapshot, 
  EvaluationResult, 
  QualificationConfig, 
  TransitionIntent, 
  OpportunityType, 
  CommercialSubjectRef,
  GoalDefinition
} from './types';
import { deriveRelationshipKey } from '../domain/identity';

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

  if (config.featureFlags?.automationSuppressed || snapshot.facts.automationSuppressed === true) {
    return [{ kind: 'NOOP', reason: 'Automation suppressed by organization kill switch' }];
  }

  if (evaluation.qualificationState === 'BLOCKED') {
    return [{ kind: 'NOOP', reason: 'Opportunity qualification is BLOCKED' }];
  }

  // Gate 2: Universal Manual Review
  if (evaluation.qualificationState === 'MANUAL_REVIEW') {
    const isMissingCompany = Boolean(snapshot.facts.missingCompany);
    const isAmbiguousCompany = Boolean(snapshot.facts.ambiguousPrimaryCompany);
    const isAmbiguousContact = Boolean(snapshot.facts.ambiguousPrimaryContact);

    let reason = 'Opportunity requires human manual review';
    if (isMissingCompany) {
      reason = 'B2B Contact has missing or unassociated Company';
    } else if (isAmbiguousCompany) {
      reason = 'Multiple associated Companies without explicit primary company designation';
    } else if (isAmbiguousContact) {
      reason = 'Multiple associated Contacts without explicit primary contact designation';
    }

    // A B2B Contact without a Company must NOT receive a B2B relationship key!
    // Use a subject-scoped review identity key for the Task until the Company relationship exists.
    let reviewOpportunityKey = snapshot.opportunityKey;
    if (isMissingCompany && snapshot.subject.kind === 'CONTACT') {
      const reviewRelKey = deriveRelationshipKey(snapshot.organizationKey, 'review', snapshot.subject.key);
      reviewOpportunityKey = `${reviewRelKey}::LEAD::1`;
    }

    return [{ 
      kind: 'CREATE_MANUAL_REVIEW', 
      opportunityKey: reviewOpportunityKey, 
      reason,
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
    // Part 3: Authoritative SQL completion boundary (coa_sql_completed_at)
    const sqlCompletedAt = snapshot.sqlCompletedAt || (snapshot.facts.coa_sql_completed_at as string) || currentNow;
    const isValidSqlTime = Boolean(sqlCompletedAt && !isNaN(Date.parse(sqlCompletedAt)));

    intents.push({
      kind: 'UPDATE_OPPORTUNITY',
      opportunityKey: snapshot.opportunityKey,
      newState: 'WON',
      qualificationState: 'SATISFIED',
      details: { targetLeadStage: 'qualified', sqlCompletedAt, offerings: snapshot.offerings }
    });
    intents.push({
      kind: 'PROJECT_LIFECYCLE_STAGE',
      subject: snapshot.subject,
      stage: 'salesqualifiedlead'
    });

    if (isValidSqlTime) {
      const successorKey = deriveSuccessorKey(snapshot.relationshipKey, 'FTP', 1);
      intents.push({
        kind: 'CREATE_SUCCESSOR',
        predecessorKey: snapshot.opportunityKey,
        successorKey,
        successorType: 'FTP',
        cycleIndex: 1,
        subject: snapshot.subject,
        offerings: snapshot.offerings,
        predecessorCompletedAt: sqlCompletedAt
      });
    }
  } else if (snapshot.opportunityType === 'FTP') {
    // Part 3: FTP -> RTP1 uses ONLY current FTP Deal's exact closedate/closedAt (NO fallbacks!)
    const closedAt = (snapshot.facts.closedate as string) || (snapshot.facts.closedAt as string);
    const isValidClosedTime = Boolean(closedAt && !isNaN(Date.parse(closedAt)));

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

    if (isValidClosedTime) {
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
        predecessorCompletedAt: closedAt
      });
    }
  } else if (snapshot.opportunityType === 'RTP') {
    // Part 3: RTP1 -> RTP2 uses ONLY current RTP1 Deal's exact closedate/closedAt (NO fallbacks!)
    const closedAt = (snapshot.facts.closedate as string) || (snapshot.facts.closedAt as string);
    const isValidClosedTime = Boolean(closedAt && !isNaN(Date.parse(closedAt)));

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

    if (isValidClosedTime) {
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
        predecessorCompletedAt: closedAt
      });
    }
  }

  return intents;
}
