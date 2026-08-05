import { describe, it, expect, vi } from 'vitest';
import { processHubSpotCustomCodeAction, main } from '../../src/custom-code-actions/reconcile-record';
import { HubspotAdapter, HubSpotSnapshotLoader } from '../../packages/hubspot-adapter';

describe('HubSpot Custom Code Action Contract Tests', () => {
  it('should throw INVALID_ENROLLMENT when missing valid record ID or portal ID in event payload', async () => {
    await expect(processHubSpotCustomCodeAction({ object: { objectId: '0', objectType: 'CONTACT' } }))
      .rejects.toThrow('INVALID_ENROLLMENT');

    await expect(processHubSpotCustomCodeAction({ origin: { portalId: 149041124 }, object: { objectId: '123' } } as any))
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

  it('should throw ACTION_UNVERIFIED through processHubSpotCustomCodeAction when CRM mutation readback fails', async () => {
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

  it('should return BLOCKED immediately when associated Company has coa_automation_suppressed=true', async () => {
    const fakeAdapter = new HubspotAdapter('fake-token');

    vi.spyOn(HubSpotSnapshotLoader.prototype, 'loadSnapshotFromRecord').mockResolvedValue({
      organizationKey: 'org_global_corp',
      relationshipKey: 'comp_suppressed_1',
      relationshipType: 'b2b',
      opportunityKey: 'comp_suppressed_1::LEAD::1',
      opportunityType: 'MQL',
      opportunityState: 'OPEN',
      cycleIndex: 1,
      openedAt: new Date().toISOString(),
      subject: { kind: 'CONTACT', key: 'cnt_unsuppressed', companyKey: 'comp_suppressed_1' },
      facts: { email: 'contact@acme.com', automationSuppressed: true }, // Aggregated company suppression!
      evidence: []
    });

    const findLeadSpy = vi.spyOn(fakeAdapter, 'findOrCreateLeadForSubject');

    const event = {
      origin: { portalId: 149041124 },
      object: { objectId: 'cnt_unsuppressed', objectType: 'CONTACT' }
    };

    const res = await processHubSpotCustomCodeAction(event, 'fake-token', fakeAdapter);

    expect(res.outputFields.status).toBe('BLOCKED');
    expect(res.outputFields.qualificationState).toBe('BLOCKED');
    expect(findLeadSpy).not.toHaveBeenCalled(); // Suppression gate blocked before Lead bootstrap!
  });

  it('should return BLOCKED immediately when Contact and Company relationship keys mismatch', async () => {
    const fakeAdapter = new HubspotAdapter('fake-token');

    vi.spyOn(HubSpotSnapshotLoader.prototype, 'loadSnapshotFromRecord').mockResolvedValue({
      organizationKey: 'org_global_corp',
      relationshipKey: 'comp_rel_key_1',
      relationshipType: 'b2b',
      opportunityKey: 'comp_rel_key_1::LEAD::1',
      opportunityType: 'MQL',
      opportunityState: 'OPEN',
      cycleIndex: 1,
      openedAt: new Date().toISOString(),
      subject: { kind: 'CONTACT', key: 'cnt_rel_mismatch', companyKey: 'comp_rel_key_1' },
      facts: { email: 'mismatch@acme.com', automationSuppressed: true, relationshipKeyMismatch: true },
      evidence: []
    });

    const event = {
      origin: { portalId: 149041124 },
      object: { objectId: 'cnt_rel_mismatch', objectType: 'CONTACT' }
    };

    const res = await processHubSpotCustomCodeAction(event, 'fake-token', fakeAdapter);

    expect(res.outputFields.status).toBe('BLOCKED');
    expect(res.outputFields.qualificationState).toBe('BLOCKED');
  });

  it('should throw ACTION_UNVERIFIED through processHubSpotCustomCodeAction when malformed existing successor Deal verification fails in adapter', async () => {
    const fakeAdapter = new HubspotAdapter('fake-token');

    vi.spyOn(HubSpotSnapshotLoader.prototype, 'loadSnapshotFromRecord').mockResolvedValue({
      organizationKey: 'org_global_corp',
      relationshipKey: 'rel_malformed_deal',
      relationshipType: 'b2b',
      opportunityKey: 'rel_malformed_deal::LEAD::1',
      opportunityType: 'SQL',
      opportunityState: 'WON',
      cycleIndex: 1,
      openedAt: new Date().toISOString(),
      subject: { kind: 'COMPANY', key: 'comp_malformed_1' },
      facts: { email: 'admin@acme.com', offeringKeys: ['prod_software'] },
      evidence: []
    });

    vi.spyOn(fakeAdapter, 'findOrCreateLeadForSubject').mockResolvedValue({
      id: 'lead_malformed_deal',
      properties: { coa_opportunity_key: 'rel_malformed_deal::LEAD::1' }
    });

    vi.spyOn(fakeAdapter, 'applyTransitionIntents').mockResolvedValue({
      success: false,
      appliedIntents: 1,
      receipts: [{
        intentKind: 'CREATE_SUCCESSOR',
        objectType: 'deal',
        objectId: 'deal_corrupt_1',
        operation: 'NOOP',
        verified: false,
        error: 'Existing successor Deal failed property or association verification'
      }]
    });

    const event = {
      origin: { portalId: 149041124 },
      object: { objectId: 'comp_malformed_1', objectType: 'COMPANY' }
    };

    await expect(processHubSpotCustomCodeAction(event, 'fake-token', fakeAdapter)).rejects.toThrow('ACTION_UNVERIFIED');
  });
});
