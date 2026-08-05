import { describe, it, expect, vi } from 'vitest';
import { HubspotAdapter } from '../../packages/hubspot-adapter/adapter';
import { TransitionIntent } from '../../packages/commercial-kernel';

describe('HubSpot Adapter Contract Tests with Strict Fake', () => {
  it('should apply CREATE_SUCCESSOR intent for SQL Lead natively', async () => {
    const adapter = new HubspotAdapter('fake-token');
    const rawClient = adapter.getRawClient();

    const searchMock = vi.fn().mockResolvedValue({ results: [] });
    const createLeadMock = vi.fn().mockResolvedValue({ id: 'lead_123' });
    const getByIdMock = vi.fn().mockResolvedValue({
      id: 'lead_123',
      properties: {
        coa_opportunity_key: 'rel_acme::SQL::1',
        coa_opportunity_type: 'SQL',
        coa_cycle_index: '1'
      }
    });

    rawClient.crm.objects.leads.searchApi.doSearch = searchMock;
    rawClient.crm.objects.leads.basicApi.create = createLeadMock;
    rawClient.crm.objects.leads.basicApi.getById = getByIdMock;

    const intents: TransitionIntent[] = [{
      kind: 'CREATE_SUCCESSOR',
      predecessorKey: 'rel_acme::MQL::1',
      successorKey: 'rel_acme::SQL::1',
      successorType: 'SQL',
      cycleIndex: 1
    }];

    const result = await adapter.applyTransitionIntents(intents, 'trans_123');

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
    const rawClient = adapter.getRawClient();

    const searchMock = vi.fn().mockResolvedValue({ results: [] });
    const createDealMock = vi.fn().mockResolvedValue({ id: 'deal_456' });
    const getByIdMock = vi.fn().mockResolvedValue({
      id: 'deal_456',
      properties: {
        coa_opportunity_key: 'rel_acme::FTP::1',
        coa_opportunity_type: 'FTP',
        coa_cycle_index: '1'
      }
    });

    rawClient.crm.deals.searchApi.doSearch = searchMock;
    rawClient.crm.deals.basicApi.create = createDealMock;
    rawClient.crm.deals.basicApi.getById = getByIdMock;

    const intents: TransitionIntent[] = [{
      kind: 'CREATE_SUCCESSOR',
      predecessorKey: 'rel_acme::SQL::1',
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
