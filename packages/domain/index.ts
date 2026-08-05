import { createHmac, timingSafeEqual } from 'crypto';

export * from './identity';
export * from './deal-engine';
export * from './activation-gate';

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
  requestUri: string,
  rawBody: Buffer | string,
  timestampHeader: string,
  maxDriftMs: number = 300000
): boolean {
  if (!signatureHeader || !timestampHeader || !clientSecret) {
    return false;
  }

  // Reject stale request timestamps (> 5 mins drift)
  const currentTimestamp = Date.now();
  const requestTimestamp = parseInt(timestampHeader, 10);
  if (isNaN(requestTimestamp) || Math.abs(currentTimestamp - requestTimestamp) > maxDriftMs) {
    return false;
  }

  // Construct exact source string: METHOD + URI + RAW_BODY + TIMESTAMP
  const rawBodyString = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf-8');
  const sourceString = `${httpMethod.toUpperCase()}${requestUri}${rawBodyString}${timestampHeader}`;

  // Compute HMAC SHA256
  const hash = createHmac('sha256', clientSecret)
    .update(sourceString, 'utf-8')
    .digest('base64');

  // Constant-time comparison using timingSafeEqual to prevent timing side-channel attacks
  const signatureBuffer = Buffer.from(signatureHeader, 'utf-8');
  const hashBuffer = Buffer.from(hash, 'utf-8');

  if (signatureBuffer.length !== hashBuffer.length) {
    return false;
  }

  return timingSafeEqual(signatureBuffer, hashBuffer);
}

export function computeDealKey(companyKey: string, productKey: string): string {
  return `${companyKey}::${productKey}`;
}

export function buildTransitionKey(
  transitionType: 'AcqCW' | 'ExpCW' | 'RenCW' | 'RenCL',
  wonQuoteId: string | number
): string {
  return `Lifecycle:${transitionType}:${wonQuoteId}`;
}
