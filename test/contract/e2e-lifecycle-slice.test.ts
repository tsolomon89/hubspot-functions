import { describe, it, expect } from 'vitest';
import { evaluateOpportunity, planTransition, QualificationConfig, OpportunitySnapshot } from '../../packages/commercial-kernel';

describe('End-to-End Vertical Slice: MQL -> SQL -> Qualified -> FTP Deal Creation', () => {
  const config: QualificationConfig = {
    organizationKey: 'org_global_corp',
    configVersion: '1.0.0',
    relationshipType: 'b2b',
    goalsByOpportunityType: {
      MQL: [{ key: 'mql_identity', name: 'Identifiable subject with email', predicate: 'hasIdentity', params: { field: 'email' } }],
      SQL: [
        { key: 'sql_offering', name: 'Known offering interest', predicate: 'hasOfferingInterest', params: { minProducts: 1 } },
        { key: 'sql_meeting', name: 'Completed positive meeting', predicate: 'activityExists', params: { activityType: 'MEETING', outcome: 'COMPLETED' } }
      ],
      FTP: [{ key: 'ftp_transaction', name: 'First completed transaction', predicate: 'transactionExists', params: { minAmount: 1 } }],
      RTP: []
    }
  };

  it('Step 1: Should evaluate MQL goals satisfied and advance Lead to SQL stage without closing Lead', () => {
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
      facts: { email: 'alice@acme.com' },
      evidence: []
    };

    const evalRes = evaluateOpportunity(snapshot, config);
    expect(evalRes.qualificationState).toBe('SATISFIED');

    const intents = planTransition(snapshot, evalRes, config);
    expect(intents).toHaveLength(2);
    expect(intents[0].kind).toBe('UPDATE_OPPORTUNITY');
    if (intents[0].kind === 'UPDATE_OPPORTUNITY') {
      expect(intents[0].newState).toBe('OPEN');
      expect(intents[0].details?.targetLeadStage).toBe('sql');
      expect(intents[0].details?.targetOpportunityType).toBe('SQL');
    }
    expect(intents[1].kind).toBe('PROJECT_LIFECYCLE_STAGE');
  });

  it('Step 2: Should evaluate SQL goals satisfied, mark Lead Qualified (WON), and create FTP Deal successor', () => {
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
      facts: { email: 'alice@acme.com', products: ['prod_software'] },
      evidence: [{
        id: 'meet_101',
        predicate: 'activityExists',
        scope: 'opportunity',
        occurredAt: '2026-08-05T01:00:00.000Z',
        data: { activityType: 'MEETING', outcome: 'COMPLETED' }
      }]
    };

    const evalRes = evaluateOpportunity(snapshot, config);
    expect(evalRes.qualificationState).toBe('SATISFIED');

    const intents = planTransition(snapshot, evalRes, config);
    expect(intents.some(i => i.kind === 'CREATE_SUCCESSOR')).toBe(true);

    const successorIntent = intents.find(i => i.kind === 'CREATE_SUCCESSOR');
    if (successorIntent && successorIntent.kind === 'CREATE_SUCCESSOR') {
      expect(successorIntent.successorType).toBe('FTP');
      expect(successorIntent.successorKey).toBe('comp_acme::FTP::1');
      expect(successorIntent.predecessorKey).toBe('comp_acme::LEAD::1');
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
      facts: { email: 'alice@acme.com', products: ['prod_software'] },
      evidence: []
    };

    const evalRes = evaluateOpportunity(snapshot, config);
    const intents = planTransition(snapshot, evalRes, config);

    expect(intents).toHaveLength(1);
    expect(intents[0].kind).toBe('NOOP');
  });
});
