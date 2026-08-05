import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { HubspotAdapter } from '../hubspot-adapter';
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

  public async inspect(hsAdapter?: HubspotAdapter): Promise<any> {
    if (!hsAdapter) {
      logger.warn('SchemaTool.inspect running without authenticated client; returning empty state.');
      return { propertyGroups: [], properties: {}, associationLabels: [], pipelines: [] };
    }

    try {
      const rawClient = hsAdapter.getRawClient();
      const companiesProps = await rawClient.crm.properties.coreApi.getAll('companies');
      const dealsProps = await rawClient.crm.properties.coreApi.getAll('deals');
      const contactsProps = await rawClient.crm.properties.coreApi.getAll('contacts');
      const pipelines = await rawClient.crm.pipelines.pipelinesApi.getAll('deals');

      return {
        properties: {
          companies: companiesProps.results || [],
          deals: dealsProps.results || [],
          contacts: contactsProps.results || []
        },
        associationLabels: [],
        pipelines: pipelines.results || []
      };
    } catch (err: any) {
      logger.error('SchemaTool.inspect failed to query CRM API', err);
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

      for (const pipe of (manifest.pipelines?.deals || [])) {
        const existingPipes = currentAccountSchema.pipelines || [];
        if (!existingPipes.some((e: any) => e.id === pipe.pipelineId || e.label === pipe.name)) {
          pipelinesToCreate.push(pipe);
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

  public async apply(diff: SchemaDiff, hsAdapter?: HubspotAdapter): Promise<{ applied: boolean; count: number; errors: string[] }> {
    if (!hsAdapter) {
      logger.warn('SchemaTool.apply called without authenticated HubSpot client; returning unapplied diff count.');
      return { applied: false, count: 0, errors: ['No authenticated HubSpot client provided'] };
    }

    let appliedCount = 0;
    const errors: string[] = [];
    const rawClient = hsAdapter.getRawClient();

    // 1. Create Property Groups
    for (const group of diff.propertyGroupsToCreate) {
      for (const objType of group.objectTypes || ['deals', 'companies']) {
        try {
          await rawClient.crm.properties.groupsApi.create(objType, {
            name: group.name,
            label: group.label,
            displayOrder: 1
          });
          appliedCount++;
        } catch (err: any) {
          if (err.statusCode !== 409 && err.code !== 409) {
            errors.push(`Failed to create property group ${group.name} on ${objType}: ${err.message}`);
          }
        }
      }
    }

    // 2. Create Properties
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
        if (err.statusCode !== 409 && err.code !== 409) {
          errors.push(`Failed to create property ${prop.name} on ${prop.objectType}: ${err.message}`);
        }
      }
    }

    const applied = errors.length === 0;
    return { applied, count: appliedCount, errors };
  }

  public async readback(hsAdapter?: HubspotAdapter): Promise<{ verified: boolean; diffAfterApply: SchemaDiff }> {
    const inspected = await this.inspect(hsAdapter);
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
  const hsAdapter = token ? new HubspotAdapter(token) : undefined;

  if (mode === 'inspect') {
    tool.inspect(hsAdapter).then(res => {
      console.log('Schema Inspection Result:', JSON.stringify(res, null, 2));
    }).catch(err => {
      console.error('Inspection failed:', err);
      process.exit(1);
    });
  } else if (mode === 'plan') {
    if (hsAdapter) {
      tool.inspect(hsAdapter).then(inspected => {
        const diff = tool.plan(inspected);
        console.log('Schema Plan Diff against Account:', JSON.stringify(diff, null, 2));
      });
    } else {
      const diff = tool.plan();
      console.log('Schema Plan Diff (Static Manifest):', JSON.stringify(diff, null, 2));
    }
  } else if (mode === 'apply') {
    const diff = tool.plan();
    tool.apply(diff, hsAdapter).then(result => {
      console.log('Schema Apply Result:', JSON.stringify(result, null, 2));
      if (!result.applied && result.errors.length > 0) {
        process.exit(1);
      }
    });
  } else if (mode === 'readback') {
    tool.readback(hsAdapter).then(result => {
      console.log('Schema Readback Result:', JSON.stringify(result, null, 2));
      if (!result.verified) {
        process.exit(1);
      }
    });
  } else {
    console.log(`Unknown mode: ${mode}`);
  }
}
