import { describe, it, expect } from 'vitest';
import { 
  evaluateOpportunity, 
  planTransition,
  OpportunitySnapshot
} from '../../packages/commercial-kernel';
import { OrganizationConfigResolver } from '../../packages/domain/config-resolver';

describe('End-to-End Vertical Slice: MQL -> SQL -> Qualified -> FTP Deal Creation', () => {
  const config = OrganizationConfigResolver.resolveConfigByPortalId(149041124);

  it('Step 1: Should evaluate MQL opportunity for Contact, satisfy goals via marketing consent, and plan transition to SQL', () => {
    const snapshot: OpportunitySnapshot = {
      organizationKey: 'org_global_corp',
      relationshipKey: 'comp_acme',
      relationshipType: 'b2b',
      opportunityKey: 'comp_acme::LEAD::1',
      opportunityType: 'MQL',
      opportunityState: 'OPEN',
      cycleIndex: 1,
      openedAt: '2026-08-05T00:00:00.000Z',
      subject: { kind: 'COMPANY', key: 'comp_acme', contactKeys: ['cnt_1'] },
      facts: {
        email: 'alice@acme.com',
        marketingConsent: true
      },
      evidence: []
    };

    const evalRes = evaluateOpportunity(snapshot, config);
    expect(evalRes.qualificationState).toBe('SATISFIED');

    const intents = planTransition(snapshot, evalRes, config);
    expect(intents).toHaveLength(2);
    if (intents[0].kind === 'UPDATE_OPPORTUNITY') {
      expect(intents[0].qualificationState).toBe('SATISFIED');
      expect(intents[0].details?.targetOpportunityType).toBe('SQL');
      expect(intents[0].details?.targetLeadStage).toBe('sql');
    }
    expect(intents[1].kind).toBe('PROJECT_LIFECYCLE_STAGE');
    if (intents[1].kind === 'PROJECT_LIFECYCLE_STAGE') {
      expect(intents[1].stage).toBe('marketingqualifiedlead');
    }
  });

  it('Step 2: Should evaluate SQL opportunity with meeting evidence, satisfy goals, and plan transition to Qualified & FTP Deal creation', () => {
    const snapshot: OpportunitySnapshot = {
      organizationKey: 'org_global_corp',
      relationshipKey: 'comp_acme',
      relationshipType: 'b2b',
      opportunityKey: 'comp_acme::LEAD::1',
      opportunityType: 'SQL',
      opportunityState: 'OPEN',
      cycleIndex: 1,
      openedAt: '2026-08-05T00:00:00.000Z',
      subject: { kind: 'COMPANY', key: 'comp_acme', contactKeys: ['cnt_1'] },
      facts: {
        email: 'alice@acme.com',
        products: ['prod_software']
      },
      evidence: [
        {
          id: 'mtg_1',
          predicate: 'activityExists',
          scope: 'opportunity',
          occurredAt: '2026-08-05T01:00:00.000Z',
          data: { activityType: 'MEETING', outcome: 'COMPLETED' }
        }
      ]
    };

    const evalRes = evaluateOpportunity(snapshot, config);
    expect(evalRes.qualificationState).toBe('SATISFIED');

    const intents = planTransition(snapshot, evalRes, config);
    expect(intents).toHaveLength(3);
    
    if (intents[0].kind === 'UPDATE_OPPORTUNITY') {
      expect(intents[0].newState).toBe('WON');
      expect(intents[0].details?.targetLeadStage).toBe('qualified');
    }

    expect(intents[1].kind).toBe('PROJECT_LIFECYCLE_STAGE');
    if (intents[1].kind === 'PROJECT_LIFECYCLE_STAGE') {
      expect(intents[1].stage).toBe('salesqualifiedlead');
    }

    expect(intents[2].kind).toBe('CREATE_SUCCESSOR');
    if (intents[2].kind === 'CREATE_SUCCESSOR') {
      expect(intents[2].successorType).toBe('FTP');
      expect(intents[2].successorKey).toBe('comp_acme::FTP::1');
      expect(intents[2].predecessorKey).toBe('comp_acme::LEAD::1');
    }
  });

  it('Step 3: Should handle closed opportunity replay safely with NOOP intent', () => {
    const snapshot: OpportunitySnapshot = {
      organizationKey: 'org_global_corp',
      relationshipKey: 'comp_acme',
      relationshipType: 'b2b',
      opportunityKey: 'comp_acme::LEAD::1',
      opportunityType: 'SQL',
      opportunityState: 'WON',
      cycleIndex: 1,
      openedAt: '2026-08-05T00:00:00.000Z',
      subject: { kind: 'COMPANY', key: 'comp_acme', contactKeys: ['cnt_1'] },
      facts: { email: 'alice@acme.com', products: ['prod_software'], successorAlreadyExists: true },
      evidence: []
    };

    const evalRes = evaluateOpportunity(snapshot, config);
    const intents = planTransition(snapshot, evalRes, config);

    expect(intents).toHaveLength(1);
    expect(intents[0].kind).toBe('NOOP');
  });
});
