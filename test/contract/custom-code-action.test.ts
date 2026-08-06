import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processHubSpotCustomCodeAction, main } from '../../src/custom-code-actions/reconcile-record';
import { HubspotAdapter, HubSpotSnapshotLoader } from '../../packages/hubspot-adapter';
import { OrganizationConfigResolver } from '../../packages/domain/config-resolver';

describe('HubSpot Custom Code Action Contract Tests', () => {
  let fakeAdapter: HubspotAdapter;

  beforeEach(() => {
    OrganizationConfigResolver.registerDynamicInstallation(10001, {
      executionPortalId: 10001,
      accountRole: 'developer-test',
      organizationKey: 'org_global_corp',
      allowedRelationshipTypes: ['b2b', 'b2c'],
      defaultRelationshipType: 'b2b'
    });

    fakeAdapter = new HubspotAdapter('fake-token');
    vi.spyOn(fakeAdapter, 'findOrCreateLeadForSubject').mockResolvedValue({
      id: 'lead_b2c_1',
      properties: { coa_opportunity_key: 'cnt_99812::LEAD::1' }
    });
  });

  it('should throw INVALID_ENROLLMENT when missing valid record ID or portal ID in event payload', async () => {
    await expect(processHubSpotCustomCodeAction({ object: { objectId: '0', objectType: 'CONTACT' } }))
      .rejects.toThrow('INVALID_ENROLLMENT');

    await expect(processHubSpotCustomCodeAction({ origin: { portalId: 10001 }, object: { objectId: '123' } } as any))
      .rejects.toThrow('INVALID_ENROLLMENT');
  });

  it('should throw MISSING_AUTHENTICATION_SECRET when no secret or adapter is provided', async () => {
    const oldToken = process.env.PRIVATE_APP_ACCESS_TOKEN;
    delete process.env.PRIVATE_APP_ACCESS_TOKEN;
    try {
      await expect(processHubSpotCustomCodeAction({
        origin: { portalId: 10001 },
        object: { objectId: 'cnt_99812', objectType: 'CONTACT' }
      })).rejects.toThrow('MISSING_AUTHENTICATION_SECRET');
    } finally {
      if (oldToken) process.env.PRIVATE_APP_ACCESS_TOKEN = oldToken;
    }
  });

  it('should accept production-shaped HubSpot event with mock adapter offline', async () => {
    vi.spyOn(HubSpotSnapshotLoader.prototype, 'loadPureSnapshotFromHubSpot').mockResolvedValue({
      organizationKey: 'org_global_corp',
      relationshipKey: 'cnt_99812',
      relationshipType: 'b2c',
      opportunityKey: 'cnt_99812::LEAD::1',
      opportunityType: 'MQL',
      opportunityState: 'OPEN',
      cycleIndex: 1,
      openedAt: new Date().toISOString(),
      subject: { kind: 'CONTACT', key: 'cnt_99812' },
      facts: { email: 'user@example.com', marketingConsent: true },
      evidence: []
    });

    vi.spyOn(fakeAdapter, 'applyTransitionIntents').mockResolvedValue({
      success: true,
      appliedIntents: 1,
      receipts: [{
        intentKind: 'UPDATE_OPPORTUNITY',
        objectType: 'lead',
        objectId: 'lead_b2c_1',
        operation: 'UPDATE',
        verified: true
      }]
    });

    const res = await processHubSpotCustomCodeAction({
      origin: { portalId: 10001 },
      object: { objectId: 'cnt_99812', objectType: 'CONTACT' },
      inputFields: { relationshipType: 'b2c' }
    }, 'fake-token', fakeAdapter);

    expect(res.outputFields.objectId).toBe('lead_b2c_1');
    expect(res.outputFields.verified).toBe(true);
  });

  it('should return error response from callback main function on failure', async () => {
    const event = {
      origin: { portalId: 10001 },
      object: { objectId: '0', objectType: 'CONTACT' }
    };
    const callback = vi.fn();
    try {
      await main(event, callback);
    } catch (e) {
      // Expected throw
    }

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      outputFields: expect.objectContaining({
        verified: false,
        status: 'FAILED'
      })
    }));
  });
});
