import { describe, it, expect, vi } from 'vitest';
import { processHubSpotCustomCodeAction } from '../../src/custom-code-actions/reconcile-record';
import { HubspotAdapter } from '../../packages/hubspot-adapter/adapter';

describe('True Stateful End-to-End Custom Code Action Lifecycle Contract Test', () => {
  it('Should execute processHubSpotCustomCodeAction through Contact -> Lead -> FTP Deal -> Closed Won -> RTP1 Deal -> Closed Won -> RTP2 Deal with exact Contact and Company associations and Replay Safety', async () => {
    const meetingTime = String(Date.now() + 600000);

    // Stateful fake CRM store
    const crmStore = {
      contacts: {
        'cnt_1001': {
          id: 'cnt_1001',
          properties: {
            email: 'alice@acme.com',
            coa_relationship_key: 'rel_org_global_corp_b2b_comp_5001',
            coa_relationship_type: 'b2b',
            coa_marketing_consent: 'true',
            lifecyclestage: 'lead'
          }
        }
      },
      companies: {
        'comp_5001': {
          id: 'comp_5001',
          properties: {
            name: 'Acme Inc',
            domain: 'acme.com',
            coa_relationship_key: 'rel_org_global_corp_b2b_comp_5001',
            coa_relationship_type: 'b2b',
            coa_marketing_consent: 'true',
            lifecyclestage: 'lead'
          }
        }
      },
      leads: {} as Record<string, any>,
      deals: {} as Record<string, any>,
      meetings: {
        'mtg_9001': {
          id: 'mtg_9001',
          properties: {
            hs_activity_type: 'MEETING',
            hs_meeting_outcome: 'COMPLETED',
            hs_timestamp: meetingTime
          }
        }
      } as Record<string, any>,
      associations: {
        'contact->company': [{ from: 'cnt_1001', to: 'comp_5001' }],
        'company->contact': [{ from: 'comp_5001', to: 'cnt_1001' }],
        'company->meeting': [],
        'contact->meeting': [{ from: 'cnt_1001', to: 'mtg_9001' }],
        'lead->contact': [],
        'lead->company': [],
        'deal->contact': [],
        'deal->company': [],
        'deal->line_item': [],
        'line_item->deal': []
      } as Record<string, Array<{ from: string; to: string }>>
    };

    const normalizeType = (t?: string) => {
      if (!t) return '';
      const u = String(t).toLowerCase();
      if (u === '0-1' || u === 'contacts') return 'contact';
      if (u === '0-2' || u === 'companies') return 'company';
      if (u === '0-3' || u === 'deals') return 'deal';
      if (u === '0-136' || u === 'leads') return 'lead';
      if (u === '0-47' || u === 'meetings') return 'meeting';
      if (u === '0-14' || u === 'line_item' || u === 'line_items') return 'line_item';
      return u;
    };

    const fakeAdapter = new HubspotAdapter('fake-token');
    const rawClient = fakeAdapter.getRawClient();

    // Mock Contacts API
    rawClient.crm.contacts.basicApi.getById = vi.fn().mockImplementation(async (id: string) => {
      const cnt = crmStore.contacts[id as keyof typeof crmStore.contacts];
      if (cnt) return cnt as any;
      throw { statusCode: 404 };
    });
    rawClient.crm.contacts.basicApi.update = vi.fn().mockImplementation(async (id: string, body: any) => {
      const cnt = crmStore.contacts[id as keyof typeof crmStore.contacts];
      if (cnt) {
        Object.assign(cnt.properties, body.properties);
        return cnt as any;
      }
      throw { statusCode: 404 };
    });

    // Mock Companies API
    rawClient.crm.companies.basicApi.getById = vi.fn().mockImplementation(async (id: string) => {
      const comp = crmStore.companies[id as keyof typeof crmStore.companies];
      if (comp) return comp as any;
      throw { statusCode: 404 };
    });
    rawClient.crm.companies.basicApi.update = vi.fn().mockImplementation(async (id: string, body: any) => {
      const comp = crmStore.companies[id as keyof typeof crmStore.companies];
      if (comp) {
        Object.assign(comp.properties, body.properties);
        return comp as any;
      }
      throw { statusCode: 404 };
    });

    // Mock Leads API
    (rawClient.crm.objects as any).leads = {
      basicApi: {
        getById: vi.fn().mockImplementation(async (id: string) => {
          if (crmStore.leads[id]) return crmStore.leads[id];
          throw { statusCode: 404 };
        }),
        create: vi.fn().mockImplementation(async (body: any) => {
          const newId = `lead_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          const newLead = { id: newId, properties: { ...body.properties } };
          crmStore.leads[newId] = newLead;
          if (body.associations) {
            for (const assoc of body.associations) {
              const targetId = assoc.to?.id;
              if (targetId === 'cnt_1001') crmStore.associations['lead->contact'].push({ from: newId, to: 'cnt_1001' });
              if (targetId === 'comp_5001') crmStore.associations['lead->company'].push({ from: newId, to: 'comp_5001' });
            }
          }
          return newLead;
        }),
        update: vi.fn().mockImplementation(async (id: string, body: any) => {
          if (crmStore.leads[id]) {
            Object.assign(crmStore.leads[id].properties, body.properties);
            return crmStore.leads[id];
          }
          throw { statusCode: 404 };
        })
      },
      searchApi: {
        doSearch: vi.fn().mockImplementation(async (body: any) => {
          const leadList = Object.values(crmStore.leads);
          const filter = body.filterGroups?.[0]?.filters?.[0];
          if (filter && filter.propertyName === 'coa_opportunity_key') {
            const matched = leadList.filter(l => l.properties?.coa_opportunity_key === filter.value);
            return { results: matched, total: matched.length };
          }
          return { results: leadList, total: leadList.length };
        })
      }
    };

    // Mock Deals API
    rawClient.crm.deals.basicApi.getById = vi.fn().mockImplementation(async (id: string) => {
      if (crmStore.deals[id]) return crmStore.deals[id];
      throw { statusCode: 404 };
    });
    rawClient.crm.deals.basicApi.create = vi.fn().mockImplementation(async (body: any) => {
      const newId = `deal_${Date.now()}_${Object.keys(crmStore.deals).length + 1}`;
      const newDeal = { id: newId, properties: { ...body.properties } };
      crmStore.deals[newId] = newDeal;
      if (body.associations) {
        for (const assoc of body.associations) {
          const targetId = assoc.to?.id;
          if (targetId === 'cnt_1001') crmStore.associations['deal->contact'].push({ from: newId, to: 'cnt_1001' });
          if (targetId === 'comp_5001') crmStore.associations['deal->company'].push({ from: newId, to: 'comp_5001' });
        }
      }
      return newDeal;
    });
    rawClient.crm.deals.basicApi.update = vi.fn().mockImplementation(async (id: string, body: any) => {
      if (crmStore.deals[id]) {
        Object.assign(crmStore.deals[id].properties, body.properties);
        return crmStore.deals[id];
      }
      throw { statusCode: 404 };
    });
    rawClient.crm.deals.searchApi.doSearch = vi.fn().mockImplementation(async (body: any) => {
      const dealList = Object.values(crmStore.deals);
      const filter = body.filterGroups?.[0]?.filters?.[0];
      if (filter && filter.propertyName === 'coa_opportunity_key') {
        const matched = dealList.filter(d => d.properties?.coa_opportunity_key === filter.value);
        return { results: matched, total: matched.length };
      }
      return { results: dealList, total: dealList.length };
    });

    // Mock Products API
    rawClient.crm.products.searchApi.doSearch = vi.fn().mockImplementation(async () => ({
      results: [{ id: 'prod_100', properties: { name: 'prod_software', price: '100' } }]
    }));

    // Mock Line Items API with dynamic store for exact coa_line_item_key readback
    const lineItemStore: Record<string, any> = {};
    Object.defineProperty(rawClient.crm, 'lineItems', {
      value: {
        basicApi: {
          create: vi.fn().mockImplementation(async (b) => {
            const newId = `li_${Date.now()}`;
            const record = {
              id: newId,
              properties: {
                hs_product_id: 'prod_100',
                hs_sku: 'prod_software',
                name: 'prod_software',
                quantity: '1',
                price: '100',
                ...b.properties
              }
            };
            lineItemStore[newId] = record;
            if (b.associations) {
              for (const assoc of b.associations) {
                const targetId = assoc.to?.id;
                if (targetId) crmStore.associations['line_item->deal'].push({ from: newId, to: targetId });
              }
            }
            return record;
          }),
          getById: vi.fn().mockImplementation(async (id) => {
            if (lineItemStore[id]) return lineItemStore[id];
            return {
              id,
              properties: {
                hs_product_id: 'prod_100',
                hs_sku: 'prod_software',
                name: 'prod_software',
                quantity: '1',
                price: '100'
              }
            };
          })
        }
      },
      configurable: true
    });

    // Mock Meetings API safely on rawClient.crm
    Object.defineProperty(rawClient.crm.objects, 'meetings', {
      value: {
        basicApi: {
          getById: vi.fn().mockImplementation(async (id: string) => {
            if (crmStore.meetings[id]) return crmStore.meetings[id];
            throw { statusCode: 404 };
          })
        }
      },
      configurable: true
    });

    // Mock Associations V4 API
    rawClient.crm.associations.v4.basicApi.getPage = vi.fn().mockImplementation(async (fromType: string, fromId: number | string, toType: string) => {
      const nFrom = normalizeType(fromType);
      const nTo = normalizeType(toType);
      const key = `${nFrom}->${nTo}`;

      const matches = (crmStore.associations[key] || []).filter(a => String(a.from) === String(fromId));
      return {
        results: matches.map(m => ({
          toObjectId: m.to,
          associationTypes: [{ category: 'HUBSPOT_DEFINED', typeId: 1 }]
        }))
      } as any;
    });

    // STEP 1: Process initial Contact enrollment -> Managed Lead created & progressed to SQL
    const step1Result = await processHubSpotCustomCodeAction({
      origin: { portalId: 149041124 },
      object: { objectId: 'cnt_1001', objectType: 'CONTACT' },
      inputFields: { offeringKeys: 'prod_software' }
    }, 'fake-token', fakeAdapter);

    expect(step1Result.outputFields.objectType).toBe('lead');
    expect(step1Result.outputFields.qualificationState).toBe('SATISFIED');
    expect(step1Result.outputFields.status).toBe('UPDATED_EXISTING');

    const createdLeadId = step1Result.outputFields.objectId;
    expect(createdLeadId).toBeDefined();
    expect(crmStore.leads[createdLeadId]).toBeDefined();

    // Assert exact Contact AND Company associations on created Lead
    const leadContactAssocs = crmStore.associations['lead->contact'].filter(a => a.from === createdLeadId);
    const leadCompanyAssocs = crmStore.associations['lead->company'].filter(a => a.from === createdLeadId);
    expect(leadContactAssocs.length).toBe(1);
    expect(leadContactAssocs[0].to).toBe('cnt_1001');
    expect(leadCompanyAssocs.length).toBe(1);
    expect(leadCompanyAssocs[0].to).toBe('comp_5001');

    // STEP 2: Process created Lead enrollment -> Moves to Qualified & Creates FTP Deal
    const step2Result = await processHubSpotCustomCodeAction({
      origin: { portalId: 149041124 },
      object: { objectId: createdLeadId, objectType: 'LEAD' }
    }, 'fake-token', fakeAdapter);

    expect(step2Result.outputFields.objectId).toBe(createdLeadId);
    expect(step2Result.outputFields.status).toBe('CREATED_SUCCESSOR');

    const createdDeals = Object.values(crmStore.deals);
    expect(createdDeals.length).toBe(1);
    const ftpDeal = createdDeals[0];
    expect(ftpDeal.properties.coa_opportunity_type).toBe('FTP');
    expect(ftpDeal.properties.dealstage).toBe('open');

    // Assert exact Contact AND Company associations on created FTP Deal
    const ftpContactAssocs = crmStore.associations['deal->contact'].filter(a => a.from === ftpDeal.id);
    const ftpCompanyAssocs = crmStore.associations['deal->company'].filter(a => a.from === ftpDeal.id);
    expect(ftpContactAssocs.length).toBe(1);
    expect(ftpContactAssocs[0].to).toBe('cnt_1001');
    expect(ftpCompanyAssocs.length).toBe(1);
    expect(ftpCompanyAssocs[0].to).toBe('comp_5001');

    // STEP 3: Replay Lead enrollment -> Idempotent NO_CHANGE
    const step3Result = await processHubSpotCustomCodeAction({
      origin: { portalId: 149041124 },
      object: { objectId: createdLeadId, objectType: 'LEAD' }
    }, 'fake-token', fakeAdapter);
    expect(step3Result.outputFields.status).toBe('NO_CHANGE');
    expect(Object.keys(crmStore.deals).length).toBe(1);

    // STEP 4: Close FTP Deal (Closed Won) & Enroll FTP Deal -> Creates RTP1 Deal
    crmStore.deals[ftpDeal.id].properties.dealstage = 'closedwon';
    crmStore.deals[ftpDeal.id].properties.closedAt = '2026-08-05T12:00:00.000Z';
    crmStore.deals[ftpDeal.id].properties.coa_predecessor_completed_at = '2026-08-05T12:00:00.000Z';

    const step4Result = await processHubSpotCustomCodeAction({
      origin: { portalId: 149041124 },
      object: { objectId: ftpDeal.id, objectType: 'DEAL' }
    }, 'fake-token', fakeAdapter);

    expect(step4Result.outputFields.status).toBe('CREATED_SUCCESSOR');
    expect(Object.keys(crmStore.deals).length).toBe(2);

    const rtp1Deal = Object.values(crmStore.deals).find(d => d.properties.coa_opportunity_type === 'RTP' && d.properties.coa_cycle_index === '1');
    expect(rtp1Deal).toBeDefined();

    if (rtp1Deal) {
      // Assert exact Contact AND Company associations on created RTP1 Deal
      const rtp1ContactAssocs = crmStore.associations['deal->contact'].filter(a => a.from === rtp1Deal.id);
      const rtp1CompanyAssocs = crmStore.associations['deal->company'].filter(a => a.from === rtp1Deal.id);
      expect(rtp1ContactAssocs.length).toBe(1);
      expect(rtp1ContactAssocs[0].to).toBe('cnt_1001');
      expect(rtp1CompanyAssocs.length).toBe(1);
      expect(rtp1CompanyAssocs[0].to).toBe('comp_5001');
    }

    // STEP 5: Replay FTP Deal enrollment -> Idempotent NO_CHANGE
    const step5Result = await processHubSpotCustomCodeAction({
      origin: { portalId: 149041124 },
      object: { objectId: ftpDeal.id, objectType: 'DEAL' }
    }, 'fake-token', fakeAdapter);
    expect(step5Result.outputFields.status).toBe('NO_CHANGE');
    expect(Object.keys(crmStore.deals).length).toBe(2);

    // STEP 6: Close RTP1 Deal (Closed Won) & Enroll RTP1 Deal -> Creates RTP2 Deal
    if (rtp1Deal) {
      crmStore.deals[rtp1Deal.id].properties.dealstage = 'closedwon';
      crmStore.deals[rtp1Deal.id].properties.closedAt = '2026-08-05T13:00:00.000Z';
      crmStore.deals[rtp1Deal.id].properties.coa_predecessor_completed_at = '2026-08-05T13:00:00.000Z';

      const step6Result = await processHubSpotCustomCodeAction({
        origin: { portalId: 149041124 },
        object: { objectId: rtp1Deal.id, objectType: 'DEAL' }
      }, 'fake-token', fakeAdapter);

      expect(step6Result.outputFields.status).toBe('CREATED_SUCCESSOR');
      expect(Object.keys(crmStore.deals).length).toBe(3);

      const rtp2Deal = Object.values(crmStore.deals).find(d => d.properties.coa_opportunity_type === 'RTP' && d.properties.coa_cycle_index === '2');
      expect(rtp2Deal).toBeDefined();

      if (rtp2Deal) {
        // Assert exact Contact AND Company associations on created RTP2 Deal
        const rtp2ContactAssocs = crmStore.associations['deal->contact'].filter(a => a.from === rtp2Deal.id);
        const rtp2CompanyAssocs = crmStore.associations['deal->company'].filter(a => a.from === rtp2Deal.id);
        expect(rtp2ContactAssocs.length).toBe(1);
        expect(rtp2ContactAssocs[0].to).toBe('cnt_1001');
        expect(rtp2CompanyAssocs.length).toBe(1);
        expect(rtp2CompanyAssocs[0].to).toBe('comp_5001');
      }

      // STEP 7: Replay RTP1 Deal enrollment -> Idempotent NO_CHANGE
      const step7Result = await processHubSpotCustomCodeAction({
        origin: { portalId: 149041124 },
        object: { objectId: rtp1Deal.id, objectType: 'DEAL' }
      }, 'fake-token', fakeAdapter);
      expect(step7Result.outputFields.status).toBe('NO_CHANGE');
      expect(Object.keys(crmStore.deals).length).toBe(3);
    }
  });
});
