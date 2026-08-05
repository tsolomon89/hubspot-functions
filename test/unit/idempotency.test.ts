import { describe, it, expect } from 'vitest';
import { computeOpportunityKey, buildTransitionKey } from '../../packages/domain';

describe('Idempotency & Keys Domain Validation', () => {
  it('should compute deterministic universal Opportunity key', () => {
    const key = computeOpportunityKey('rel_acme_b2b', 'MQL', 1);
    expect(key).toBe('rel_acme_b2b::MQL::1');
  });

  it('should build transition keys for commercial kernel state machine', () => {
    const key = buildTransitionKey('org_test', 'rel_acme_b2b::MQL::1', 'MQL', 1, '1.0.0');
    expect(key).toBe('complete::org_test::rel_acme_b2b::MQL::1::MQL::1::1.0.0');
  });
});
