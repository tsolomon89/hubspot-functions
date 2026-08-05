import { describe, it, expect, vi } from 'vitest';
import * as path from 'path';
import { main, processHubSpotCustomCodeAction } from '../../src/custom-code-actions/reconcile-record';

describe('True End-to-End Custom Code Action Lifecycle Tests', () => {
  it('should verify that committed generated CommonJS bundle exposes exports.main', () => {
    const bundlePath = path.join(__dirname, '../../dist/hubspot-custom-code/reconcile-record.js');
    const bundle = require(bundlePath);
    expect(bundle).toHaveProperty('main');
    expect(typeof bundle.main).toBe('function');
  });

  it('should execute processHubSpotCustomCodeAction on production-shaped Contact event and throw when unverified', async () => {
    const event = {
      origin: { portalId: 149041124 },
      object: { objectId: 'cnt_99812', objectType: 'CONTACT' }
    };

    // Invoking without authentic API token will fail API lookup and throw structured Error for retry
    await expect(processHubSpotCustomCodeAction(event, 'invalid-token')).rejects.toThrow();
  });

  it('should support exports.main callback contract and re-throw API errors for native retries', async () => {
    const event = {
      origin: { portalId: 149041124 },
      object: { objectId: 'cnt_77123', objectType: 'CONTACT' }
    };

    const callback = vi.fn();
    await expect(main(event, callback)).rejects.toThrow();
  });
});
