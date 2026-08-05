import { describe, it, expect } from 'vitest';
import { processHubSpotCustomCodeAction } from '../../src/custom-code-actions/reconcile-record';

describe('HubSpot Custom Code Action Contract Tests', () => {
  it('should throw error when missing record ID in event payload', async () => {
    await expect(processHubSpotCustomCodeAction({ object: { id: 0 } }))
      .rejects.toThrow('INVALID_ENROLLMENT');
  });

  it('should re-throw API authentication errors to trigger native HubSpot workflow retries', async () => {
    await expect(processHubSpotCustomCodeAction({
      origin: { portalId: 149041124 },
      object: { id: 'cnt_99812', objectType: '0-1' },
      inputFields: { relationshipType: 'b2c' }
    }, 'invalid-token-xyz')).rejects.toThrow('HTTP-Code: 401');
  });
});
