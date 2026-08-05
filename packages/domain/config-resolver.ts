import { QualificationConfig, validateCommercialModel } from '../commercial-kernel';
import { EMBEDDED_INSTALLATIONS, EMBEDDED_CONFIGS } from './embedded-configs';

export interface ResolveConfigOptions {
  portalId?: number | string;
  organizationKey?: string;
  relationshipType?: string;
}

export class OrganizationConfigResolver {
  public static resolveConfigByPortalId(portalId: number | string): QualificationConfig {
    return new OrganizationConfigResolver().resolveConfig({ portalId });
  }

  public resolvePortalInstallation(portalId?: number | string): { organizationKey: string; defaultRelationshipType: string } | null {
    if (!portalId) return null;
    const strPortalId = String(portalId).trim();

    if (EMBEDDED_INSTALLATIONS[strPortalId]) {
      return EMBEDDED_INSTALLATIONS[strPortalId];
    }
    return null;
  }

  public resolveConfig(options: ResolveConfigOptions): QualificationConfig {
    let orgKey = options.organizationKey;
    let relType = options.relationshipType ? options.relationshipType.trim().toLowerCase() : undefined;

    const installation = options.portalId ? this.resolvePortalInstallation(options.portalId) : null;
    if (options.portalId && !installation) {
      throw new Error(`UNSUPPORTED_PORTAL: Portal '${options.portalId}' is not registered in portal-installations.yaml`);
    }

    if (!relType) {
      relType = installation?.defaultRelationshipType || 'b2b';
    }

    if (!orgKey) {
      if (installation && (!options.relationshipType || options.relationshipType === installation.defaultRelationshipType)) {
        orgKey = installation.organizationKey;
      } else {
        orgKey = relType === 'b2c' ? 'org_consumer_brand' : 'org_global_corp';
      }
    }

    const embeddedKey = `${orgKey}:${relType}`;
    if (EMBEDDED_CONFIGS[embeddedKey]) {
      const raw = EMBEDDED_CONFIGS[embeddedKey];
      const config: QualificationConfig = {
        organizationKey: raw.organizationKey || orgKey,
        configVersion: raw.configVersion || '1.0.0',
        relationshipType: raw.relationshipType || relType,
        goalsByOpportunityType: raw.goalsByOpportunityType || { MQL: [], SQL: [], FTP: [], RTP: [] },
        hubspotPipelines: raw.hubspotPipelines || {
          leadPipelineId: 'b2b_qualification_lead_pipeline',
          dealPipelineId: 'b2b_transaction_deal_pipeline'
        },
        featureFlags: raw.featureFlags || {}
      };
      const valRes = validateCommercialModel(config);
      if (valRes.valid) return config;
    }

    // Fail closed explicitly if requested org key or relationship type is unknown
    throw new Error(`UNSUPPORTED_RELATIONSHIP_TYPE: Qualification configuration for '${orgKey}:${relType}' was not found`);
  }
}
