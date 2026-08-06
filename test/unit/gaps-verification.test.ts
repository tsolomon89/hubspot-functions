import { describe, it, expect, vi } from 'vitest';
import { HubspotAdapter, HubSpotSnapshotLoader } from '../../packages/hubspot-adapter';
import { OrganizationConfigResolver } from '../../packages/domain/config-resolver';
import { TransitionIntent, OpportunitySnapshot, evaluateOpportunity, planTransition } from '../../packages/commercial-kernel';
import { deriveRelationshipKey } from '../../packages/domain/identity';

describe('Comprehensive Gap Closure & Invariant Verification Suite', () => {
  it('1. Should resolve Product and create two replay-safe Deal-parented Line Items with readback verification', async () => {
    const adapter = new HubspotAdapter('fake-token');
    const rawClient = adapter.getRawClient();

    vi.spyOn(adapter, 'resolveProductForOfferingKey').mockImplementation((key) => {
      if (key === 'prod_sw_base') return Promise.resolve({ id: 'prod_101', price: 1000 });
      if (key === 'prod_sw_addon') return Promise.resolve({ id: 'prod_102', price: 250 });
      return Promise.resolve({ id: 'prod_unknown', price: 0 });
    });

    const createLineItemMock = vi.fn()
      .mockResolvedValueOnce({ id: 'li_201' })
      .mockResolvedValueOnce({ id: 'li_202' });

    const getLineItemMock = vi.fn().mockImplementation((id: string) => {
      if (id === 'li_201') {
        return Promise.resolve({
          id: 'li_201',
          properties: {
            name: 'prod_sw_base',
            hs_product_id: 'prod_101',
            hs_sku: 'prod_sw_base',
            quantity: '1',
            price: '1000',
            coa_line_item_key: 'rel_acme::FTP::1::prod_sw_base'
          }
        });
      }
      if (id === 'li_202') {
        return Promise.resolve({
          id: 'li_202',
          properties: {
            name: 'prod_sw_addon',
            hs_product_id: 'prod_102',
            hs_sku: 'prod_sw_addon',
            quantity: '1',
            price: '250',
            coa_line_item_key: 'rel_acme::FTP::1::prod_sw_addon'
          }
        });
      }
      return Promise.reject(new Error('Line item not found'));
    });

    const getDealMock = vi.fn().mockResolvedValue({
      id: 'deal_ftp_1',
      properties: {
        dealname: 'Transaction Deal - rel_acme::FTP::1',
        pipeline: 'b2b_transaction_deal_pipeline',
        dealstage: 'open',
        coa_opportunity_key: 'rel_acme::FTP::1',
        coa_relationship_key: 'rel_acme',
        coa_relationship_type: 'b2b',
        coa_opportunity_type: 'FTP',
        coa_cycle_index: '1',
        coa_predecessor_opportunity_key: 'rel_acme::LEAD::1',
        coa_predecessor_completed_at: '2026-08-05T12:00:00.000Z',
        coa_managed: 'true',
        coa_config_version: '1.0.0',
        coa_qualification_state: 'PENDING'
      }
    });

    Object.defineProperty(rawClient.crm, 'lineItems', {
      value: { basicApi: { create: createLineItemMock, getById: getLineItemMock }, searchApi: { doSearch: vi.fn() } },
      configurable: true
    });

    rawClient.crm.deals.searchApi.doSearch = vi.fn().mockResolvedValue({ results: [] });
    rawClient.crm.deals.basicApi.create = vi.fn().mockResolvedValue({ id: 'deal_ftp_1' });
    rawClient.crm.deals.basicApi.getById = getDealMock;
    rawClient.crm.associations.v4.basicApi.getPage = vi.fn().mockImplementation((fromType, fromId, toType) => {
      if (toType === 'line_item') return Promise.resolve({ results: [] });
      if (fromType === 'line_item' && toType === 'deal') return Promise.resolve({ results: [{ toObjectId: 'deal_ftp_1' }] });
      return Promise.resolve({ results: [{ toObjectId: 'comp_10' }] });
    });

    const intents: TransitionIntent[] = [{
      kind: 'CREATE_SUCCESSOR',
      predecessorKey: 'rel_acme::LEAD::1',
      successorKey: 'rel_acme::FTP::1',
      successorType: 'FTP',
      cycleIndex: 1,
      subject: { kind: 'COMPANY', key: 'comp_10' },
      offerings: [
        { offeringKey: 'prod_sw_base', quantity: 1, unitPrice: 1000 },
        { offeringKey: 'prod_sw_addon', quantity: 1, unitPrice: 250 }
      ],
      predecessorCompletedAt: '2026-08-05T12:00:00.000Z'
    }];

    const config = OrganizationConfigResolver.resolveConfigByPortalId('149041124', { organizationKey: 'org_global_corp', bypassAccountRoleGuard: true, relationshipType: 'b2b' });
    const result = await adapter.applyTransitionIntents(intents, 'trans_line_items', config);

    expect(result.success).toBe(true);
    expect(createLineItemMock).toHaveBeenCalledTimes(2);

    const lineItemReceipts = result.receipts.filter(r => r.intentKind === 'CREATE_LINE_ITEM');
    expect(lineItemReceipts).toHaveLength(2);
    expect(lineItemReceipts.every(r => r.verified)).toBe(true);
  });

  it('2. Should prevent duplicate Task creation under replay (Task idempotency)', async () => {
    const adapter = new HubspotAdapter('fake-token');
    const rawClient = adapter.getRawClient();

    const taskMarker = '[COA_OPPORTUNITY_KEY:rel_acme::LEAD::1]';
    const assocMock = vi.fn().mockResolvedValue({ results: [{ toObjectId: 'task_existing_1' }] });
    const getTaskMock = vi.fn().mockResolvedValue({
      id: 'task_existing_1',
      properties: {
        hs_task_subject: 'Manual Review Required: Needs review',
        hs_task_body: `Opportunity key rel_acme::LEAD::1 requires manual review. ${taskMarker}`,
        hs_task_status: 'NOT_STARTED',
        hs_timestamp: new Date().toISOString()
      }
    });

    const createTaskMock = vi.fn();

    Object.defineProperty(rawClient.crm.objects, 'tasks', {
      value: {
        searchApi: { doSearch: vi.fn().mockResolvedValue({ results: [{ id: 'task_existing_1' }] }) },
        basicApi: { create: createTaskMock, getById: getTaskMock }
      },
      configurable: true
    });
    rawClient.crm.associations.v4.basicApi.getPage = assocMock;

    const intents: TransitionIntent[] = [{
      kind: 'CREATE_MANUAL_REVIEW',
      opportunityKey: 'rel_acme::LEAD::1',
      reason: 'Needs review',
      subject: { kind: 'CONTACT', key: 'cnt_100' }
    }];

    const result = await adapter.applyTransitionIntents(intents, 'trans_task_replay');

    expect(result.success).toBe(true);
    expect(createTaskMock).not.toHaveBeenCalled();
    expect(result.receipts[0].operation).toBe('NOOP');
    expect(result.receipts[0].verified).toBe(true);
  });

  it('3. Should isolate parallel B2B and B2C relationships on the same Contact via deriveRelationshipKey', () => {
    const contactKey = 'cnt_user_parallel';
    const companyKey = 'comp_user_b2b';

    const b2bRelKey = deriveRelationshipKey('org_global_corp', 'b2b', companyKey);
    const b2cRelKey = deriveRelationshipKey('org_global_corp', 'b2c', contactKey);

    expect(b2bRelKey).toBe('rel_org_global_corp_b2b_comp_user_b2b');
    expect(b2cRelKey).toBe('rel_org_global_corp_b2c_cnt_user_parallel');
    expect(b2bRelKey).not.toBe(b2cRelKey);
  });

  it('4. Should detect ambiguous primary contacts when >1 contacts exist without a primary label and return MANUAL_REVIEW', async () => {
    const loader = new HubSpotSnapshotLoader('fake-token');

    const multiAssocs = [
      { toObjectId: 'cnt_10', associationTypes: [{ label: null }] },
      { toObjectId: 'cnt_20', associationTypes: [{ label: null }] }
    ];

    const resolution = await loader.resolvePrimaryContactId('company', 'comp_multi', multiAssocs);
    expect(resolution.isAmbiguous).toBe(true);
    expect(resolution.primaryContactId).toBeNull();
  });

  it('5. Should load phone and evaluate phone-only MQL successfully', () => {
    const config = OrganizationConfigResolver.resolveConfigByPortalId('149041124', { organizationKey: 'org_global_corp', bypassAccountRoleGuard: true, relationshipType: 'b2b' });

    const snapshot: OpportunitySnapshot = {
      organizationKey: 'org_global_corp',
      relationshipKey: 'rel_org_global_corp_b2b_comp_phone_only',
      relationshipType: 'b2b',
      opportunityKey: 'rel_org_global_corp_b2b_comp_phone_only::LEAD::1',
      opportunityType: 'MQL',
      opportunityState: 'OPEN',
      cycleIndex: 1,
      openedAt: '2026-08-05T00:00:00Z',
      subject: { kind: 'CONTACT', key: 'cnt_phone_only', phone: '+15550199' },
      facts: { phone: '+15550199', marketingConsent: true },
      evidence: []
    };

    const evalRes = evaluateOpportunity(snapshot, config);
    expect(evalRes.qualificationState).toBe('SATISFIED');
  });

  it('6. Should pass authoritative predecessor completion timestamp from planner onto successor Deal intent', () => {
    const config = OrganizationConfigResolver.resolveConfigByPortalId('149041124', { organizationKey: 'org_global_corp', bypassAccountRoleGuard: true, relationshipType: 'b2b' });

    const snapshot: OpportunitySnapshot = {
      organizationKey: 'org_global_corp',
      relationshipKey: 'rel_test',
      relationshipType: 'b2b',
      opportunityKey: 'rel_test::LEAD::1',
      opportunityType: 'SQL',
      opportunityState: 'OPEN',
      cycleIndex: 1,
      openedAt: '2026-08-01T00:00:00Z',
      mqlCompletedAt: '2026-08-03T10:00:00.000Z',
      subject: { kind: 'COMPANY', key: 'comp_test' },
      facts: { offeringKeys: ['prod_sw'] },
      evidence: [
        { id: 'ev_mtg', predicate: 'activityExists', scope: 'opportunity', occurredAt: '2026-08-02T00:00:00Z', data: { activityType: 'MEETING', outcome: 'COMPLETED' } }
      ]
    };

    const evalRes = evaluateOpportunity(snapshot, config);
    expect(evalRes.qualificationState).toBe('SATISFIED');

    const intents = planTransition(snapshot, evalRes, config, '2026-08-05T12:00:00.000Z');

    const successorIntent = intents.find(i => i.kind === 'CREATE_SUCCESSOR');
    expect(successorIntent).toBeDefined();
    if (successorIntent && successorIntent.kind === 'CREATE_SUCCESSOR') {
      expect(successorIntent.predecessorCompletedAt).toBe('2026-08-05T12:00:00.000Z');
    }
  });

  it('7. Should verify initial Lead creation and writeback of evaluation metadata', async () => {
    const adapter = new HubspotAdapter('fake-token');
    const rawClient = adapter.getRawClient();

    const createLeadMock = vi.fn().mockResolvedValue({ id: 'lead_initial_1' });
    const getLeadMock = vi.fn().mockResolvedValue({
      id: 'lead_initial_1',
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

    Object.defineProperty(rawClient.crm.objects, 'leads', {
      value: { searchApi: { doSearch: vi.fn().mockResolvedValue({ results: [] }) }, basicApi: { create: createLeadMock, getById: getLeadMock } },
      configurable: true
    });

    const lead = await adapter.findOrCreateLeadForSubject({ kind: 'CONTACT', key: 'cnt_init_1' }, 'rel_acme', 'b2b');

    expect(lead?.id).toBe('lead_initial_1');
    expect(getLeadMock).toHaveBeenCalledWith('lead_initial_1', expect.anything());
  });

  it('8. Should execute B2C transaction creation when dryRunTransactions is false', () => {
    const config = OrganizationConfigResolver.resolveConfigByPortalId('149041124', { organizationKey: 'org_global_corp', bypassAccountRoleGuard: true, relationshipType: 'b2c' });
    expect(config.featureFlags?.dryRunTransactions).toBe(false);

    const snapshot: OpportunitySnapshot = {
      organizationKey: 'org_global_corp',
      relationshipKey: 'rel_b2c_user',
      relationshipType: 'b2c',
      opportunityKey: 'rel_b2c_user::LEAD::1',
      opportunityType: 'SQL',
      opportunityState: 'OPEN',
      cycleIndex: 1,
      openedAt: '2026-08-05T00:00:00Z',
      mqlCompletedAt: '2026-08-05T00:00:00Z',
      subject: { kind: 'CONTACT', key: 'cnt_b2c_user' },
      facts: { email: 'b2c@example.com', offeringKeys: ['prod_b2c_sw'] },
      evidence: []
    };

    const evalRes = evaluateOpportunity(snapshot, config);
    expect(evalRes.qualificationState).toBe('SATISFIED');

    const intents = planTransition(snapshot, evalRes, config);
    const successorIntent = intents.find(i => i.kind === 'CREATE_SUCCESSOR');
    expect(successorIntent).toBeDefined();
    if (successorIntent && successorIntent.kind === 'CREATE_SUCCESSOR') {
      expect(successorIntent.successorType).toBe('FTP');
    }
  });

  it('9. Should return MANUAL_REVIEW and review relationship key when B2B Contact has missing Company', () => {
    const config = OrganizationConfigResolver.resolveConfigByPortalId('149041124', { organizationKey: 'org_global_corp', bypassAccountRoleGuard: true, relationshipType: 'b2b' });

    const snapshot: OpportunitySnapshot = {
      organizationKey: 'org_global_corp',
      relationshipKey: 'rel_org_global_corp_review_cnt_missing',
      relationshipType: 'b2b',
      opportunityKey: 'rel_org_global_corp_review_cnt_missing::LEAD::1',
      opportunityType: 'MQL',
      opportunityState: 'OPEN',
      cycleIndex: 1,
      openedAt: '2026-08-05T00:00:00Z',
      subject: { kind: 'CONTACT', key: 'cnt_missing' },
      facts: { email: 'missing@domain.com', missingCompany: true, manualReviewRequired: true },
      evidence: []
    };

    const evalRes = evaluateOpportunity(snapshot, config);
    expect(evalRes.qualificationState).toBe('MANUAL_REVIEW');

    const intents = planTransition(snapshot, evalRes, config);
    expect(intents[0].kind).toBe('CREATE_MANUAL_REVIEW');
    if (intents[0].kind === 'CREATE_MANUAL_REVIEW') {
      expect(intents[0].opportunityKey).toBe('rel_org_global_corp_review_cnt_missing::LEAD::1');
    }
  });

  it('10. Should mark Line Item receipt as unverified when association read fails', async () => {
    const adapter = new HubspotAdapter('fake-token');
    const rawClient = adapter.getRawClient();

    vi.spyOn(adapter, 'resolveProductForOfferingKey').mockResolvedValue({ id: 'prod_999', price: 500 });

    const getDealMock = vi.fn().mockResolvedValue({
      id: 'deal_assoc_fail',
      properties: {
        dealname: 'Transaction Deal - rel_assoc_fail::FTP::1',
        pipeline: 'b2b_transaction_deal_pipeline',
        dealstage: 'open',
        coa_opportunity_key: 'rel_assoc_fail::FTP::1',
        coa_relationship_key: 'rel_assoc_fail',
        coa_relationship_type: 'b2b',
        coa_opportunity_type: 'FTP',
        coa_cycle_index: '1',
        coa_predecessor_opportunity_key: 'rel_assoc_fail::LEAD::1',
        coa_predecessor_completed_at: '2026-08-05T12:00:00.000Z',
        coa_managed: 'true',
        coa_config_version: '1.0.0',
        coa_qualification_state: 'PENDING'
      }
    });

    const getLineItemMock = vi.fn().mockResolvedValue({
      id: 'li_assoc_fail',
      properties: {
        name: 'prod_sw_assoc_fail',
        hs_product_id: 'prod_999',
        hs_sku: 'prod_sw_assoc_fail',
        quantity: '1',
        price: '500',
        coa_line_item_key: 'rel_assoc_fail::FTP::1::prod_sw_assoc_fail'
      }
    });

    const createLineItemMock = vi.fn().mockResolvedValue({ id: 'li_assoc_fail' });

    Object.defineProperty(rawClient.crm, 'lineItems', {
      value: { basicApi: { create: createLineItemMock, getById: getLineItemMock }, searchApi: { doSearch: vi.fn() } },
      configurable: true
    });

    rawClient.crm.deals.searchApi.doSearch = vi.fn().mockResolvedValue({ results: [{ id: 'deal_assoc_fail', properties: {
      dealname: 'Transaction Deal - rel_assoc_fail::FTP::1',
      pipeline: 'b2b_transaction_deal_pipeline',
      dealstage: 'open',
      coa_opportunity_key: 'rel_assoc_fail::FTP::1',
      coa_relationship_key: 'rel_assoc_fail',
      coa_relationship_type: 'b2b',
      coa_opportunity_type: 'FTP',
      coa_cycle_index: '1',
      coa_predecessor_opportunity_key: 'rel_assoc_fail::LEAD::1',
      coa_predecessor_completed_at: '2026-08-05T12:00:00.000Z',
      coa_managed: 'true',
      coa_config_version: '1.0.0',
      coa_qualification_state: 'PENDING'
    } }] });

    rawClient.crm.deals.basicApi.getById = getDealMock;

    // Simulate association read failure for line_item -> deal
    rawClient.crm.associations.v4.basicApi.getPage = vi.fn().mockImplementation((fromType, fromId, toType) => {
      if (toType === 'line_item') {
        return Promise.resolve({ results: [] });
      }
      if (fromType === 'line_item' && toType === 'deal') {
        return Promise.reject(new Error('CRM_ASSOCIATION_READ_ERROR'));
      }
      return Promise.resolve({ results: [{ toObjectId: 'comp_10' }] });
    });

    const intents: TransitionIntent[] = [{
      kind: 'CREATE_SUCCESSOR',
      predecessorKey: 'rel_assoc_fail::LEAD::1',
      successorKey: 'rel_assoc_fail::FTP::1',
      successorType: 'FTP',
      cycleIndex: 1,
      subject: { kind: 'COMPANY', key: 'comp_10' },
      offerings: [{ offeringKey: 'prod_sw_assoc_fail', quantity: 1, unitPrice: 500 }],
      predecessorCompletedAt: '2026-08-05T12:00:00.000Z'
    }];

    const config = OrganizationConfigResolver.resolveConfigByPortalId('149041124', { organizationKey: 'org_global_corp', bypassAccountRoleGuard: true, relationshipType: 'b2b' });
    const result = await adapter.applyTransitionIntents(intents, 'trans_assoc_fail', config);

    const liReceipt = result.receipts.find(r => r.intentKind === 'CREATE_LINE_ITEM');
    expect(liReceipt).toBeDefined();
    expect(liReceipt?.verified).toBe(false);
  });
});
