import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { HubspotAdapter } from '../hubspot-adapter';
import { logger } from '../observability';
import { OrganizationConfigResolver } from './config-resolver';

export interface SchemaDiff {
  propertyGroupsToCreate: any[];
  propertiesToCreate: any[];
  associationLabelsToCreate: any[];
  pipelinesToCreate: any[];
  pipelinesToUpdate: any[];
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
      return { 
        propertyGroups: { deals: [], companies: [], contacts: [], leads: [] }, 
        properties: {}, 
        associationLabels: [], 
        pipelines: { deals: [], leads: [] } 
      };
    }

    try {
      const rawClient = hsAdapter.getRawClient();
      const companiesProps = await rawClient.crm.properties.coreApi.getAll('companies');
      const dealsProps = await rawClient.crm.properties.coreApi.getAll('deals');
      const contactsProps = await rawClient.crm.properties.coreApi.getAll('contacts');
      
      let leadsProps: any = { results: [] };
      try {
        leadsProps = await rawClient.crm.properties.coreApi.getAll('leads');
      } catch (e: any) {
        if (e?.statusCode !== 404 && e?.status !== 404) throw e;
      }

      let dealPipelines: any = { results: [] };
      try {
        dealPipelines = await rawClient.crm.pipelines.pipelinesApi.getAll('deals');
      } catch (e: any) {
        if (e?.statusCode !== 404 && e?.status !== 404) throw e;
      }

      let leadPipelines: any = { results: [] };
      try {
        leadPipelines = await rawClient.crm.pipelines.pipelinesApi.getAll('leads');
      } catch (e: any) {
        if (e?.statusCode !== 404 && e?.status !== 404) throw e;
      }

      const propertyGroups: Record<string, any[]> = {};
      for (const objType of ['deals', 'companies', 'contacts', 'leads']) {
        try {
          const res = await rawClient.crm.properties.groupsApi.getAll(objType);
          propertyGroups[objType] = res.results || [];
        } catch (e: any) {
          propertyGroups[objType] = [];
        }
      }

      return {
        propertyGroups,
        properties: {
          companies: companiesProps.results || [],
          deals: dealsProps.results || [],
          contacts: contactsProps.results || [],
          leads: leadsProps.results || []
        },
        associationLabels: [],
        pipelines: {
          deals: dealPipelines.results || [],
          leads: leadPipelines.results || []
        }
      };
    } catch (err: any) {
      logger.error('SchemaTool.inspect failed to query CRM API', err);
      throw new Error(`SCHEMA_INSPECTION_FAILED: Failed to inspect CRM schema from HubSpot: ${err.message}`);
    }
  }

  public plan(currentAccountSchema?: any): SchemaDiff {
    const manifest = this.loadManifest();
    
    const propertyGroupsToCreate: any[] = [];
    const propertiesToCreate: any[] = [];
    const associationLabelsToCreate: any[] = [];
    const pipelinesToCreate: any[] = [];
    const pipelinesToUpdate: any[] = [];

    if (!currentAccountSchema) {
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
      for (const [objType, pipes] of Object.entries(manifest.pipelines || {})) {
        for (const pipe of (pipes as any[])) {
          pipelinesToCreate.push({ objectType: objType, ...pipe });
        }
      }
      return {
        propertyGroupsToCreate,
        propertiesToCreate,
        associationLabelsToCreate,
        pipelinesToCreate,
        pipelinesToUpdate
      };
    }

    // Independent category comparison - NO shortcut assumptions!
    
    // 1. Compare property groups per object type
    for (const group of (manifest.propertyGroups || [])) {
      for (const objType of group.objectTypes || ['deals', 'companies', 'leads', 'contacts']) {
        const existingGroups = currentAccountSchema.propertyGroups?.[objType] || [];
        const exists = existingGroups.some((g: any) => g.name === group.name);
        if (!exists) {
          propertyGroupsToCreate.push({ ...group, targetObjectType: objType });
        }
      }
    }

    // 2. Compare properties per object type
    for (const [objType, props] of Object.entries(manifest.properties || {})) {
      const existingProps = currentAccountSchema.properties?.[objType] || [];
      for (const p of (props as any[])) {
        const existing = existingProps.find((e: any) => e.name === p.name);
        if (!existing) {
          propertiesToCreate.push({ objectType: objType, ...p });
        } else if (existing.type !== p.type) {
          throw new Error(`SCHEMA_CONFLICT: Property '${p.name}' on '${objType}' exists with type '${existing.type}', expected '${p.type}'`);
        }
      }
    }

    // 3. Compare pipelines and stages
    for (const [objType, pipes] of Object.entries(manifest.pipelines || {})) {
      const existingPipes = currentAccountSchema.pipelines?.[objType] || [];
      for (const pipe of (pipes as any[])) {
        const existing = existingPipes.find((e: any) => e.id === pipe.pipelineId || e.label === pipe.name);
        if (!existing) {
          pipelinesToCreate.push({ objectType: objType, ...pipe });
        } else {
          const existingStages = existing.stages || [];
          const manifestStages = pipe.stages || [];
          
          let stageDiff = false;
          for (const mStage of manifestStages) {
            const eStage = existingStages.find((s: any) => (s.id || s.stageId) === mStage.stageId);
            if (!eStage) {
              stageDiff = true;
              break;
            }
            if (mStage.displayOrder !== undefined && eStage.displayOrder !== undefined && Number(mStage.displayOrder) !== Number(eStage.displayOrder)) {
              stageDiff = true;
              break;
            }
            if (mStage.metadata?.probability !== undefined && eStage.metadata?.probability !== undefined && String(mStage.metadata.probability) !== String(eStage.metadata.probability)) {
              stageDiff = true;
              break;
            }
          }

          if (stageDiff) {
            pipelinesToUpdate.push({ objectType: objType, existingPipelineId: existing.id || pipe.pipelineId, ...pipe });
          }
        }
      }
    }

    return {
      propertyGroupsToCreate,
      propertiesToCreate,
      associationLabelsToCreate,
      pipelinesToCreate,
      pipelinesToUpdate
    };
  }

  public async apply(
    diff: SchemaDiff, 
    hsAdapter?: HubspotAdapter,
    portalId?: number | string
  ): Promise<{ applied: boolean; count: number; errors: string[] }> {
    if (!hsAdapter) {
      logger.warn('SchemaTool.apply called without authenticated HubSpot client; returning unapplied diff count.');
      return { applied: false, count: 0, errors: ['No authenticated HubSpot client provided'] };
    }

    // Enforce account role guard if portalId provided
    if (portalId) {
      const resolver = new OrganizationConfigResolver();
      const inst = resolver.resolvePortalInstallation(portalId);
      if (!inst) {
        throw new Error(`UNSUPPORTED_PORTAL: Portal '${portalId}' is not registered`);
      }
      if (inst.accountRole !== 'developer-test') {
        throw new Error(`NON_DEVELOPER_TEST_PORTAL_MUTATION_GUARD: Portal '${portalId}' role is '${inst.accountRole}', expected 'developer-test'`);
      }
    }

    // Inspect account state first before applying diff
    const currentAccountState = await this.inspect(hsAdapter);
    const actualDiff = this.plan(currentAccountState);

    let appliedCount = 0;
    const errors: string[] = [];
    const rawClient = hsAdapter.getRawClient();

    // 1. Create Property Groups
    for (const group of actualDiff.propertyGroupsToCreate) {
      const objTypes = group.targetObjectType ? [group.targetObjectType] : (group.objectTypes || ['deals', 'companies', 'leads', 'contacts']);
      for (const objType of objTypes) {
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
    for (const prop of actualDiff.propertiesToCreate) {
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

    // 3. Create Pipelines
    for (const pipe of actualDiff.pipelinesToCreate) {
      const targetObj = pipe.objectType || 'deals';
      try {
        await rawClient.crm.pipelines.pipelinesApi.create(targetObj, {
          pipelineId: pipe.pipelineId,
          label: pipe.name,
          displayOrder: pipe.displayOrder || 1,
          stages: (pipe.stages || []).map((s: any) => ({
            stageId: s.stageId,
            label: s.label,
            displayOrder: s.displayOrder,
            metadata: s.metadata || { probability: (s.stageId === 'closedwon' ? '1.0' : '0.2') }
          }))
        } as any);
        appliedCount++;
      } catch (err: any) {
        if (err.statusCode !== 409 && err.code !== 409) {
          errors.push(`Failed to create pipeline ${pipe.name} on ${targetObj}: ${err.message}`);
        }
      }
    }

    // 4. Update Existing Pipelines
    for (const pipe of actualDiff.pipelinesToUpdate) {
      const targetObj = pipe.objectType || 'deals';
      const pipelineId = pipe.existingPipelineId || pipe.pipelineId;
      try {
        await rawClient.crm.pipelines.pipelinesApi.update(targetObj, pipelineId, {
          label: pipe.name,
          displayOrder: pipe.displayOrder || 1,
          stages: (pipe.stages || []).map((s: any) => ({
            stageId: s.stageId,
            label: s.label,
            displayOrder: s.displayOrder,
            metadata: s.metadata || { probability: (s.stageId === 'closedwon' ? '1.0' : '0.2') }
          }))
        } as any);
        appliedCount++;
      } catch (err: any) {
        errors.push(`Failed to update pipeline ${pipe.name} (${pipelineId}) on ${targetObj}: ${err.message}`);
      }
    }

    const applied = errors.length === 0;
    return { applied, count: appliedCount, errors };
  }

  public async readback(hsAdapter?: HubspotAdapter): Promise<{ verified: boolean; diffAfterApply: SchemaDiff }> {
    const inspected = await this.inspect(hsAdapter);
    const diffAfterApply = this.plan(inspected);
    const verified = diffAfterApply.propertyGroupsToCreate.length === 0 &&
                     diffAfterApply.propertiesToCreate.length === 0 && 
                     diffAfterApply.pipelinesToCreate.length === 0 &&
                     diffAfterApply.pipelinesToUpdate.length === 0;

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
    tool.apply(diff, hsAdapter, 149041124).then(result => {
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
