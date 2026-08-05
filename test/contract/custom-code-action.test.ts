import { describe, it, expect, vi } from 'vitest';
import { processHubSpotCustomCodeAction, main } from '../../src/custom-code-actions/reconcile-record';

describe('HubSpot Custom Code Action Contract Tests', () => {
  it('should throw error when missing valid record ID in production-shaped HubSpot event payload', async () => {
    await expect(processHubSpotCustomCodeAction({ object: { objectId: '0', objectType: 'CONTACT' } }))
      .rejects.toThrow('INVALID_ENROLLMENT');
  });

  it('should accept production-shaped HubSpot event (object.objectId & uppercase objectType)', async () => {
    await expect(processHubSpotCustomCodeAction({
      origin: { portalId: 149041124 },
      object: { objectId: 'cnt_99812', objectType: 'CONTACT' },
      inputFields: { relationshipType: 'b2c' }
    }, 'invalid-token-xyz')).rejects.toThrow('HTTP-Code: 401');
  });

  it('should support exports.main callback contract and re-throw API errors for native retries', async () => {
    const event = {
      origin: { portalId: 149041124 },
      object: { objectId: 'cnt_77123', objectType: 'CONTACT' },
      inputFields: { relationshipType: 'b2b' }
    };

    await expect(main(event)).rejects.toThrow('HTTP-Code: 401');
  });

  it('should throw ACTION_UNVERIFIED when CRM mutation succeeds but readback property verification fails', async () => {
    vi.spyOn(global as any, 'fetch').mockImplementation(async (url: any, init: any) => {
      const urlStr = String(url);
      const method = init?.method || 'GET';

      const jsonRes = (data: any, status: number = 200) => new Response(JSON.stringify(data), {
        status,
        headers: { 'content-type': 'application/json' }
      });

      if (urlStr.includes('/crm/v3/objects/contacts/cnt_fail_readback')) {
        if (method === 'PATCH') {
          return jsonRes({ id: 'cnt_fail_readback', properties: { lifecyclestage: 'marketingqualifiedlead' } });
        }
        // Readback returns stale stage 'lead' (mismatch with expected 'marketingqualifiedlead')
        return jsonRes({ 
          id: 'cnt_fail_readback', 
          properties: {
            email: 'test@example.com',
            coa_relationship_key: 'rel_fail',
            coa_relationship_type: 'b2b',
            coa_marketing_consent: 'true',
            lifecyclestage: 'lead' // Stale property causing readback failure
          }
        });
      }

      if (urlStr.includes('/crm/v3/objects/leads/search')) {
        return jsonRes({ 
          results: [{ 
            id: 'lead_123', 
            properties: { 
              coa_opportunity_key: 'rel_fail::LEAD::1', 
              hs_pipeline_stage: 'mql' 
            } 
          }] 
        });
      }

      if (urlStr.includes('/crm/v3/objects/leads/lead_123')) {
        return jsonRes({ id: 'lead_123', properties: { coa_opportunity_key: 'rel_fail::LEAD::1', hs_pipeline_stage: 'mql' } });
      }

      if (urlStr.includes('/crm/v4/objects/')) {
        return jsonRes({ results: [] });
      }

      return jsonRes({ results: [] });
    });

    const event = {
      origin: { portalId: 149041124 },
      object: { objectId: 'cnt_fail_readback', objectType: 'CONTACT' }
    };

    await expect(processHubSpotCustomCodeAction(event, 'fake-token')).rejects.toThrow('ACTION_UNVERIFIED');
  });
});
