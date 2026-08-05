import { describe, it, expect } from 'vitest';
import { SchemaTool } from '../../packages/domain/schema-cli';

describe('Schema Tool Plan & Apply Determinism', () => {
  it('should plan property and pipeline creation from hubspot-schema.yaml manifest', () => {
    const tool = new SchemaTool();
    const manifest = tool.loadManifest();

    expect(manifest.version).toBe('2026.03');
    expect(manifest.project).toBe('hubspot-functions');

    const diff = tool.plan();
    expect(diff.propertyGroupsToCreate.length).toBeGreaterThan(0);
    expect(diff.propertiesToCreate.length).toBeGreaterThan(0);
    expect(diff.pipelinesToCreate.length).toBeGreaterThan(0);
  });

  it('should return empty diff when inspecting fully provisioned account schema', () => {
    const tool = new SchemaTool();
    const manifest = tool.loadManifest();

    const mockCurrentSchema = {
      properties: {
        contacts: manifest.properties.contacts,
        companies: manifest.properties.companies,
        leads: manifest.properties.leads,
        deals: manifest.properties.deals
      },
      pipelines: {
        leads: (manifest.pipelines.leads || []).map((p: any) => ({
          id: p.pipelineId,
          label: p.name,
          stages: p.stages.map((s: any) => ({ id: s.stageId, label: s.label }))
        })),
        deals: (manifest.pipelines.deals || []).map((p: any) => ({
          id: p.pipelineId,
          label: p.name,
          stages: p.stages.map((s: any) => ({ id: s.stageId, label: s.label }))
        }))
      }
    };

    const diff = tool.plan(mockCurrentSchema);
    expect(diff.propertiesToCreate.length).toEqual(0);
    expect(diff.pipelinesToCreate.length).toEqual(0);
  });
});
