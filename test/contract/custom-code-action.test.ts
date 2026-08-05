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
});
