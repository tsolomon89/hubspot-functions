import { describe, it, expect, vi } from 'vitest';
import { HubspotAdapter } from '../../packages/hubspot-adapter';
import { TransitionIntent } from '../../packages/commercial-kernel';

describe('HubSpot Adapter Contract Tests with Strict Fake', () => {
  it('should apply CREATE_SUCCESSOR intent for SQL Lead natively', async () => {
    const adapter = new HubspotAdapter('fake-token');
    
    // Mock underlying CRM API methods
    const createLeadMock = vi.fn().mockResolvedValue({ id: 'lead_1001', properties: { coa_opportunity_key: 'rel_acme::SQL::1' } });
    const searchLeadMock = vi.fn().mockResolvedValue({ results: [] });
    const getLeadMock = vi.fn().mockResolvedValue({ id: 'lead_1001', properties: { coa_opportunity_key: 'rel_acme::SQL::1' } });

    const rawClient = adapter.getRawClient();
    rawClient.crm.objects.leads.searchApi.doSearch = searchLeadMock;
    rawClient.crm.objects.leads.basicApi.create = createLeadMock;
    rawClient.crm.objects.leads.basicApi.getById = getLeadMock;

    const intents: TransitionIntent[] = [{
      kind: 'CREATE_SUCCESSOR',
      predecessorKey: 'rel_acme::MQL::1',
      successorKey: 'rel_acme::SQL::1',
      successorType: 'SQL',
      cycleIndex: 1
    }];

    const result = await adapter.applyTransitionIntents(intents, 'trans_sql_1');

    expect(result.success).toBe(true);
    expect(result.appliedIntents).toBe(1);
    expect(createLeadMock).toHaveBeenCalledWith(expect.objectContaining({
      properties: expect.objectContaining({
        coa_opportunity_key: 'rel_acme::SQL::1',
        coa_opportunity_type: 'SQL'
      })
    }));
  });

  it('should apply CREATE_SUCCESSOR intent for FTP Deal natively', async () => {
    const adapter = new HubspotAdapter('fake-token');
    
    const createDealMock = vi.fn().mockResolvedValue({ id: 'deal_2002', properties: { coa_opportunity_key: 'rel_acme::FTP::1' } });
    const searchDealMock = vi.fn().mockResolvedValue({ results: [] });
    const getDealMock = vi.fn().mockResolvedValue({ id: 'deal_2002', properties: { coa_opportunity_key: 'rel_acme::FTP::1' } });

    const rawClient = adapter.getRawClient();
    rawClient.crm.deals.searchApi.doSearch = searchDealMock;
    rawClient.crm.deals.basicApi.create = createDealMock;
    rawClient.crm.deals.basicApi.getById = getDealMock;

    const intents: TransitionIntent[] = [{
      kind: 'CREATE_SUCCESSOR',
      predecessorKey: 'rel_acme::SQL::1',
      successorKey: 'rel_acme::FTP::1',
      successorType: 'FTP',
      cycleIndex: 1
    }];

    const result = await adapter.applyTransitionIntents(intents, 'trans_ftp_1');

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
