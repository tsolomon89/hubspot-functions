import { QualificationConfig, validateCommercialModel } from '../commercial-kernel';
import { EMBEDDED_INSTALLATIONS, EMBEDDED_CONFIGS } from './embedded-configs';

export interface ResolveConfigOptions {
  portalId?: number | string;
  organizationKey?: string;
  relationshipType?: string;
  productType?: string;
  bypassAccountRoleGuard?: boolean;
}

export interface PortalInstallationInfo {
  executionPortalId?: number;
  accountRole?: string;
  organizationKey: string;
  allowedRelationshipTypes?: string[];
  defaultRelationshipType?: string;
  expectedConfigVersion?: string;
}

export class OrganizationConfigResolver {
  private static dynamicInstallations: Record<string, PortalInstallationInfo> = {};

  public static registerDynamicInstallation(portalId: number | string, info: PortalInstallationInfo) {
    const strPortalId = String(portalId).trim();
    OrganizationConfigResolver.dynamicInstallations[strPortalId] = info;
  }

  public static resolveConfigByPortalId(
    portalId: number | string,
    options?: Omit<ResolveConfigOptions, 'portalId'>
  ): QualificationConfig {
    return new OrganizationConfigResolver().resolveConfig({ portalId, ...options });
  }

  public resolvePortalInstallation(portalId?: number | string): PortalInstallationInfo | null {
    if (!portalId) return null;
    const strPortalId = String(portalId).trim();

    if (OrganizationConfigResolver.dynamicInstallations[strPortalId]) {
      return OrganizationConfigResolver.dynamicInstallations[strPortalId];
    }

    if (EMBEDDED_INSTALLATIONS[strPortalId]) {
      return EMBEDDED_INSTALLATIONS[strPortalId] as PortalInstallationInfo;
    }
    return null;
  }

  public resolveConfig(options: ResolveConfigOptions): QualificationConfig {
    if (!options.portalId && !options.organizationKey) {
      throw new Error('MISSING_RESOLVER_INPUT: Must supply either portalId or organizationKey to resolve configuration');
    }

    let installation: PortalInstallationInfo | null = null;
    if (options.portalId) {
      installation = this.resolvePortalInstallation(options.portalId);
      if (!installation && !options.organizationKey) {
        throw new Error(`UNSUPPORTED_PORTAL: Portal '${options.portalId}' is not registered in portal-installations.yaml`);
      }
      if (installation && !options.bypassAccountRoleGuard && installation.accountRole && installation.accountRole !== 'developer-test') {
        throw new Error(`NON_DEVELOPER_TEST_PORTAL_MUTATION_GUARD: Portal '${options.portalId}' role is '${installation.accountRole}', expected 'developer-test'`);
      }
    }

    let orgKey = options.organizationKey || installation?.organizationKey || 'org_global_corp';
    if (installation && options.organizationKey && options.organizationKey !== installation.organizationKey) {
      throw new Error(`ORGANIZATION_MISMATCH: Provided organizationKey '${options.organizationKey}' does not match portal installation '${installation.organizationKey}'`);
    }

    let relType = options.relationshipType ? options.relationshipType.trim().toLowerCase() : undefined;
    if (!relType) {
      if (installation?.defaultRelationshipType) {
        relType = installation.defaultRelationshipType;
      } else {
        relType = 'b2b';
      }
    }

    if (installation?.allowedRelationshipTypes && !installation.allowedRelationshipTypes.includes(relType)) {
      throw new Error(`UNALLOWED_RELATIONSHIP_TYPE: Relationship type '${relType}' is not allowed for portal '${options.portalId}' (allowed: ${installation.allowedRelationshipTypes.join(', ')})`);
    }

    const embeddedKey = `${orgKey}:${relType}`;
    if (EMBEDDED_CONFIGS[embeddedKey]) {
      const raw = EMBEDDED_CONFIGS[embeddedKey];
      const config: QualificationConfig = {
        organizationKey: raw.organizationKey || orgKey,
        configVersion: raw.configVersion || '1.0.0',
        relationshipType: raw.relationshipType || relType,
        productType: options.productType || raw.productType || 'software',
        goalsByOpportunityType: raw.goalsByOpportunityType || { MQL: [], SQL: [], FTP: [], RTP: [] },
        hubspotPipelines: raw.hubspotPipelines,
        offeringPolicy: raw.offeringPolicy,
        featureFlags: raw.featureFlags || {}
      };
      const valRes = validateCommercialModel(config);
      if (valRes.valid) return config;
      throw new Error(`INVALID_ORGANIZATION_CONFIG: Configuration '${embeddedKey}' failed validation: ${valRes.errors.join(', ')}`);
    }

    throw new Error(`UNSUPPORTED_RELATIONSHIP_TYPE: Qualification configuration for '${orgKey}:${relType}' was not found`);
  }
}
