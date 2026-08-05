import { describe, it, expect, vi } from 'vitest';
import { HubspotAdapter } from '../../packages/hubspot-adapter/adapter';
import { TransitionIntent } from '../../packages/commercial-kernel';

describe('HubSpot Adapter Contract Tests with Strict Fake', () => {
  it('should find or create initial Lead for subject natively without manufacturing offering data', async () => {
    const adapter = new HubspotAdapter('fake-token');
    const rawClient = adapter.getRawClient();

    const searchMock = vi.fn().mockResolvedValue({ results: [] });
    const createLeadMock = vi.fn().mockResolvedValue({ id: 'lead_bootstrap_1', properties: { coa_opportunity_key: 'rel_acme::LEAD::1' } });
    const getLeadMock = vi.fn().mockResolvedValue({
      id: 'lead_bootstrap_1',
      properties: {
        coa_opportunity_key: 'rel_acme::LEAD::1',
        coa_relationship_key: 'rel_acme',
        coa_relationship_type: 'b2b',
        coa_opportunity_type: 'MQL',
        coa_qualification_state: 'PENDING',
        coa_cycle_index: '1',
        hs_pipeline: 'b2b_qualification_lead_pipeline',
        hs_pipeline_stage: 'mql',
        coa_managed: 'true',
        coa_config_version: '1.0.0',
        coa_last_evaluated_at: new Date().toISOString()
      }
    });
    const assocMock = vi.fn().mockResolvedValue({ results: [{ toObjectId: 'cnt_assoc_1' }] });

    Object.defineProperty(rawClient.crm.objects, 'leads', {
      value: { searchApi: { doSearch: searchMock }, basicApi: { create: createLeadMock, getById: getLeadMock } },
      configurable: true
    });
    rawClient.crm.associations.v4.basicApi.getPage = assocMock;

    const lead = await adapter.findOrCreateLeadForSubject({ kind: 'COMPANY', key: 'comp_123' }, 'rel_acme', 'b2b');

    expect(lead?.id).toBe('lead_bootstrap_1');
    expect(createLeadMock).toHaveBeenCalledWith(expect.objectContaining({
      properties: expect.not.objectContaining({
        coa_offering_keys: 'prod_software'
      })
    }));
  });

  it('should apply CREATE_SUCCESSOR intent for FTP Deal natively with predecessorCompletedAt readback', async () => {
    const adapter = new HubspotAdapter('fake-token');
    const rawClient = adapter.getRawClient();

    const predTime = new Date().toISOString();
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
        coa_relationship_type: 'b2b',
        coa_opportunity_type: 'FTP',
        coa_qualification_state: 'PENDING',
        coa_cycle_index: '1',
        coa_predecessor_opportunity_key: 'rel_acme::LEAD::1',
        coa_predecessor_completed_at: predTime,
        coa_config_version: '1.0.0',
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
      cycleIndex: 1,
      predecessorCompletedAt: predTime
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

  it('should fail verification when existing successor Deal misses predecessor-completion timestamp', async () => {
    const adapter = new HubspotAdapter('fake-token');
    const rawClient = adapter.getRawClient();

    const searchMock = vi.fn().mockResolvedValue({
      results: [{
        id: 'deal_no_pred_time',
        properties: {
          dealname: 'Transaction Deal - rel_acme::FTP::1',
          coa_opportunity_key: 'rel_acme::FTP::1',
          coa_opportunity_type: 'FTP',
          coa_cycle_index: '1',
          pipeline: 'b2b_transaction_deal_pipeline',
          coa_relationship_key: 'rel_acme',
          coa_relationship_type: 'b2b',
          coa_predecessor_opportunity_key: 'rel_acme::LEAD::1',
          coa_predecessor_completed_at: null, // missing timestamp!
          coa_config_version: '1.0.0',
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
      cycleIndex: 1,
      predecessorCompletedAt: '2026-08-05T12:00:00.000Z'
    }];

    const result = await adapter.applyTransitionIntents(intents, 'trans_no_pred_time');

    expect(result.success).toBe(false);
    expect(result.receipts[0].verified).toBe(false);
  });

  it('should execute CREATE_MANUAL_REVIEW intent by creating a real native HubSpot Task record with verified readback', async () => {
    const adapter = new HubspotAdapter('fake-token');
    const rawClient = adapter.getRawClient();

    const createTaskMock = vi.fn().mockResolvedValue({ id: 'task_manual_99' });
    const getTaskMock = vi.fn().mockResolvedValue({
      id: 'task_manual_99',
      properties: {
        hs_task_subject: 'Manual Review Required: MQL qualification blocked by missing information',
        hs_task_status: 'NOT_STARTED',
        hs_task_body: '[COA_OPPORTUNITY_KEY:rel_acme::LEAD::1]',
        hs_timestamp: new Date().toISOString()
      }
    });

    Object.defineProperty(rawClient.crm.objects, 'tasks', {
      value: { basicApi: { create: createTaskMock, getById: getTaskMock } },
      configurable: true
    });
    rawClient.crm.associations.v4.basicApi.getPage = vi.fn().mockResolvedValue({ results: [] });

    const intents: TransitionIntent[] = [{
      kind: 'CREATE_MANUAL_REVIEW',
      opportunityKey: 'rel_acme::LEAD::1',
      reason: 'MQL qualification blocked by missing information',
      subject: { kind: 'CONTACT', key: 'cnt_review_1' }
    }];

    const result = await adapter.applyTransitionIntents(intents, 'trans_manual');

    expect(result.success).toBe(true);
    expect(createTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      properties: expect.objectContaining({
        hs_task_subject: 'Manual Review Required: MQL qualification blocked by missing information'
      })
    }));
    expect(result.receipts[0].objectType).toBe('task');
    expect(result.receipts[0].verified).toBe(true);
  });
});
