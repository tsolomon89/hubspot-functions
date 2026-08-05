import { describe, it, expect, vi } from 'vitest';
import { processHubSpotCustomCodeAction } from '../../src/custom-code-actions/reconcile-record';

describe('True Stateful End-to-End Custom Code Action Lifecycle Contract Test', () => {
  it('Should execute processHubSpotCustomCodeAction through Contact -> Lead -> FTP Deal -> Closed Won -> RTP1 Deal -> Closed Won -> RTP2 Deal with Replay Safety', async () => {
    const meetingTime = String(Date.now() + 600000);

    // Stateful fake CRM store
    const crmStore = {
      contacts: {
        'cnt_1001': {
          id: 'cnt_1001',
          properties: {
            email: 'alice@acme.com',
            coa_relationship_key: 'rel_acme_inc',
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
            coa_relationship_key: 'rel_acme_inc',
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
      },
      associations: {
        'contact->company': [{ from: 'cnt_1001', to: 'comp_5001' }],
        'company->contact': [{ from: 'comp_5001', to: 'cnt_1001' }],
        'company->meeting': [],
        'contact->meeting': [{ from: 'cnt_1001', to: 'mtg_9001' }],
        'lead->contact': [],
        'lead->company': [],
        'deal->contact': [],
        'deal->company': []
      } as Record<string, Array<{ from: string; to: string }>>
    };

    const jsonRes = (data: any, status: number = 200) => new Response(JSON.stringify(data), {
      status,
      headers: { 'content-type': 'application/json' }
    });

    const normalizeType = (t?: string) => {
      if (!t) return '';
      const u = String(t).toLowerCase();
      if (u === '0-1' || u === 'contacts') return 'contact';
      if (u === '0-2' || u === 'companies') return 'company';
      if (u === '0-3' || u === 'deals') return 'deal';
      if (u === '0-136' || u === 'leads') return 'lead';
      if (u === '0-47' || u === 'meetings') return 'meeting';
      return u;
    };

    // Global mock interceptor for HubSpot API client calls
    vi.spyOn(global as any, 'fetch').mockImplementation(async (url: any, init: any) => {
      const urlStr = String(url);
      const method = init?.method || 'GET';
      const body = init?.body ? JSON.parse(init.body) : {};

      // Contacts API
      if (urlStr.includes('/crm/v3/objects/contacts/cnt_1001')) {
        if (method === 'PATCH') {
          Object.assign(crmStore.contacts['cnt_1001'].properties, body.properties);
        }
        return jsonRes(crmStore.contacts['cnt_1001']);
      }

      // Companies API
      if (urlStr.includes('/crm/v3/objects/companies/comp_5001')) {
        if (method === 'PATCH') {
          Object.assign(crmStore.companies['comp_5001'].properties, body.properties);
        }
        return jsonRes(crmStore.companies['comp_5001']);
      }

      // Leads Search API
      if (urlStr.includes('leads/search') || urlStr.includes('0-136/search')) {
        const leadList = Object.values(crmStore.leads);
        const filter = body.filterGroups?.[0]?.filters?.[0];
        if (filter && filter.propertyName === 'coa_opportunity_key') {
          const matched = leadList.filter(l => l.properties?.coa_opportunity_key === filter.value);
          return jsonRes({ results: matched, total: matched.length });
        }
        return jsonRes({ results: leadList, total: leadList.length });
      }

      // Deals Search API
      if (urlStr.includes('deals/search') || urlStr.includes('0-3/search')) {
        const dealList = Object.values(crmStore.deals);
        const filter = body.filterGroups?.[0]?.filters?.[0];
        if (filter && filter.propertyName === 'coa_opportunity_key') {
          const matched = dealList.filter(d => d.properties?.coa_opportunity_key === filter.value);
          return jsonRes({ results: matched, total: matched.length });
        }
        return jsonRes({ results: dealList, total: dealList.length });
      }

      // Leads Create API
      if ((urlStr.endsWith('/leads') || urlStr.endsWith('/0-136')) && method === 'POST') {
        const leadId = `lead_${Date.now()}`;
        const newLead = { 
          id: leadId, 
          properties: {
            ...body.properties,
            createdate: new Date(Date.now() - 60000).toISOString()
          }
        };
        crmStore.leads[leadId] = newLead;
        if (body.associations) {
          for (const a of body.associations) {
            const typeId = Number(a.types?.[0]?.associationTypeId);
            const targetId = a.to?.id || a.to;
            if (typeId === 608) {
              crmStore.associations['lead->contact'].push({ from: leadId, to: String(targetId) });
            } else if (typeId === 610) {
              crmStore.associations['lead->company'].push({ from: leadId, to: String(targetId) });
            }
          }
        }
        return jsonRes(newLead, 201);
      }

      // Leads Update / Get API
      if (urlStr.includes('/leads/') || urlStr.includes('/0-136/')) {
        const parts = urlStr.includes('/leads/') ? urlStr.split('/leads/')[1] : urlStr.split('/0-136/')[1];
        const leadId = parts.split('?')[0];
        
        if (method === 'PATCH') {
          if (crmStore.leads[leadId]) {
            Object.assign(crmStore.leads[leadId].properties, body.properties);
          }
        }
        return jsonRes(crmStore.leads[leadId] || { id: leadId, properties: {} });
      }

      // Deals Create API
      if ((urlStr.endsWith('/deals') || urlStr.endsWith('/0-3')) && method === 'POST') {
        const dealId = `deal_${Date.now()}_${Object.keys(crmStore.deals).length + 1}`;
        const newDeal = { 
          id: dealId, 
          properties: {
            ...body.properties,
            createdate: new Date().toISOString()
          }
        };
        crmStore.deals[dealId] = newDeal;
        if (body.associations) {
          for (const a of body.associations) {
            const typeId = Number(a.types?.[0]?.associationTypeId);
            const targetId = a.to?.id || a.to;
            if (typeId === 3) {
              crmStore.associations['deal->contact'].push({ from: dealId, to: String(targetId) });
            } else if (typeId === 5) {
              crmStore.associations['deal->company'].push({ from: dealId, to: String(targetId) });
            }
          }
        }
        return jsonRes(newDeal, 201);
      }

      // Deals Update / Get API
      if (urlStr.includes('/deals/') || urlStr.includes('/0-3/')) {
        const parts = urlStr.includes('/deals/') ? urlStr.split('/deals/')[1] : urlStr.split('/0-3/')[1];
        const dealId = parts.split('?')[0];

        if (method === 'PATCH') {
          if (crmStore.deals[dealId]) {
            Object.assign(crmStore.deals[dealId].properties, body.properties);
          }
        }
        return jsonRes(crmStore.deals[dealId] || { id: dealId, properties: {} });
      }

      // Line Items API
      if (urlStr.includes('/crm/v3/objects/line_items')) {
        return jsonRes({ results: [] });
      }

      // Meetings API
      if (urlStr.includes('/crm/v3/objects/meetings/mtg_9001') || urlStr.includes('/crm/v3/objects/meetings')) {
        return jsonRes(crmStore.meetings['mtg_9001']);
      }

      // Associations API (v4)
      if (urlStr.includes('/crm/v4/objects/')) {
        const path = urlStr.split('/crm/v4/objects/')[1].split('?')[0];
        const segments = path.split('/associations/');
        const fromSegments = segments[0].split('/');
        const rawFromType = fromSegments[0];
        const fromId = fromSegments[1];
        const rawToType = segments[1];

        const fromType = normalizeType(rawFromType);
        const toType = normalizeType(rawToType);

        const key = `${fromType}->${toType}`;
        const matches = (crmStore.associations[key] || []).filter(a => a.from === fromId).map(a => ({ toObjectId: a.to }));
        return jsonRes({ results: matches });
      }

      return jsonRes({ results: [] });
    });

    // STEP 1: Enroll Contact -> Bootstraps Lead with association 608 & advances stage to SQL
    const step1Result = await processHubSpotCustomCodeAction({
      origin: { portalId: 149041124 },
      object: { objectId: 'cnt_1001', objectType: 'CONTACT' }
    }, 'fake-token');

    expect(step1Result.outputFields.verified).toBe(true);
    expect(step1Result.outputFields.qualificationState).toBe('SATISFIED');
    expect(step1Result.outputFields.status).toBe('UPDATED_EXISTING');

    const createdLead = Object.values(crmStore.leads)[0];
    expect(createdLead).toBeDefined();
    expect(createdLead.properties.coa_opportunity_key).toBe('rel_acme_inc::LEAD::1');
    expect(createdLead.properties.hs_pipeline_stage).toBe('sql');

    // STEP 2: Enroll Lead record -> Evaluates SQL goals with meeting evidence -> Advances to Qualified & creates FTP Deal
    createdLead.properties.coa_offering_keys = 'prod_enterprise_plan';

    const step2Result = await processHubSpotCustomCodeAction({
      origin: { portalId: 149041124 },
      object: { objectId: createdLead.id, objectType: '0-136' }
    }, 'fake-token');

    expect(step2Result.outputFields.verified).toBe(true);
    expect(step2Result.outputFields.status).toBe('CREATED_SUCCESSOR');

    const ftpDeal = Object.values(crmStore.deals).find(d => d.properties?.coa_opportunity_type === 'FTP');
    expect(ftpDeal).toBeDefined();
    expect(ftpDeal.properties.coa_opportunity_key).toBe('rel_acme_inc::FTP::1');

    // STEP 3: Replay Lead invocation -> Idempotent NO_CHANGE
    const step3Result = await processHubSpotCustomCodeAction({
      origin: { portalId: 149041124 },
      object: { objectId: createdLead.id, objectType: 'LEAD' }
    }, 'fake-token');

    expect(step3Result.outputFields.status).toBe('NO_CHANGE');

    // STEP 4: FTP Deal becomes Closed Won in CRM -> Re-enroll FTP Deal -> Creates successor RTP1 Deal!
    ftpDeal.properties.dealstage = 'closedwon';

    const step4Result = await processHubSpotCustomCodeAction({
      origin: { portalId: 149041124 },
      object: { objectId: ftpDeal.id, objectType: 'DEAL' }
    }, 'fake-token');

    expect(step4Result.outputFields.verified).toBe(true);
    expect(step4Result.outputFields.status).toBe('CREATED_SUCCESSOR');

    const rtp1Deal = Object.values(crmStore.deals).find(d => d.properties?.coa_opportunity_key === 'rel_acme_inc::RTP::1');
    expect(rtp1Deal).toBeDefined();
    expect(rtp1Deal.properties.coa_opportunity_type).toBe('RTP');
    expect(rtp1Deal.properties.coa_cycle_index).toBe('1');

    // STEP 5: Replay FTP Deal -> Reconciler sees RTP1 successor already exists -> Returns NO_CHANGE
    const step5Result = await processHubSpotCustomCodeAction({
      origin: { portalId: 149041124 },
      object: { objectId: ftpDeal.id, objectType: 'DEAL' }
    }, 'fake-token');

    expect(step5Result.outputFields.status).toBe('NO_CHANGE');

    // STEP 6: RTP1 Deal becomes Closed Won in CRM -> Re-enroll RTP1 Deal -> Creates successor RTP2 Deal!
    rtp1Deal.properties.dealstage = 'closedwon';

    const step6Result = await processHubSpotCustomCodeAction({
      origin: { portalId: 149041124 },
      object: { objectId: rtp1Deal.id, objectType: '0-3' }
    }, 'fake-token');

    expect(step6Result.outputFields.verified).toBe(true);
    expect(step6Result.outputFields.status).toBe('CREATED_SUCCESSOR');

    const rtp2Deal = Object.values(crmStore.deals).find(d => d.properties?.coa_opportunity_key === 'rel_acme_inc::RTP::2');
    expect(rtp2Deal).toBeDefined();
    expect(rtp2Deal.properties.coa_opportunity_type).toBe('RTP');
    expect(rtp2Deal.properties.coa_cycle_index).toBe('2');

    // STEP 7: Replay RTP1 Deal -> Reconciler sees RTP2 successor already exists -> Returns NO_CHANGE
    const step7Result = await processHubSpotCustomCodeAction({
      origin: { portalId: 149041124 },
      object: { objectId: rtp1Deal.id, objectType: 'DEAL' }
    }, 'fake-token');

    expect(step7Result.outputFields.status).toBe('NO_CHANGE');
  });
});
