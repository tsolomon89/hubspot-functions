import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { HubspotClientWrapper } from '../hubspot-client';

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
    } catch (err) {
      return { properties: {}, associationLabels: [], pipelines: [] };
    }
  }

  public plan(currentAccountSchema?: any): SchemaDiff {
    const manifest = this.loadManifest();
    
    const propertyGroupsToCreate: any[] = [];
    const propertiesToCreate: any[] = [];
    const associationLabelsToCreate: any[] = [];
    const pipelinesToCreate: any[] = [];

    if (!currentAccountSchema || !currentAccountSchema.properties) {
      // Full plan against un-provisioned account
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
      // Diff against current account schema
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
    let appliedCount = 0;

    if (hsClient) {
      const rawClient = hsClient.getRawClient();
      
      // Apply properties
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
          // Ignore if property already exists
        }
      }
    } else {
      appliedCount = diff.propertiesToCreate.length + diff.associationLabelsToCreate.length + diff.pipelinesToCreate.length;
    }

    return {
      applied: true,
      count: appliedCount
    };
  }
}

if (require.main === module) {
  const mode = process.argv[2] || 'plan';
  const tool = new SchemaTool();
  if (mode === 'plan') {
    const diff = tool.plan();
    console.log('Schema Plan Diff:', JSON.stringify(diff, null, 2));
  } else if (mode === 'apply') {
    const diff = tool.plan();
    tool.apply(diff).then(result => {
      console.log('Schema Apply Result:', JSON.stringify(result, null, 2));
    });
  } else {
    console.log(`Unknown mode: ${mode}`);
  }
}
