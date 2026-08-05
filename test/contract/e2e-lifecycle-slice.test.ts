import { describe, it, expect } from 'vitest';
import { 
  evaluateOpportunity, 
  planTransition, 
  OpportunitySnapshot, 
  QualificationConfig 
} from '../../packages/commercial-kernel';

describe('End-to-End Vertical Slice: MQL -> SQL -> Qualified -> FTP Deal Creation', () => {
  const config: QualificationConfig = {
    organizationKey: 'org_global_corp',
    configVersion: '1.0.0',
    relationshipType: 'b2b',
    goalsByOpportunityType: {
      MQL: [{
        key: 'mql_consent',
        name: 'Consent',
        scope: 'relationship',
        predicates: [{ predicate: 'marketingConsent', value: true }]
      }],
      SQL: [{
        key: 'sql_offering',
        name: 'Offering Known',
        scope: 'relationship',
        predicates: [{ predicate: 'offeringKnown', value: true }]
      }],
      FTP: [],
      RTP: []
    },
    hubspotPipelines: {
      leadPipelineId: 'b2b_qualification_lead_pipeline',
      dealPipelineId: 'b2b_transaction_deal_pipeline'
    }
  };

  it('Step 1: Contact/Company enrollment -> MQL Lead bootstrap & MQL qualification', () => {
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
      facts: { email: 'alice@acme.com', marketingConsent: true },
      evidence: []
    };

    const evalRes = evaluateOpportunity(snapshot, config);
    expect(evalRes.qualificationState).toBe('SATISFIED');

    const intents = planTransition(snapshot, evalRes, config);
    expect(intents).toHaveLength(2);
    expect(intents[0].kind).toBe('UPDATE_OPPORTUNITY');
    if (intents[0].kind === 'UPDATE_OPPORTUNITY') {
      expect(intents[0].details?.targetOpportunityType).toBe('SQL');
      expect(intents[0].details?.targetLeadStage).toBe('sql');
    }
    expect(intents[1].kind).toBe('PROJECT_LIFECYCLE_STAGE');
    if (intents[1].kind === 'PROJECT_LIFECYCLE_STAGE') {
      expect(intents[1].stage).toBe('marketingqualifiedlead');
    }
  });

  it('Step 2: Same Lead progressed to SQL -> SQL satisfied -> Lead Qualified & CREATE_SUCCESSOR FTP Deal', () => {
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
      facts: { email: 'alice@acme.com', products: ['prod_software'], offeringKeys: ['prod_software'] },
      evidence: []
    };

    const evalRes = evaluateOpportunity(snapshot, config);
    expect(evalRes.qualificationState).toBe('SATISFIED');

    const intents = planTransition(snapshot, evalRes, config);
    expect(intents).toHaveLength(3);
    expect(intents[0].kind).toBe('UPDATE_OPPORTUNITY');
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

  it('Step 3: Should handle terminal LOST opportunity safely with NOOP intent', () => {
    const snapshot: OpportunitySnapshot = {
      organizationKey: 'org_global_corp',
      relationshipKey: 'comp_acme',
      relationshipType: 'b2b',
      opportunityKey: 'comp_acme::LEAD::1',
      opportunityType: 'SQL',
      opportunityState: 'LOST',
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
