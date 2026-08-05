import { describe, it, expect } from 'vitest';
import { resolveIdentity, normalizeCompanyKey } from '../../packages/domain';

describe('Identity Resolution Domain Logic', () => {
  it('should normalize company key from domain if provided', () => {
    const key = normalizeCompanyKey('Acme Corporation', 'https://www.acme-corp.com/about');
    expect(key).toBe('www.acme-corp.com');
  });

  it('should normalize company key from name if domain is missing', () => {
    const key = normalizeCompanyKey('Acme Corporation, Inc.');
    expect(key).toBe('acme_corporation_inc');
  });

  it('should resolve canonical Contact & Company identity from intake', () => {
    const resolved = resolveIdentity(
      { name: 'Globex Corp', domain: 'globex.com' },
      { email: ' Alice@Globex.com ', firstName: 'Alice', lastName: 'Smith' }
    );

    expect(resolved.contactEmail).toBe('alice@globex.com');
    expect(resolved.companyKey).toBe('globex.com');
    expect(resolved.companyName).toBe('Globex Corp');
    expect(resolved.contactFirstName).toBe('Alice');
    expect(resolved.contactLastName).toBe('Smith');
  });
});
