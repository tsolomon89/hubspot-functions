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

  it('should plan transition from MQL to SQL upon MQL completion', () => {
    const snapshot: OpportunitySnapshot = {
      organizationKey: 'org_test',
      relationshipKey: 'rel_123',
      relationshipType: 'b2b',
      opportunityKey: 'rel_123::MQL::1',
      opportunityType: 'MQL',
      cycleIndex: 1,
      openedAt: '2026-08-05T00:00:00Z',
      subject: { kind: 'CONTACT', key: 'cnt_123' },
      facts: { email: 'user@example.com' },
      evidence: []
    };

    const evaluation = evaluateOpportunity(snapshot, baseConfig);
    const intents = planTransition(snapshot, evaluation, baseConfig);

    expect(intents).toHaveLength(3);
    expect(intents[0]).toEqual({
      kind: 'UPDATE_OPPORTUNITY',
      opportunityKey: 'rel_123::MQL::1',
      newState: 'WON',
      qualificationState: 'SATISFIED'
    });
    expect(intents[1]).toEqual({
      kind: 'PROJECT_LIFECYCLE_STAGE',
      subject: { kind: 'CONTACT', key: 'cnt_123' },
      stage: 'marketingqualifiedlead'
    });
    expect(intents[2]).toEqual({
      kind: 'CREATE_SUCCESSOR',
      predecessorKey: 'rel_123::MQL::1',
      successorKey: 'rel_123::SQL::1',
      successorType: 'SQL',
      cycleIndex: 1
    });
  });

  it('should plan transition from SQL to FTP upon SQL completion', () => {
    const snapshot: OpportunitySnapshot = {
      organizationKey: 'org_test',
      relationshipKey: 'rel_123',
      relationshipType: 'b2b',
      opportunityKey: 'rel_123::SQL::1',
      opportunityType: 'SQL',
      cycleIndex: 1,
      openedAt: '2026-08-05T00:00:00Z',
      subject: { kind: 'CONTACT', key: 'cnt_123' },
      facts: { email: 'user@example.com', products: ['product_core'] },
      evidence: [{
        id: 'ev_meet_1',
        predicate: 'activityExists',
        scope: 'opportunity',
        occurredAt: '2026-08-05T01:00:00Z',
        data: { activityType: 'MEETING', outcome: 'COMPLETED' }
      }]
    };

    const evaluation = evaluateOpportunity(snapshot, baseConfig);
    const intents = planTransition(snapshot, evaluation, baseConfig);

    expect(evaluation.qualificationState).toBe('SATISFIED');
    const successorIntent = intents.find(i => i.kind === 'CREATE_SUCCESSOR');
    expect(successorIntent).toEqual({
      kind: 'CREATE_SUCCESSOR',
      predecessorKey: 'rel_123::SQL::1',
      successorKey: 'rel_123::FTP::1',
      successorType: 'FTP',
      cycleIndex: 1
    });
  });

  it('should derive RTP_2 successor from completed RTP_1 opportunity', () => {
    const snapshot: OpportunitySnapshot = {
      organizationKey: 'org_test',
      relationshipKey: 'rel_123',
      relationshipType: 'b2b',
      opportunityKey: 'rel_123::RTP::1',
      opportunityType: 'RTP',
      cycleIndex: 1,
      openedAt: '2026-08-05T00:00:00Z',
      subject: { kind: 'CONTACT', key: 'cnt_123' },
      facts: { transactionCompleted: true },
      evidence: []
    };

    const evaluation = evaluateOpportunity(snapshot, baseConfig);
    const intents = planTransition(snapshot, evaluation, baseConfig);

    const successorIntent = intents.find(i => i.kind === 'CREATE_SUCCESSOR');
    expect(successorIntent).toEqual({
      kind: 'CREATE_SUCCESSOR',
      predecessorKey: 'rel_123::RTP::1',
      successorKey: 'rel_123::RTP::2',
      successorType: 'RTP',
      cycleIndex: 2
    });
  });
});
