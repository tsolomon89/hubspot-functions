import { describe, it, expect } from 'vitest';
import { ReconciliationWorker } from '../../services/worker';
import { resolveSubjectIdentity } from '../../packages/domain';
import { evaluateOpportunity, QualificationConfig, OpportunitySnapshot } from '../../packages/commercial-kernel';

describe('Worker Queue Engine & Universal Commercial Kernel Integration Suite', () => {
  it('should process B2C Contact intake job via ReconciliationWorker', async () => {
    const worker = new ReconciliationWorker();
    const result = await worker.processIntakeJob('test_corr_1', {
      contact: { email: 'alice@example.com', firstName: 'Alice', lastName: 'Smith' },
      organizationKey: 'org_consumer_brand',
      relationshipType: 'b2c'
    });

    expect(result.success).toBe(true);
    expect(result.subjectKey).toBe('alice@example.com');
    expect(result.opportunityKey).toBe('org_consumer_brand_b2c_alice@example.com::MQL::1');
    expect(result.qualificationState).toBe('SATISFIED');
  });

  it('should process B2B Company + Contact intake job via ReconciliationWorker', async () => {
    const worker = new ReconciliationWorker();
    const result = await worker.processIntakeJob('test_corr_2', {
      company: { name: 'Acme Corp', domain: 'acme.com' },
      contact: { email: 'bob@acme.com', firstName: 'Bob' },
      organizationKey: 'org_global_corp',
      relationshipType: 'b2b'
    });

    expect(result.success).toBe(true);
    expect(result.subjectKey).toBe('acme.com');
    expect(result.opportunityKey).toBe('org_global_corp_b2b_acme.com::MQL::1');
  });

  it('should evaluate B2B SQL goal requirement deterministically', () => {
    const config: QualificationConfig = {
      organizationKey: 'org_test',
      configVersion: '1.0.0',
      relationshipType: 'b2b',
      goalsByOpportunityType: {
        MQL: [],
        SQL: [{
          key: 'meeting_goal',
          name: 'Positive meeting',
          predicate: 'activityExists',
          params: { activityType: 'MEETING', outcome: 'COMPLETED' }
        }],
        FTP: [],
        RTP: []
      }
    };

    const snapshot: OpportunitySnapshot = {
      organizationKey: 'org_test',
      relationshipKey: 'rel_acme',
      relationshipType: 'b2b',
      opportunityKey: 'rel_acme::SQL::1',
      opportunityType: 'SQL',
      opportunityState: 'OPEN',
      cycleIndex: 1,
      openedAt: '2026-08-05T00:00:00Z',
      subject: { kind: 'COMPANY', key: 'acme.com' },
      facts: { email: 'bob@acme.com', products: ['prod_software'] },
      evidence: []
    };

    const evalRes = evaluateOpportunity(snapshot, config);
    expect(evalRes.qualificationState).toBe('PENDING');
    expect(evalRes.unsatisfiedGoalKeys).toContain('meeting_goal');
  });
});
