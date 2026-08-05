import { createHash } from 'crypto';

export interface NormalizedHubSpotEvent {
  portalId: string;
  appId: string;
  subscriptionId: string;
  eventId: string;
  eventType: 'CREATED' | 'PROPERTY_CHANGED' | 'DELETED' | 'MERGED' | 'RESTORED' | 'ASSOCIATION_CHANGED';
  objectTypeId: string; // e.g. '0-1' for contact, '0-2' for company, '0-3' for deal, '0-5' for line item
  objectId: string;
  occurredAt: number;
  propertyName?: string;
  propertyValue?: unknown;
  sourceId?: string;
  attemptNumber: number;
  rawPayloadHash: string;
  stableInboxKey: string;
}

export function normalizeHubSpotWebhookPayload(rawPayload: any): NormalizedHubSpotEvent[] {
  const events = Array.isArray(rawPayload) ? rawPayload : [rawPayload];
  const normalizedList: NormalizedHubSpotEvent[] = [];

  for (const raw of events) {
    const rawString = JSON.stringify(raw);
    const rawPayloadHash = createHash('sha256').update(rawString).digest('hex');

    const subscriptionType = String(raw.subscriptionType || raw.eventType || '').toLowerCase();
    let eventType: NormalizedHubSpotEvent['eventType'] = 'CREATED';

    if (subscriptionType.includes('propertychange') || subscriptionType.includes('property_changed')) {
      eventType = 'PROPERTY_CHANGED';
    } else if (subscriptionType.includes('deletion') || subscriptionType.includes('deleted')) {
      eventType = 'DELETED';
    } else if (subscriptionType.includes('association') || subscriptionType.includes('association_changed')) {
      eventType = 'ASSOCIATION_CHANGED';
    }

    const objectTypeId = String(raw.objectTypeId || raw.objectType || (subscriptionType.startsWith('contact') ? '0-1' : subscriptionType.startsWith('company') ? '0-2' : subscriptionType.startsWith('deal') ? '0-3' : '0-1'));
    const portalId = String(raw.portalId || '0');
    const appId = String(raw.appId || '0');
    const subscriptionId = String(raw.subscriptionId || '0');
    const eventId = String(raw.eventId || `evt_${Date.now()}`);
    const objectId = String(raw.objectId || raw.id || '0');
    const occurredAt = Number(raw.occurredAt || raw.eventTimestamp || Date.now());

    // Generate stable composite inbox key
    const stableInboxKey = `${portalId}_${appId}_${subscriptionId}_${objectTypeId}_${objectId}_${eventType}_${occurredAt}_${rawPayloadHash.slice(0, 12)}`;

    normalizedList.push({
      portalId,
      appId,
      subscriptionId,
      eventId,
      eventType,
      objectTypeId,
      objectId,
      occurredAt,
      propertyName: raw.propertyName,
      propertyValue: raw.propertyValue,
      sourceId: raw.sourceId ? String(raw.sourceId) : undefined,
      attemptNumber: Number(raw.attemptNumber || 1),
      rawPayloadHash,
      stableInboxKey
    });
  }

  return normalizedList;
}
