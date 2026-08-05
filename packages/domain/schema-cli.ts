import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { HubspotClientWrapper } from '../hubspot-client';
import { logger } from '../observability';

export interface SchemaDiff {
  propertyGroupsToCreate: any[];
  propertiesToCreate: any[];
  associationLabelsToCreate: any[];
  pipelinesToCreate: any[];
}

export class SchemaTool {
  private manifestPath: string;

  constructor(manifestPath?: string) {
    this.manifestPath = manifestPath || path.join(__dirname, '../../config/hubspot-schema.yaml');
  }

  public loadManifest(): any {
    const raw = fs.readFileSync(this.manifestPath, 'utf-8');
    return yaml.parse(raw);
  }

  public async inspect(hsClient?: HubspotClientWrapper): Promise<any> {
    if (!hsClient) {
      logger.warn('SchemaTool.inspect running without authenticated client; returning empty state.');
      return { properties: {}, associationLabels: [], pipelines: [] };
    }

    try {
      const rawClient = hsClient.getRawClient();
      const companiesProps = await rawClient.crm.properties.coreApi.getAll('companies');
      const dealsProps = await rawClient.crm.properties.coreApi.getAll('deals');
      const contactsProps = await rawClient.crm.properties.coreApi.getAll('contacts');

      return {
        properties: {
          companies: companiesProps.results || [],
          deals: dealsProps.results || [],
          contacts: contactsProps.results || []
        },
        associationLabels: [],
        pipelines: []
      };
    } catch (err: any) {
      logger.error('SchemaTool.inspect failed to query CRM Properties API', err);
      throw err;
    }
  }

  public plan(currentAccountSchema?: any): SchemaDiff {
    const manifest = this.loadManifest();
    
    const propertyGroupsToCreate: any[] = [];
    const propertiesToCreate: any[] = [];
    const associationLabelsToCreate: any[] = [];
    const pipelinesToCreate: any[] = [];

    if (!currentAccountSchema || !currentAccountSchema.properties || Object.keys(currentAccountSchema.properties).length === 0) {
      for (const group of (manifest.propertyGroups || [])) {
        propertyGroupsToCreate.push(group);
      }
      for (const [objType, props] of Object.entries(manifest.properties || {})) {
        for (const p of (props as any[])) {
          propertiesToCreate.push({ objectType: objType, ...p });
        }
      }
      for (const label of (manifest.associationLabels || [])) {
        associationLabelsToCreate.push(label);
      }
      for (const pipe of (manifest.pipelines?.deals || [])) {
        pipelinesToCreate.push(pipe);
      }
    } else {
      for (const [objType, props] of Object.entries(manifest.properties || {})) {
        const existingProps = currentAccountSchema.properties[objType] || [];
        for (const p of (props as any[])) {
          if (!existingProps.some((e: any) => e.name === p.name)) {
            propertiesToCreate.push({ objectType: objType, ...p });
          }
        }
      }
    }

    return {
      propertyGroupsToCreate,
      propertiesToCreate,
      associationLabelsToCreate,
      pipelinesToCreate
    };
  }

  public async apply(diff: SchemaDiff, hsClient?: HubspotClientWrapper): Promise<{ applied: boolean; count: number }> {
    if (!hsClient) {
      logger.warn('SchemaTool.apply called without authenticated HubSpot client; returning unapplied diff count.');
      return { applied: false, count: 0 };
    }

    let appliedCount = 0;
    const rawClient = hsClient.getRawClient();

    for (const prop of diff.propertiesToCreate) {
      try {
        await rawClient.crm.properties.coreApi.create(prop.objectType, {
          name: prop.name,
          label: prop.label,
          type: prop.type,
          fieldType: prop.fieldType,
          groupName: prop.groupName,
          hasUniqueValue: prop.hasUniqueValue || false,
          options: prop.options || [],
          description: prop.description || ''
        } as any);
        appliedCount++;
      } catch (err: any) {
        logger.info(`Property ${prop.name} already exists or error occurred: ${err.message}`);
      }
    }

    return {
      applied: true,
      count: appliedCount
    };
  }

  public async readback(hsClient?: HubspotClientWrapper): Promise<{ verified: boolean; diffAfterApply: SchemaDiff }> {
    const inspected = await this.inspect(hsClient);
    const diffAfterApply = this.plan(inspected);
    const verified = diffAfterApply.propertiesToCreate.length === 0;

    return {
      verified,
      diffAfterApply
    };
  }
}

if (require.main === module) {
  const mode = process.argv[2] || 'plan';
  const tool = new SchemaTool();
  const token = process.env.HUBSPOT_DEVELOPMENT_PERSONAL_ACCESS_KEY || process.env.HUBSPOT_ACCESS_TOKEN;
  const hsClient = token ? new HubspotClientWrapper(token) : undefined;

  if (mode === 'inspect') {
    tool.inspect(hsClient).then(res => {
      console.log('Schema Inspection Result:', JSON.stringify(res, null, 2));
    }).catch(err => {
      console.error('Inspection failed:', err);
      process.exit(1);
    });
  } else if (mode === 'plan') {
    if (hsClient) {
      tool.inspect(hsClient).then(inspected => {
        const diff = tool.plan(inspected);
        console.log('Schema Plan Diff against Account:', JSON.stringify(diff, null, 2));
      });
    } else {
      const diff = tool.plan();
      console.log('Schema Plan Diff (Static Manifest):', JSON.stringify(diff, null, 2));
    }
  } else if (mode === 'apply') {
    const diff = tool.plan();
    tool.apply(diff, hsClient).then(result => {
      console.log('Schema Apply Result:', JSON.stringify(result, null, 2));
    });
  } else if (mode === 'readback') {
    tool.readback(hsClient).then(result => {
      console.log('Schema Readback Result:', JSON.stringify(result, null, 2));
    });
  } else {
    console.log(`Unknown mode: ${mode}`);
  }
}
