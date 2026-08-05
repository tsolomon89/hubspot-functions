import { describe, it, expect } from 'vitest';
import { resolveSubjectIdentity, sanitizeKey } from '../../packages/domain';

describe('Universal Commercial Subject Identity Resolution', () => {
  it('should resolve Contact-only subject key as email without b2c_ prefix', () => {
    const subject = resolveSubjectIdentity({
      email: 'alice@example.com',
      firstName: 'Alice',
      lastName: 'Smith'
    });

    expect(subject.kind).toBe('CONTACT');
    expect(subject.subjectKey).toBe('alice@example.com');
    expect(subject.contact?.email).toBe('alice@example.com');
    expect(subject.company).toBeUndefined();
  });

  it('should resolve Company-only subject key as companyKey without prefixes', () => {
    const subject = resolveSubjectIdentity(undefined, {
      name: 'Acme Corp',
      domain: 'acme.com'
    });

    expect(subject.kind).toBe('COMPANY');
    expect(subject.subjectKey).toBe('acme.com');
    expect(subject.company?.name).toBe('Acme Corp');
    expect(subject.contact).toBeUndefined();
  });

  it('should associate B2B Contact under Company subject key (acme.com)', () => {
    const subject = resolveSubjectIdentity(
      { email: 'bob@acme.com', firstName: 'Bob' },
      { name: 'Acme Corp', domain: 'acme.com' }
    );

    expect(subject.kind).toBe('COMPANY_CONTACTS');
    expect(subject.subjectKey).toBe('acme.com');
    expect(subject.company?.name).toBe('Acme Corp');
    expect(subject.associatedContactEmails).toContain('bob@acme.com');
  });

  it('should sanitize key characters safely', () => {
    expect(sanitizeKey('Globex  Corporation! @123')).toBe('globex__corporation___123');
  });
});
