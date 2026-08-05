export type SubjectKind = 'CONTACT' | 'COMPANY' | 'COMPANY_CONTACTS';

export interface ContactRef {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
}

export interface CompanyRef {
  companyKey?: string;
  name: string;
  domain?: string;
}

export interface CommercialSubject {
  kind: SubjectKind;
  subjectKey: string;
  contact?: ContactRef;
  company?: CompanyRef;
  associatedContactEmails?: string[];
}

export function sanitizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '_');
}

export function resolveSubjectIdentity(
  contactInput?: ContactRef,
  companyInput?: CompanyRef
): CommercialSubject {
  if (companyInput && companyInput.name) {
    const rawCompanyKey = companyInput.companyKey || companyInput.domain || companyInput.name;
    const companyKey = sanitizeKey(rawCompanyKey);
    const company: CompanyRef = {
      companyKey,
      name: companyInput.name.trim(),
      domain: companyInput.domain ? companyInput.domain.trim().toLowerCase() : undefined
    };

    if (contactInput && contactInput.email) {
      const email = contactInput.email.trim().toLowerCase();
      // Subject key is the Company Key; contact is associated under the same Company subject
      return {
        kind: 'COMPANY_CONTACTS',
        subjectKey: companyKey,
        company,
        contact: {
          email,
          firstName: contactInput.firstName ? contactInput.firstName.trim() : undefined,
          lastName: contactInput.lastName ? contactInput.lastName.trim() : undefined,
          phone: contactInput.phone ? contactInput.phone.trim() : undefined
        },
        associatedContactEmails: [email]
      };
    }

    return {
      kind: 'COMPANY',
      subjectKey: companyKey,
      company
    };
  }

  if (contactInput && contactInput.email) {
    const email = contactInput.email.trim().toLowerCase();
    return {
      kind: 'CONTACT',
      subjectKey: email,
      contact: {
        email,
        firstName: contactInput.firstName ? contactInput.firstName.trim() : undefined,
        lastName: contactInput.lastName ? contactInput.lastName.trim() : undefined,
        phone: contactInput.phone ? contactInput.phone.trim() : undefined
      }
    };
  }

  throw new Error('Invalid subject input: Must provide either a valid Contact email or Company name');
}
