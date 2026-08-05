import { describe, it, expect } from 'vitest';
import { 
  evaluateOpportunity, 
  planTransition,
  OpportunitySnapshot,
  QualificationConfig
} from '../../../packages/commercial-kernel';

describe('Pure Commercial Kernel Contract Tests', () => {
  const baseConfig: QualificationConfig = {
    organizationKey: 'org_test',
    configVersion: '1.0.0',
    relationshipType: 'b2b',
    goalsByOpportunityType: {
      MQL: [{ key: 'goal_mql_consent', name: 'Consent', predicate: 'property', scope: 'relationship', params: { property: 'marketingConsent', equals: true } }],
      SQL: [{ key: 'goal_sql_meeting', name: 'Meeting', predicate: 'activityExists', scope: 'opportunity', params: { activityType: 'MEETING', outcome: 'COMPLETED' } }],
      FTP: [{ key: 'goal_ftp_signed', name: 'Signed', predicate: 'property', scope: 'opportunity', params: { property: 'contractSigned', equals: true } }],
      RTP: [{ key: 'goal_rtp_active', name: 'Active', predicate: 'property', scope: 'opportunity', params: { property: 'activeSubscription', equals: true } }]
    }
  };

  it('should return SATISFIED when all goals for opportunity type are met', () => {
    const snapshot: OpportunitySnapshot = {
      organizationKey: 'org_test',
      relationshipKey: 'rel_123',
      relationshipType: 'b2b',
      opportunityKey: 'rel_123::MQL::1',
      opportunityType: 'MQL',
      opportunityState: 'OPEN',
      cycleIndex: 1,
      openedAt: '2026-08-05T00:00:00Z',
      subject: { kind: 'CONTACT', key: 'cnt_123' },
      facts: { email: 'user@example.com', marketingConsent: true },
      evidence: []
    };

    const evaluation = evaluateOpportunity(snapshot, baseConfig);
    expect(evaluation.qualificationState).toBe('SATISFIED');
    expect(evaluation.satisfiedGoalKeys).toContain('goal_mql_consent');

    const intents = planTransition(snapshot, evaluation, baseConfig);
    expect(intents.length).toBeGreaterThan(0);
    if (intents[0].kind === 'UPDATE_OPPORTUNITY') {
      expect(intents[0].qualificationState).toBe('SATISFIED');
    }
  });

  it('should return PENDING when goals are unsatisfied', () => {
    const snapshot: OpportunitySnapshot = {
      organizationKey: 'org_test',
      relationshipKey: 'rel_123',
      relationshipType: 'b2b',
      opportunityKey: 'rel_123::MQL::1',
      opportunityType: 'MQL',
      opportunityState: 'OPEN',
      cycleIndex: 1,
      openedAt: '2026-08-05T00:00:00Z',
      subject: { kind: 'CONTACT', key: 'cnt_123' },
      facts: { email: 'user@example.com', marketingConsent: false },
      evidence: []
    };

    const evaluation = evaluateOpportunity(snapshot, baseConfig);
    expect(evaluation.qualificationState).toBe('PENDING');
    expect(evaluation.unsatisfiedGoalKeys).toContain('goal_mql_consent');

    const intents = planTransition(snapshot, evaluation, baseConfig);
    expect(intents).toHaveLength(1);
    if (intents[0].kind === 'UPDATE_OPPORTUNITY') {
      expect(intents[0].qualificationState).toBe('PENDING');
    }
  });

  it('should return BLOCKED when subject is automation suppressed', () => {
    const snapshot: OpportunitySnapshot = {
      organizationKey: 'org_test',
      relationshipKey: 'rel_123',
      relationshipType: 'b2b',
      opportunityKey: 'rel_123::MQL::1',
      opportunityType: 'MQL',
      opportunityState: 'OPEN',
      cycleIndex: 1,
      openedAt: '2026-08-05T00:00:00Z',
      subject: { kind: 'CONTACT', key: 'cnt_123' },
      facts: { email: 'user@example.com', marketingConsent: true, automationSuppressed: true },
      evidence: []
    };

    const evaluation = evaluateOpportunity(snapshot, baseConfig);
    expect(evaluation.qualificationState).toBe('BLOCKED');

    const intents = planTransition(snapshot, evaluation, baseConfig);
    expect(intents).toHaveLength(1);
    expect(intents[0].kind).toBe('NOOP');
  });

  it('should return NOOP when attempting to transition an already WON opportunity with existing successor', () => {
    const snapshot: OpportunitySnapshot = {
      organizationKey: 'org_test',
      relationshipKey: 'rel_123',
      relationshipType: 'b2b',
      opportunityKey: 'rel_123::MQL::1',
      opportunityType: 'MQL',
      opportunityState: 'WON',
      cycleIndex: 1,
      openedAt: '2026-08-05T00:00:00Z',
      subject: { kind: 'CONTACT', key: 'cnt_123' },
      facts: { email: 'user@example.com', successorAlreadyExists: true },
      evidence: []
    };

    const evaluation = evaluateOpportunity(snapshot, baseConfig);
    const intents = planTransition(snapshot, evaluation, baseConfig);

    expect(intents).toHaveLength(1);
    expect(intents[0].kind).toBe('NOOP');
  });

  it('should enforce evidence window boundary for RTP cycle (sincePredecessorCompletion)', () => {
    const snapshot: OpportunitySnapshot = {
      organizationKey: 'org_test',
      relationshipKey: 'rel_123',
      relationshipType: 'b2b',
      opportunityKey: 'rel_123::RTP::2',
      opportunityType: 'RTP',
      opportunityState: 'OPEN',
      cycleIndex: 2,
      openedAt: '2026-08-05T10:00:00Z',
      predecessorCompletedAt: '2026-08-05T09:00:00Z',
      subject: { kind: 'CONTACT', key: 'cnt_123' },
      facts: {},
      evidence: [
        {
          id: 'ev_old',
          predicate: 'activityExists',
          scope: 'opportunity',
          occurredAt: '2026-08-05T08:00:00Z',
          data: { type: 'MEETING', outcome: 'COMPLETED' }
        },
        {
          id: 'ev_new',
          predicate: 'activityExists',
          scope: 'opportunity',
          occurredAt: '2026-08-05T09:30:00Z',
          data: { type: 'MEETING', outcome: 'COMPLETED' }
        }
      ]
    };

    const evaluation = evaluateOpportunity(snapshot, baseConfig);
    expect(evaluation.evidenceRefsByGoal['goal_sql_meeting'] || []).not.toContain('ev_old');
  });
});
