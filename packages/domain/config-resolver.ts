import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { QualificationConfig, validateCommercialModel } from '../commercial-kernel';
import { logger } from '../observability';

export interface ResolveConfigOptions {
  portalId?: number | string;
  organizationKey?: string;
  relationshipType: string;
}

export class OrganizationConfigResolver {
  private configDir: string;

  constructor(configDir?: string) {
    this.configDir = configDir || path.join(__dirname, '../../config/organizations');
  }

  public resolveConfig(options: ResolveConfigOptions): QualificationConfig {
    const relType = options.relationshipType.trim().toLowerCase();

    // Map known portal or org key to configuration file
    let candidateFilename = `${relType}.yaml`;
    if (options.organizationKey) {
      candidateFilename = `${options.organizationKey}-${relType}.yaml`;
    } else if (relType === 'b2b') {
      candidateFilename = 'example-b2b.yaml';
    } else if (relType === 'b2c') {
      candidateFilename = 'example-b2c.yaml';
    }

    let filePath = path.join(this.configDir, candidateFilename);
    if (!fs.existsSync(filePath)) {
      // Check fallback example for standard relTypes
      if (relType === 'b2b') filePath = path.join(this.configDir, 'example-b2b.yaml');
      else if (relType === 'b2c') filePath = path.join(this.configDir, 'example-b2c.yaml');
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`UNSUPPORTED_RELATIONSHIP_TYPE: Commercial configuration for relationship type '${relType}' was not found at ${filePath}`);
    }

    let parsed: any;
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      parsed = yaml.parse(raw);
    } catch (err: any) {
      throw new Error(`INVALID_ORGANIZATION_CONFIG: Failed to parse YAML config at ${filePath}: ${err.message}`);
    }

    const config: QualificationConfig = {
      organizationKey: parsed.organizationKey || options.organizationKey || 'org_default',
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
