export interface CompanyInput {
  name: string;
  domain?: string;
  companyKey?: string;
}

export interface ContactInput {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  companyKey?: string;
}

export interface ResolvedIdentity {
  companyKey: string;
  companyName: string;
  domain?: string;
  contactEmail: string;
  contactFirstName?: string;
  contactLastName?: string;
  contactPhone?: string;
}

export function normalizeCompanyKey(name: string, domain?: string): string {
  if (domain && domain.trim().length > 0) {
    return domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  }
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

export function resolveIdentity(companyInput: CompanyInput, contactInput: ContactInput): ResolvedIdentity {
  const email = contactInput.email.trim().toLowerCase();
  const companyKey = companyInput.companyKey || normalizeCompanyKey(companyInput.name, companyInput.domain);

  return {
    companyKey,
    companyName: companyInput.name.trim(),
    domain: companyInput.domain?.trim().toLowerCase(),
    contactEmail: email,
    contactFirstName: contactInput.firstName?.trim(),
    contactLastName: contactInput.lastName?.trim(),
    contactPhone: contactInput.phone?.trim()
  };
}
