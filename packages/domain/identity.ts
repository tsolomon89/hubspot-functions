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
      const subjectKey = `b2b_${companyKey}_${sanitizeKey(email)}`;
      return {
        kind: 'COMPANY_CONTACTS',
        subjectKey,
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
      subjectKey: `company_${companyKey}`,
      company
    };
  }

  if (contactInput && contactInput.email) {
    const email = contactInput.email.trim().toLowerCase();
    return {
      kind: 'CONTACT',
      subjectKey: `b2c_${sanitizeKey(email)}`,
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
