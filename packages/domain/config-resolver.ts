import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { QualificationConfig, validateCommercialModel } from '../commercial-kernel';
import { logger } from '../observability';

export interface ResolveConfigOptions {
  portalId?: number | string;
  organizationKey?: string;
  relationshipType?: string;
}

export class OrganizationConfigResolver {
  private configDir: string;
  private installationsPath: string;

  constructor(configDir?: string) {
    this.configDir = configDir || path.join(__dirname, '../../config/organizations');
    this.installationsPath = path.join(__dirname, '../../config/portal-installations.yaml');
  }

  public resolvePortalInstallation(portalId?: number | string): { organizationKey: string; defaultRelationshipType: string } | null {
    if (!portalId) return null;
    const strPortalId = String(portalId).trim();

    if (fs.existsSync(this.installationsPath)) {
      try {
        const raw = fs.readFileSync(this.installationsPath, 'utf-8');
        const parsed = yaml.parse(raw);
        const mapping = parsed?.installations?.[strPortalId];
        if (mapping) {
          return {
            organizationKey: mapping.organizationKey,
            defaultRelationshipType: mapping.defaultRelationshipType || 'b2b'
          };
        }
      } catch (err) {
        // Fallthrough
      }
    }

    throw new Error(`UNSUPPORTED_PORTAL: Portal '${strPortalId}' is not registered in portal-installations.yaml`);
  }

  public resolveConfig(options: ResolveConfigOptions): QualificationConfig {
    let orgKey = options.organizationKey;
    let relType = options.relationshipType ? options.relationshipType.trim().toLowerCase() : undefined;

    if (options.portalId) {
      const installation = this.resolvePortalInstallation(options.portalId);
      if (installation) {
        if (!orgKey) orgKey = installation.organizationKey;
        if (!relType) relType = installation.defaultRelationshipType;
      }
    }

    if (!relType) relType = 'b2b';

    let candidateFilename = `${relType}.yaml`;
    if (orgKey) {
      candidateFilename = `${orgKey}-${relType}.yaml`;
    }

    let filePath = path.join(this.configDir, candidateFilename);
    if (!fs.existsSync(filePath)) {
      if (relType === 'b2b') filePath = path.join(this.configDir, 'example-b2b.yaml');
      else if (relType === 'b2c') filePath = path.join(this.configDir, 'example-b2c.yaml');
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`UNSUPPORTED_RELATIONSHIP_TYPE: Qualification configuration for relationship type '${relType}' was not found at ${filePath}`);
    }

    let parsed: any;
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      parsed = yaml.parse(raw);
    } catch (err: any) {
      throw new Error(`INVALID_ORGANIZATION_CONFIG: Failed to parse YAML config at ${filePath}: ${err.message}`);
    }

    const config: QualificationConfig = {
      organizationKey: parsed.organizationKey || orgKey || 'org_default',
      configVersion: parsed.configVersion || '1.0.0',
      relationshipType: parsed.relationshipType || relType,
      goalsByOpportunityType: parsed.goalsByOpportunityType || { MQL: [], SQL: [], FTP: [], RTP: [] },
      featureFlags: parsed.featureFlags || {}
    };

    const valRes = validateCommercialModel(config);
    if (!valRes.valid) {
      throw new Error(`INVALID_ORGANIZATION_CONFIG: Organization configuration validation failed: ${valRes.errors.join(', ')}`);
    }

    logger.info('Resolved Organization Qualification Configuration', { 
      organizationKey: config.organizationKey, 
      relationshipType: config.relationshipType,
      configVersion: config.configVersion
    });

    return config;
  }
}
