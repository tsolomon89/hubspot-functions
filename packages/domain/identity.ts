export type SubjectKind = 'CONTACT' | 'COMPANY' | 'COMPANY_CONTACTS';

export interface ContactRef {
  email?: string;
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

export function deriveRelationshipKey(
  organizationKey: string,
  relationshipType: string,
  subjectAnchor: string
): string {
  const cleanOrg = sanitizeKey(organizationKey);
  const cleanRel = sanitizeKey(relationshipType);
  const cleanAnchor = sanitizeKey(subjectAnchor);
  return `rel_${cleanOrg}_${cleanRel}_${cleanAnchor}`;
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

    if (contactInput && (contactInput.email || contactInput.phone)) {
      const email = contactInput.email ? contactInput.email.trim().toLowerCase() : undefined;
      const anchor = email || sanitizeKey(contactInput.phone || 'phone_contact');
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
        associatedContactEmails: email ? [email] : []
      };
    }

    return {
      kind: 'COMPANY',
      subjectKey: companyKey,
      company
    };
  }

  if (contactInput && (contactInput.email || contactInput.phone)) {
    const email = contactInput.email ? contactInput.email.trim().toLowerCase() : undefined;
    const phone = contactInput.phone ? contactInput.phone.trim() : undefined;
    const subjectKey = email || sanitizeKey(phone || 'phone_contact');
    return {
      kind: 'CONTACT',
      subjectKey,
      contact: {
        email,
        firstName: contactInput.firstName ? contactInput.firstName.trim() : undefined,
        lastName: contactInput.lastName ? contactInput.lastName.trim() : undefined,
        phone
      }
    };
  }

  throw new Error('Invalid subject input: Must provide either a valid Contact email/phone or Company name');
}
