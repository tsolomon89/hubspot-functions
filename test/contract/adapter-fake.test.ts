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

    (rawClient.crm.objects as any).leads = {
      searchApi: { doSearch: searchMock },
      basicApi: { create: createLeadMock }
    };
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

  it('should fail verification when existing successor Deal has wrong pipeline ID', async () => {
    const adapter = new HubspotAdapter('fake-token');
    const rawClient = adapter.getRawClient();

    const searchMock = vi.fn().mockResolvedValue({
      results: [{
        id: 'deal_existing_corrupt',
        properties: {
          coa_opportunity_key: 'rel_acme::FTP::1',
          coa_opportunity_type: 'FTP',
          coa_cycle_index: '1',
          pipeline: 'WRONG_PIPELINE_ID',
          coa_relationship_key: 'rel_acme',
          coa_managed: 'true'
        }
      }]
    });

    rawClient.crm.deals.searchApi.doSearch = searchMock;

    const intents: TransitionIntent[] = [{
      kind: 'CREATE_SUCCESSOR',
      predecessorKey: 'rel_acme::LEAD::1',
      successorKey: 'rel_acme::FTP::1',
      successorType: 'FTP',
      cycleIndex: 1
    }];

    const result = await adapter.applyTransitionIntents(intents, 'trans_corrupt');

    expect(result.success).toBe(false);
    expect(result.receipts[0].verified).toBe(false);
  });

  it('should fail verification when existing successor Deal is missing required Company association', async () => {
    const adapter = new HubspotAdapter('fake-token');
    const rawClient = adapter.getRawClient();

    const searchMock = vi.fn().mockResolvedValue({
      results: [{
        id: 'deal_missing_assoc',
        properties: {
          coa_opportunity_key: 'rel_acme::FTP::1',
          coa_opportunity_type: 'FTP',
          coa_cycle_index: '1',
          pipeline: 'b2b_transaction_deal_pipeline',
          coa_relationship_key: 'rel_acme',
          coa_managed: 'true'
        }
      }]
    });

    const assocMock = vi.fn().mockResolvedValue({ results: [] });

    rawClient.crm.deals.searchApi.doSearch = searchMock;
    rawClient.crm.associations.v4.basicApi.getPage = assocMock;

    const intents: TransitionIntent[] = [{
      kind: 'CREATE_SUCCESSOR',
      predecessorKey: 'rel_acme::LEAD::1',
      successorKey: 'rel_acme::FTP::1',
      successorType: 'FTP',
      cycleIndex: 1,
      subject: { kind: 'COMPANY', key: 'comp_777' }
    }];

    const result = await adapter.applyTransitionIntents(intents, 'trans_missing_assoc');

    expect(result.success).toBe(false);
    expect(result.receipts[0].verified).toBe(false);
  });
});
