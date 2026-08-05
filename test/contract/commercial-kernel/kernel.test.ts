import { describe, it, expect } from 'vitest';
import { 
  injectUniversalGoals, 
  evaluateOpportunity, 
  planTransition, 
  deriveSuccessorKey, 
  projectLifecycleStage,
  QualificationConfig,
  OpportunitySnapshot 
} from '../../../packages/commercial-kernel';

describe('Pure Commercial Kernel Contract Tests', () => {
  const baseConfig: QualificationConfig = {
    organizationKey: 'org_test',
    configVersion: '1.0.0',
    relationshipType: 'b2b',
    goalsByOpportunityType: {
      MQL: [],
      SQL: [{
        key: 'custom_sql_meeting',
        name: 'Positive meeting',
        predicate: 'activityExists',
        params: { activityType: 'MEETING', outcome: 'COMPLETED' }
      }],
      FTP: [],
      RTP: []
    }
  };

  it('should inject universal minimum goals into configuration deterministically', () => {
    const fullConfig = injectUniversalGoals(baseConfig);
    
    expect(fullConfig.goalsByOpportunityType.MQL.some(g => g.key === 'universal_mql_communication_channel')).toBe(true);
    expect(fullConfig.goalsByOpportunityType.SQL.some(g => g.key === 'universal_sql_offering_known')).toBe(true);
    expect(fullConfig.goalsByOpportunityType.FTP.some(g => g.key === 'universal_ftp_first_transaction')).toBe(true);
    expect(fullConfig.goalsByOpportunityType.RTP.some(g => g.key === 'universal_rtp_subsequent_transaction')).toBe(true);
  });

  it('should evaluate MQL as PENDING if no communication channel exists', () => {
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
      facts: {},
      evidence: []
    };

    const evaluation = evaluateOpportunity(snapshot, baseConfig);
    expect(evaluation.qualificationState).toBe('PENDING');
    expect(evaluation.unsatisfiedGoalKeys).toContain('universal_mql_communication_channel');
  });

  it('should evaluate MQL as SATISFIED when email fact is present', () => {
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
      facts: { email: 'user@example.com' },
      evidence: []
    };

    const evaluation = evaluateOpportunity(snapshot, baseConfig);
    expect(evaluation.qualificationState).toBe('SATISFIED');
    expect(evaluation.satisfiedGoalKeys).toContain('universal_mql_communication_channel');
  });

  it('should return NOOP when attempting to transition an already WON opportunity', () => {
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
      facts: { email: 'user@example.com' },
      evidence: []
    };

    const evaluation = evaluateOpportunity(snapshot, baseConfig);
    const intents = planTransition(snapshot, evaluation, baseConfig);

    expect(intents).toHaveLength(1);
    expect(intents[0].kind).toBe('NOOP');
    if (intents[0].kind === 'NOOP') {
      expect(intents[0].reason).toContain('Opportunity is already closed');
    }
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
      openedAt: '2026-08-05T02:00:00Z',
      predecessorOpportunityKey: 'rel_123::RTP::1',
      predecessorCompletedAt: '2026-08-05T02:00:00Z',
      subject: { kind: 'CONTACT', key: 'cnt_123' },
      facts: {},
      evidence: [{
        id: 'ev_old_tx',
        predicate: 'transactionExists',
        scope: 'sincePredecessorCompletion',
        occurredAt: '2026-08-05T01:00:00Z',
        data: { transactionId: 'tx_old' }
      }]
    };

    const evaluation = evaluateOpportunity(snapshot, baseConfig);
    expect(evaluation.qualificationState).toBe('PENDING');
    expect(evaluation.unsatisfiedGoalKeys).toContain('universal_rtp_subsequent_transaction');
  });

  it('should satisfy RTP cycle when transaction evidence occurs AFTER predecessor completion boundary', () => {
    const snapshot: OpportunitySnapshot = {
      organizationKey: 'org_test',
      relationshipKey: 'rel_123',
      relationshipType: 'b2b',
      opportunityKey: 'rel_123::RTP::2',
      opportunityType: 'RTP',
      opportunityState: 'OPEN',
      cycleIndex: 2,
      openedAt: '2026-08-05T02:00:00Z',
      predecessorOpportunityKey: 'rel_123::RTP::1',
      predecessorCompletedAt: '2026-08-05T02:00:00Z',
      subject: { kind: 'CONTACT', key: 'cnt_123' },
      facts: {},
      evidence: [{
        id: 'ev_new_tx',
        predicate: 'transactionExists',
        scope: 'sincePredecessorCompletion',
        occurredAt: '2026-08-05T03:00:00Z',
        data: { transactionId: 'tx_new' }
      }]
    };

    const evaluation = evaluateOpportunity(snapshot, baseConfig);
    expect(evaluation.qualificationState).toBe('SATISFIED');
    expect(evaluation.satisfiedGoalKeys).toContain('universal_rtp_subsequent_transaction');
  });
});
