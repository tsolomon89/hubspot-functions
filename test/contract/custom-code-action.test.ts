import { describe, it, expect, vi } from 'vitest';
import { processHubSpotCustomCodeAction, main } from '../../src/custom-code-actions/reconcile-record';
import { HubspotAdapter, HubSpotSnapshotLoader } from '../../packages/hubspot-adapter';

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
    const fakeAdapter = new HubspotAdapter('fake-token');

    vi.spyOn(fakeAdapter, 'findOrCreateLeadForSubject').mockResolvedValueOnce({
      id: 'lead_fail_readback',
      properties: { coa_opportunity_key: 'rel_fail::LEAD::1' }
    });

    vi.spyOn(HubSpotSnapshotLoader.prototype, 'loadSnapshotFromRecord').mockResolvedValue({
      organizationKey: 'org_global_corp',
      relationshipKey: 'rel_fail',
      relationshipType: 'b2b',
      opportunityKey: 'rel_fail::LEAD::1',
      opportunityType: 'MQL',
      opportunityState: 'OPEN',
      cycleIndex: 1,
      openedAt: new Date().toISOString(),
      subject: { kind: 'CONTACT', key: 'cnt_fail_readback' },
      facts: { email: 'test@example.com', marketingConsent: true },
      evidence: []
    });

    vi.spyOn(fakeAdapter, 'applyTransitionIntents').mockResolvedValueOnce({
      success: false,
      appliedIntents: 1,
      receipts: [{
        intentKind: 'PROJECT_LIFECYCLE_STAGE',
        objectType: 'contact',
        objectId: 'cnt_fail_readback',
        operation: 'UPDATE',
        verified: false,
        error: 'Readback verification failed'
      }]
    });

    const event = {
      origin: { portalId: 149041124 },
      object: { objectId: 'cnt_fail_readback', objectType: 'CONTACT' }
    };

    await expect(processHubSpotCustomCodeAction(event, 'fake-token', fakeAdapter)).rejects.toThrow('ACTION_UNVERIFIED');
  });
});
