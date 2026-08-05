import { describe, it, expect } from 'vitest';
import { OrganizationConfigResolver } from '../../packages/domain/config-resolver';
import { evaluateOpportunity, QualificationConfig, OpportunitySnapshot } from '../../packages/commercial-kernel';

describe('Stateless Commercial Operations Reconciliation Integration Suite', () => {
  it('should resolve portal installation mapping explicitly', () => {
    const resolver = new OrganizationConfigResolver();
    const config = resolver.resolveConfig({ portalId: '149041124', relationshipType: 'b2b' });

    expect(config.organizationKey).toBe('org_global_corp');
    expect(config.relationshipType).toBe('b2b');
    expect(config.configVersion).toBe('1.0.0');
  });

  it('should reject unregistered unknown portals explicitly', () => {
    const resolver = new OrganizationConfigResolver();
    expect(() => resolver.resolveConfig({ portalId: '999999999', relationshipType: 'b2b' }))
      .toThrow('UNSUPPORTED_PORTAL');
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
