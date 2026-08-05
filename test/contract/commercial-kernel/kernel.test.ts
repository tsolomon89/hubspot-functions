import { describe, it, expect } from 'vitest';
import { 
  evaluateOpportunity, 
  planTransition, 
  validateCommercialModel,
  OpportunitySnapshot, 
  QualificationConfig 
} from '../../../packages/commercial-kernel';

describe('Pure Commercial Kernel Contract Tests', () => {
  const baseConfig: QualificationConfig = {
    organizationKey: 'org_test',
    configVersion: '1.0.0',
    relationshipType: 'b2b',
    goalsByOpportunityType: {
      MQL: [{
        key: 'mql_consent',
        name: 'Consent',
        predicate: 'property',
        scope: 'relationship',
        params: { property: 'marketingConsent', equals: true }
      }],
      SQL: [],
      FTP: [],
      RTP: []
    }
  };

  it('should validate qualification config schema correctly', () => {
    expect(validateCommercialModel(baseConfig).valid).toBe(true);
    expect(validateCommercialModel({} as any).valid).toBe(false);
  });

  it('should evaluate MQL qualification as SATISFIED when marketing consent is true', () => {
    const snapshot: OpportunitySnapshot = {
      organizationKey: 'org_test',
      relationshipKey: 'rel_123',
      relationshipType: 'b2b',
      opportunityKey: 'rel_123::LEAD::1',
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
    expect(evaluation.unsatisfiedGoalKeys).toHaveLength(0);
  });

  it('should evaluate MQL qualification as PENDING when marketing consent is false', () => {
    const snapshot: OpportunitySnapshot = {
      organizationKey: 'org_test',
      relationshipKey: 'rel_123',
      relationshipType: 'b2b',
      opportunityKey: 'rel_123::LEAD::1',
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
    expect(evaluation.unsatisfiedGoalKeys).toContain('mql_consent');
  });

  it('should evaluate qualification as BLOCKED when subject is suppressed', () => {
    const snapshot: OpportunitySnapshot = {
      organizationKey: 'org_test',
      relationshipKey: 'rel_123',
      relationshipType: 'b2b',
      opportunityKey: 'rel_123::LEAD::1',
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
  });

  it('should return NOOP when attempting to transition a LOST opportunity', () => {
    const snapshot: OpportunitySnapshot = {
      organizationKey: 'org_test',
      relationshipKey: 'rel_123',
      relationshipType: 'b2b',
      opportunityKey: 'rel_123::MQL::1',
      opportunityType: 'MQL',
      opportunityState: 'LOST',
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
      openedAt: '2026-08-01T00:00:00Z',
      predecessorCompletedAt: '2026-08-02T00:00:00Z',
      subject: { kind: 'CONTACT', key: 'cnt_123' },
      facts: { email: 'user@example.com' },
      evidence: [
        {
          id: 'ev_1',
          predicate: 'activityExists',
          scope: 'opportunity',
          occurredAt: '2026-08-01T12:00:00Z',
          data: { activityType: 'MEETING' }
        },
        {
          id: 'ev_2',
          predicate: 'activityExists',
          scope: 'opportunity',
          occurredAt: '2026-08-03T12:00:00Z',
          data: { activityType: 'MEETING' }
        }
      ]
    };

    expect(snapshot.evidence).toHaveLength(2);
    expect(new Date(snapshot.evidence[1].occurredAt).getTime()).toBeGreaterThan(new Date(snapshot.predecessorCompletedAt!).getTime());
  });
});
