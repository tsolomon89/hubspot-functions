import { describe, it, expect } from 'vitest';
import { validateHubspotSignatureV3 } from '../../packages/domain';
import { createHmac } from 'crypto';

describe('HubSpot Signature v3 Validation', () => {
  const clientSecret = 'my_secret_key_123';
  const httpMethod = 'POST';
  const requestUri = '/webhooks/hubspot';
  const rawBody = JSON.stringify([{ eventId: 100, subscriptionType: 'company.creation' }]);
  const timestamp = Date.now().toString();

  it('should accept valid HMAC SHA256 signature', () => {
    const sourceString = `${httpMethod}${requestUri}${rawBody}${timestamp}`;
    const validSignature = createHmac('sha256', clientSecret)
      .update(sourceString, 'utf-8')
      .digest('base64');

    const isValid = validateHubspotSignatureV3(
      clientSecret,
      validSignature,
      httpMethod,
      requestUri,
      rawBody,
      timestamp
    );

    expect(isValid).toBe(true);
  });

  it('should reject invalid signature', () => {
    const invalidSignature = 'invalid_signature_hash=';

    const isValid = validateHubspotSignatureV3(
      clientSecret,
      invalidSignature,
      httpMethod,
      requestUri,
      rawBody,
      timestamp
    );

    expect(isValid).toBe(false);
  });

  it('should reject stale request timestamp (> 5 mins drift)', () => {
    const sourceString = `${httpMethod}${requestUri}${rawBody}${timestamp}`;
    const validSignature = createHmac('sha256', clientSecret)
      .update(sourceString, 'utf-8')
      .digest('base64');

    const staleTimestamp = (Date.now() - 360000).toString(); // 6 minutes ago

    const isValid = validateHubspotSignatureV3(
      clientSecret,
      validSignature,
      httpMethod,
      requestUri,
      rawBody,
      staleTimestamp
    );

    expect(isValid).toBe(false);
  });
});
