import { describe, it, expect, vi } from 'vitest';
import { HubspotAdapter } from '../../packages/hubspot-adapter/adapter';
import { TransitionIntent } from '../../packages/commercial-kernel';

describe('HubSpot Adapter Contract Tests with Strict Fake', () => {
  it('should find or create initial Lead for subject natively', async () => {
    const adapter = new HubspotAdapter('fake-token');
    const rawClient = adapter.getRawClient();

    const searchMock = vi.fn().mockResolvedValue({ results: [] });
    const createLeadMock = vi.fn().mockResolvedValue({ id: 'lead_bootstrap_1', properties: { coa_opportunity_key: 'rel_acme::LEAD::1' } });
    const assocMock = vi.fn().mockResolvedValue({ results: [{ toObjectId: 'cnt_assoc_1' }] });

    rawClient.crm.objects.leads.searchApi.doSearch = searchMock;
    rawClient.crm.objects.leads.basicApi.create = createLeadMock;
    rawClient.crm.associations.v4.basicApi.getPage = assocMock;

    const lead = await adapter.findOrCreateLeadForSubject({ kind: 'COMPANY', key: 'comp_123' }, 'rel_acme', 'b2b');

    expect(lead?.id).toBe('lead_bootstrap_1');
    expect(createLeadMock).toHaveBeenCalledWith(expect.objectContaining({
      properties: expect.objectContaining({
        coa_opportunity_key: 'rel_acme::LEAD::1',
        coa_opportunity_type: 'MQL',
        hs_pipeline_stage: 'mql'
      })
    }));
  });

  it('should apply CREATE_SUCCESSOR intent for FTP Deal natively', async () => {
    const adapter = new HubspotAdapter('fake-token');
    const rawClient = adapter.getRawClient();

    const searchMock = vi.fn().mockResolvedValue({ results: [] });
    const createDealMock = vi.fn().mockResolvedValue({ id: 'deal_456' });
    const getByIdMock = vi.fn().mockResolvedValue({
      id: 'deal_456',
      properties: {
        dealname: 'Transaction Deal - rel_acme::FTP::1',
        pipeline: 'b2b_transaction_deal_pipeline',
        dealstage: 'open',
        coa_opportunity_key: 'rel_acme::FTP::1',
        coa_relationship_key: 'rel_acme',
        coa_opportunity_type: 'FTP',
        coa_cycle_index: '1',
        coa_managed: 'true'
      }
    });

    rawClient.crm.deals.searchApi.doSearch = searchMock;
    rawClient.crm.deals.basicApi.create = createDealMock;
    rawClient.crm.deals.basicApi.getById = getByIdMock;

    const intents: TransitionIntent[] = [{
      kind: 'CREATE_SUCCESSOR',
      predecessorKey: 'rel_acme::LEAD::1',
      successorKey: 'rel_acme::FTP::1',
      successorType: 'FTP',
      cycleIndex: 1
    }];

    const result = await adapter.applyTransitionIntents(intents, 'trans_456');

    expect(result.success).toBe(true);
    expect(result.appliedIntents).toBe(1);
    expect(createDealMock).toHaveBeenCalledWith(expect.objectContaining({
      properties: expect.objectContaining({
        coa_opportunity_key: 'rel_acme::FTP::1',
        coa_opportunity_type: 'FTP'
      })
    }));
  });
});
