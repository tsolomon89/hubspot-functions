import { describe, it, expect } from 'vitest';
import { normalizeHubSpotWebhookPayload } from '../../packages/hubspot-adapter';

describe('HubSpot Webhook Envelope Normalization', () => {
  it('should normalize generic object creation webhook event', () => {
    const rawWebhook = {
      eventId: 1001,
      subscriptionId: 501,
      portalId: 149041124,
      appId: 48120331,
      occurredAt: 1785920000000,
      subscriptionType: 'contact.creation',
      attemptNumber: 1,
      objectId: 88123
    };

    const normalized = normalizeHubSpotWebhookPayload(rawWebhook);

    expect(normalized).toHaveLength(1);
    expect(normalized[0].portalId).toBe('149041124');
    expect(normalized[0].objectId).toBe('88123');
    expect(normalized[0].eventType).toBe('CREATED');
    expect(normalized[0].stableInboxKey).toContain('149041124_48120331_501');
  });

  it('should normalize property change webhook event', () => {
    const rawWebhook = {
      eventId: 1002,
      subscriptionId: 502,
      portalId: 149041124,
      appId: 48120331,
      occurredAt: 1785920001000,
      subscriptionType: 'deal.propertyChange',
      propertyName: 'dealstage',
      propertyValue: 'closedwon',
      attemptNumber: 1,
      objectId: 99456
    };

    const normalized = normalizeHubSpotWebhookPayload(rawWebhook);

    expect(normalized).toHaveLength(1);
    expect(normalized[0].eventType).toBe('PROPERTY_CHANGED');
    expect(normalized[0].propertyName).toBe('dealstage');
    expect(normalized[0].propertyValue).toBe('closedwon');
  });
});
