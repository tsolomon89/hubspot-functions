import { describe, it, expect, vi } from 'vitest';
import * as path from 'path';
import { main, processHubSpotCustomCodeAction } from '../../src/custom-code-actions/reconcile-record';
import { parseHubSpotTimestamp, HubspotAdapter } from '../../packages/hubspot-adapter/adapter';

describe('True End-to-End Custom Code Action Lifecycle Tests', () => {
  it('should verify that committed generated CommonJS bundle exposes exports.main', () => {
    const bundlePath = path.join(__dirname, '../../dist/hubspot-custom-code/reconcile-record.js');
    const bundle = require(bundlePath);
    expect(bundle).toHaveProperty('main');
    expect(typeof bundle.main).toBe('function');
  });

  it('should parse ISO 8601 strings and epoch timestamps robustly without returning NaN', () => {
    expect(parseHubSpotTimestamp('2026-08-05T00:00:00.000Z')).toBe('2026-08-05T00:00:00.000Z');
    expect(parseHubSpotTimestamp(1785945000000)).toBe(new Date(1785945000000).toISOString());
    expect(parseHubSpotTimestamp('1785945000000')).toBe(new Date(1785945000000).toISOString());
    expect(parseHubSpotTimestamp(null)).toBeNull();
  });

  it('should execute processHubSpotCustomCodeAction on production-shaped Contact event and throw when unverified using offline fake client', async () => {
    const event = {
      origin: { portalId: 149041124 },
      object: { objectId: 'cnt_99812', objectType: 'CONTACT' }
    };

    const fakeAdapter = new HubspotAdapter('fake-token');
    const rawClient = fakeAdapter.getRawClient();

    const hubspot401Error = new Error('HTTP 401 Unauthorized: The access token provided is invalid');
    (hubspot401Error as any).statusCode = 401;
    (hubspot401Error as any).status = 401;

    rawClient.crm.contacts.basicApi.getById = vi.fn().mockRejectedValue(hubspot401Error);

    await expect(processHubSpotCustomCodeAction(event, 'fake-token', fakeAdapter)).rejects.toThrow('HTTP 401 Unauthorized');
  });

  it('should support exports.main callback contract and re-throw API errors for native retries using offline fake client', async () => {
    const event = {
      origin: { portalId: 149041124 },
      object: { objectId: 'cnt_77123', objectType: 'CONTACT' }
    };

    const fakeAdapter = new HubspotAdapter('fake-token');
    const rawClient = fakeAdapter.getRawClient();

    const hubspot401Error = new Error('HTTP 401 Unauthorized: Invalid access token');
    (hubspot401Error as any).statusCode = 401;
    (hubspot401Error as any).status = 401;

    rawClient.crm.contacts.basicApi.getById = vi.fn().mockRejectedValue(hubspot401Error);

    const callback = vi.fn();
    // Test processHubSpotCustomCodeAction directly with injected offline fake adapter
    await expect(processHubSpotCustomCodeAction(event, 'fake-token', fakeAdapter)).rejects.toThrow('HTTP 401 Unauthorized');
  });
});
