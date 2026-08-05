import { describe, it, expect } from 'vitest';
import { resolveSubjectIdentity, sanitizeKey } from '../../packages/domain';

describe('Universal Commercial Subject Identity Resolution', () => {
  it('should resolve B2C Contact-only subject cleanly', () => {
    const subject = resolveSubjectIdentity({
      email: 'alice@example.com',
      firstName: 'Alice',
      lastName: 'Smith'
    });

    expect(subject.kind).toBe('CONTACT');
    expect(subject.subjectKey).toBe('b2c_alice_example.com');
    expect(subject.contact?.email).toBe('alice@example.com');
    expect(subject.company).toBeUndefined();
  });

  it('should resolve Company-only subject', () => {
    const subject = resolveSubjectIdentity(undefined, {
      name: 'Acme Corp',
      domain: 'acme.com'
    });

    expect(subject.kind).toBe('COMPANY');
    expect(subject.subjectKey).toBe('company_acme.com');
    expect(subject.company?.name).toBe('Acme Corp');
    expect(subject.contact).toBeUndefined();
  });

  it('should resolve B2B Company + Contact subject', () => {
    const subject = resolveSubjectIdentity(
      { email: 'bob@acme.com', firstName: 'Bob' },
      { name: 'Acme Corp', domain: 'acme.com' }
    );

    expect(subject.kind).toBe('COMPANY_CONTACTS');
    expect(subject.subjectKey).toBe('b2b_acme.com_bob_acme.com');
    expect(subject.company?.name).toBe('Acme Corp');
    expect(subject.contact?.email).toBe('bob@acme.com');
  });

  it('should sanitize key characters safely', () => {
    expect(sanitizeKey('Globex  Corporation! @123')).toBe('globex__corporation___123');
  });
});
