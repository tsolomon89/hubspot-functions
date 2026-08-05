import { describe, it, expect, vi } from 'vitest';
import { HubspotAdapter } from '../../packages/hubspot-adapter/adapter';
import { HubSpotSnapshotLoader } from '../../packages/hubspot-adapter/snapshot-loader';
import { OrganizationConfigResolver } from '../../packages/domain/config-resolver';
import { evaluateOpportunity, planTransition } from '../../packages/commercial-kernel';

describe('Complete Adapter-Level Lifecycle Contract Tests with In-Memory Fake', () => {
  it('Step 1: Should bootstrap initial Lead with association IDs 608/610 and evaluate MQL goals satisfied', async () => {
    const adapter = new HubspotAdapter('fake-token');
    const rawClient = adapter.getRawClient();

    const contactGetMock = vi.fn().mockResolvedValue({
      id: 'cnt_101',
      properties: {
        email: 'bob@acme.com',
        coa_relationship_key: 'rel_acme',
        coa_relationship_type: 'b2b',
        coa_marketing_consent: 'true'
      }
    });

    const leadSearchMock = vi.fn().mockResolvedValue({ results: [] });
    const leadCreateMock = vi.fn().mockResolvedValue({
      id: 'lead_bootstrap_1',
      properties: {
        coa_opportunity_key: 'rel_acme::LEAD::1',
        coa_opportunity_type: 'MQL',
        hs_pipeline_stage: 'mql',
        coa_cycle_index: '1'
      }
    });

    const assocPageMock = vi.fn().mockResolvedValue({ results: [] });

    rawClient.crm.contacts.basicApi.getById = contactGetMock;
    rawClient.crm.objects.leads.searchApi.doSearch = leadSearchMock;
    rawClient.crm.objects.leads.basicApi.create = leadCreateMock;
    rawClient.crm.associations.v4.basicApi.getPage = assocPageMock;

    const configResolver = new OrganizationConfigResolver();
    const config = configResolver.resolveConfig({ portalId: 149041124 });

    const loader = new HubSpotSnapshotLoader(adapter);
    const snapshot = await loader.loadSnapshotFromRecord({ objectType: 'contact', objectId: 'cnt_101' }, 'org_global_corp', 'b2b', config);

    expect(snapshot.opportunityKey).toBe('rel_acme::LEAD::1');
    expect(snapshot.facts.marketingConsent).toBe(true);

    const evalRes = evaluateOpportunity(snapshot, config);
    expect(evalRes.qualificationState).toBe('SATISFIED');

    const intents = planTransition(snapshot, evalRes, config);
    expect(intents[0].kind).toBe('UPDATE_OPPORTUNITY');
    if (intents[0].kind === 'UPDATE_OPPORTUNITY') {
      expect(intents[0].details?.targetLeadStage).toBe('sql');
    }
  });

  it('Step 2: Should advance SQL Lead to Qualified and create FTP Deal with Contact/Company associations', async () => {
    const adapter = new HubspotAdapter('fake-token');
    const rawClient = adapter.getRawClient();

    const dealSearchMock = vi.fn().mockResolvedValue({ results: [] });
    const dealCreateMock = vi.fn().mockResolvedValue({ id: 'deal_ftp_1' });
    const dealGetByIdMock = vi.fn().mockResolvedValue({
      id: 'deal_ftp_1',
      properties: {
        coa_opportunity_key: 'rel_acme::FTP::1',
        coa_opportunity_type: 'FTP',
        coa_cycle_index: '1'
      }
    });

    const leadUpdateMock = vi.fn().mockResolvedValue({ id: 'lead_bootstrap_1' });
    const leadGetByIdMock = vi.fn().mockResolvedValue({
      id: 'lead_bootstrap_1',
      properties: {
        coa_qualification_state: 'SATISFIED',
        hs_pipeline_stage: 'qualified'
      }
    });

    const contactUpdateMock = vi.fn().mockResolvedValue({ id: 'cnt_101' });
    const contactGetByIdMock = vi.fn().mockResolvedValue({
      id: 'cnt_101',
      properties: { lifecyclestage: 'salesqualifiedlead' }
    });

    const assocPageMock = vi.fn().mockResolvedValue({ results: [{ toObjectId: 'cnt_101' }] });

    rawClient.crm.deals.searchApi.doSearch = dealSearchMock;
    rawClient.crm.deals.basicApi.create = dealCreateMock;
    rawClient.crm.deals.basicApi.getById = dealGetByIdMock;
    rawClient.crm.objects.leads.basicApi.update = leadUpdateMock;
    rawClient.crm.objects.leads.basicApi.getById = leadGetByIdMock;
    rawClient.crm.contacts.basicApi.update = contactUpdateMock;
    rawClient.crm.contacts.basicApi.getById = contactGetByIdMock;
    rawClient.crm.associations.v4.basicApi.getPage = assocPageMock;

    const configResolver = new OrganizationConfigResolver();
    const config = configResolver.resolveConfig({ portalId: 149041124 });

    const intents = [
      {
        kind: 'UPDATE_OPPORTUNITY' as const,
        opportunityKey: 'rel_acme::LEAD::1',
        newState: 'WON' as const,
        qualificationState: 'SATISFIED' as const,
        targetRecordId: 'lead_bootstrap_1',
        targetObjectType: 'lead' as const,
        details: { targetLeadStage: 'qualified' }
      },
      {
        kind: 'PROJECT_LIFECYCLE_STAGE' as const,
        subject: { kind: 'CONTACT' as const, key: 'cnt_101' },
        stage: 'salesqualifiedlead'
      },
      {
        kind: 'CREATE_SUCCESSOR' as const,
        predecessorKey: 'rel_acme::LEAD::1',
        successorKey: 'rel_acme::FTP::1',
        successorType: 'FTP' as const,
        cycleIndex: 1,
        subject: { kind: 'CONTACT' as const, key: 'cnt_101' }
      }
    ];

    const res = await adapter.applyTransitionIntents(intents, 'trans_e2e_1', config);
    expect(res.success).toBe(true);
    expect(dealCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      properties: expect.objectContaining({
        coa_opportunity_key: 'rel_acme::FTP::1',
        pipeline: 'b2b_transaction_deal_pipeline'
      }),
      associations: expect.arrayContaining([
        expect.objectContaining({
          to: { id: 'cnt_101' },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }]
        })
      ])
    }));
  });
});
