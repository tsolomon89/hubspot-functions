import { createHmac, timingSafeEqual } from 'crypto';

export * from './identity';
export * from './config-resolver';
export * from './schema-cli';

export interface WebhookEventPayload {
  eventId: number | string;
  subscriptionId: number;
  portalId: number;
  appId: number;
  occurredAt: number;
  subscriptionType: string;
  attemptNumber: number;
  objectId: number | string;
  propertyName?: string;
  propertyValue?: any;
  changeSource?: string;
}

export function validateHubspotSignatureV3(
  clientSecret: string,
  signatureHeader: string,
  httpMethod: string,
  requestUrl: string,
  rawBody: Buffer | string,
  timestampHeader: string,
  maxDriftMs: number = 300000
): boolean {
  if (!signatureHeader || !timestampHeader || !clientSecret) {
    return false;
  }

  const currentTimestamp = Date.now();
  const requestTimestamp = parseInt(timestampHeader, 10);
  if (isNaN(requestTimestamp) || Math.abs(currentTimestamp - requestTimestamp) > maxDriftMs) {
    return false;
  }

  let formattedUrl = requestUrl;
  try {
    formattedUrl = decodeURIComponent(requestUrl);
  } catch (err) {
    // Fallback if malformed URI
  }

  const rawBodyString = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf-8');
  const sourceString = `${httpMethod.toUpperCase()}${formattedUrl}${rawBodyString}${timestampHeader}`;

  const hash = createHmac('sha256', clientSecret)
    .update(sourceString, 'utf-8')
    .digest('base64');

  const signatureBuffer = Buffer.from(signatureHeader, 'utf-8');
  const hashBuffer = Buffer.from(hash, 'utf-8');

  if (signatureBuffer.length !== hashBuffer.length) {
    return false;
  }

  return timingSafeEqual(signatureBuffer, hashBuffer);
}

export function computeOpportunityKey(relationshipKey: string, opportunityType: string, cycleIndex: number = 1): string {
  return `${relationshipKey}::${opportunityType}::${cycleIndex}`;
}

export function buildTransitionKey(
  organizationKey: string,
  opportunityKey: string,
  opportunityType: string,
  cycleIndex: number,
  configVersion: string
): string {
  return `complete::${organizationKey}::${opportunityKey}::${opportunityType}::${cycleIndex}::${configVersion}`;
}
