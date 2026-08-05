import { QualificationConfig, validateCommercialModel } from '../commercial-kernel';
import { EMBEDDED_INSTALLATIONS, EMBEDDED_CONFIGS } from './embedded-configs';

export interface ResolveConfigOptions {
  portalId?: number | string;
  organizationKey?: string;
  relationshipType?: string;
}

export class OrganizationConfigResolver {
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

    if (options.portalId) {
      const installation = this.resolvePortalInstallation(options.portalId);
      if (!installation) {
        throw new Error(`UNSUPPORTED_PORTAL: Portal '${options.portalId}' is not registered in portal-installations.yaml`);
      }
      if (!orgKey) orgKey = installation.organizationKey;
      if (!relType) relType = installation.defaultRelationshipType;
    }

    if (!relType) relType = 'b2b';
    if (!orgKey) orgKey = relType === 'b2c' ? 'org_consumer_brand' : 'org_global_corp';

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

    // Fallback to default B2B or B2C embedded config if matching key not found
    const fallbackKey = relType === 'b2c' ? 'org_consumer_brand:b2c' : 'org_global_corp:b2b';
    if (EMBEDDED_CONFIGS[fallbackKey]) {
      const raw = EMBEDDED_CONFIGS[fallbackKey];
      return {
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
    }

    throw new Error(`UNSUPPORTED_RELATIONSHIP_TYPE: Qualification configuration for relationship type '${relType}' was not found`);
  }
}
