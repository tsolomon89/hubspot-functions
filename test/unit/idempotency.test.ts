import { describe, it, expect } from 'vitest';
import { computeDealKey, buildTransitionKey } from '../../packages/domain';

describe('Idempotency & Keys Domain Validation', () => {
  it('should compute deterministic Company x Product Deal key', () => {
    const key = computeDealKey('comp_12345', 'product_sku_abc');
    expect(key).toBe('comp_12345::product_sku_abc');
  });

  it('should build transition keys for quote lifecycle', () => {
    const keyAcq = buildTransitionKey('AcqCW', 'quote_999');
    const keyExp = buildTransitionKey('ExpCW', 'quote_999');

    expect(keyAcq).toBe('Lifecycle:AcqCW:quote_999');
    expect(keyExp).toBe('Lifecycle:ExpCW:quote_999');
  });
});
