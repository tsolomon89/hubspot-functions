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

// Embedded in-memory static configurations for zero-filesystem runtime execution (HubSpot Custom Code Actions)
const EMBEDDED_INSTALLATIONS: Record<string, { organizationKey: string; defaultRelationshipType: string }> = {
  '149041124': {
    organizationKey: 'org_global_corp',
    defaultRelationshipType: 'b2b'
  }
};

const EMBEDDED_CONFIGS: Record<string, QualificationConfig> = {
  'org_global_corp:b2b': {
    organizationKey: 'org_global_corp',
    configVersion: '1.0.0',
    relationshipType: 'b2b',
    goalsByOpportunityType: {
      MQL: [
        { key: 'mql_identity', name: 'Identifiable subject with email', predicate: 'hasIdentity', params: { field: 'email' } }
      ],
      SQL: [
        { key: 'sql_offering', name: 'Known offering interest', predicate: 'hasOfferingInterest', params: { minProducts: 1 } },
        { key: 'sql_meeting', name: 'Completed positive meeting', predicate: 'activityExists', params: { activityType: 'MEETING', outcome: 'COMPLETED' } }
      ],
      FTP: [
        { key: 'ftp_transaction', name: 'First completed transaction', predicate: 'transactionComplete', params: { minAmount: 1 } }
      ],
      RTP: [
        { key: 'rtp_subsequent', name: 'Subsequent transaction after boundary', predicate: 'transactionComplete', params: { minAmount: 1 } }
      ]
    },
    featureFlags: { automationSuppressed: false }
  },
  'org_consumer_brand:b2c': {
    organizationKey: 'org_consumer_brand',
    configVersion: '1.0.0',
    relationshipType: 'b2c',
    goalsByOpportunityType: {
      MQL: [
        { key: 'mql_b2c_identity', name: 'Identifiable consumer email', predicate: 'hasIdentity', params: { field: 'email' } }
      ],
      SQL: [
        { key: 'sql_b2c_interest', name: 'Consumer product interest', predicate: 'hasOfferingInterest', params: { minProducts: 1 } }
      ],
      FTP: [
        { key: 'ftp_b2c_order', name: 'First consumer purchase', predicate: 'transactionComplete', params: { minAmount: 1 } }
      ],
      RTP: [
        { key: 'rtp_b2c_repeat', name: 'Repeat consumer purchase', predicate: 'transactionComplete', params: { minAmount: 1 } }
      ]
    },
    featureFlags: { automationSuppressed: false }
  }
};

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

    if (EMBEDDED_INSTALLATIONS[strPortalId]) {
      return EMBEDDED_INSTALLATIONS[strPortalId];
    }

    try {
      if (typeof fs !== 'undefined' && fs.existsSync && fs.existsSync(this.installationsPath)) {
        const raw = fs.readFileSync(this.installationsPath, 'utf-8');
        const parsed = yaml.parse(raw);
        const mapping = parsed?.installations?.[strPortalId];
        if (mapping) {
          return {
            organizationKey: mapping.organizationKey,
            defaultRelationshipType: mapping.defaultRelationshipType || 'b2b'
          };
        }
      }
    } catch (err) {
      // Memory fallback
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
    if (!orgKey) orgKey = relType === 'b2c' ? 'org_consumer_brand' : 'org_global_corp';

    const embeddedKey = `${orgKey}:${relType}`;
    if (EMBEDDED_CONFIGS[embeddedKey]) {
      return EMBEDDED_CONFIGS[embeddedKey];
    }

    let candidateFilename = `${relType}.yaml`;
    if (orgKey && orgKey !== 'org_global_corp' && orgKey !== 'org_consumer_brand') {
      candidateFilename = `${orgKey}-${relType}.yaml`;
    }

    try {
      if (typeof fs !== 'undefined' && fs.existsSync) {
        let filePath = path.join(this.configDir, candidateFilename);
        if (!fs.existsSync(filePath)) {
          if (relType === 'b2b') filePath = path.join(this.configDir, 'example-b2b.yaml');
          else if (relType === 'b2c') filePath = path.join(this.configDir, 'example-b2c.yaml');
        }

        if (fs.existsSync(filePath)) {
          const raw = fs.readFileSync(filePath, 'utf-8');
          const parsed = yaml.parse(raw);
          const config: QualificationConfig = {
            organizationKey: parsed.organizationKey || orgKey,
            configVersion: parsed.configVersion || '1.0.0',
            relationshipType: parsed.relationshipType || relType,
            goalsByOpportunityType: parsed.goalsByOpportunityType || { MQL: [], SQL: [], FTP: [], RTP: [] },
            featureFlags: parsed.featureFlags || {}
          };
          const valRes = validateCommercialModel(config);
          if (valRes.valid) return config;
        }
      }
    } catch (err) {
      // Memory fallback
    }

    throw new Error(`UNSUPPORTED_RELATIONSHIP_TYPE: Qualification configuration for relationship type '${relType}' was not found`);
  }
}
