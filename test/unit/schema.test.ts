import { describe, it, expect } from 'vitest';
import { SchemaTool } from '../../packages/domain/schema-cli';

describe('Schema Tool Plan & Apply Determinism', () => {
  it('should load manifest and parse valid YAML structure', () => {
    const tool = new SchemaTool();
    const manifest = tool.loadManifest();
    expect(manifest.version).toBe('2026.03');
    expect(manifest.project).toBe('hubspot-functions');
    expect(manifest.properties).toBeDefined();
    expect(manifest.properties.deals).toBeDefined();
  });

  it('should generate deterministic schema plan diff for coa_ properties', () => {
    const tool = new SchemaTool();
    const diff = tool.plan();
    expect(diff.propertiesToCreate.length).toBeGreaterThan(0);
    const hasOppKey = diff.propertiesToCreate.some((p: any) => p.name === 'coa_opportunity_key');
    expect(hasOppKey).toBe(true);
  });

  it('should return empty diff when inspecting fully provisioned account schema', () => {
    const tool = new SchemaTool();
    const manifest = tool.loadManifest();
    
    // Mock current account schema containing all manifest properties and pipelines
    const mockCurrentSchema = {
      properties: {
        companies: manifest.properties.companies || [],
        deals: manifest.properties.deals || [],
        leads: manifest.properties.leads || [],
        contacts: []
      },
      pipelines: (manifest.pipelines?.deals || []).map((p: any) => ({
        id: p.pipelineId,
        label: p.name
      }))
    };

    const diff = tool.plan(mockCurrentSchema);
    expect(diff.propertiesToCreate.length).toEqual(0);
    expect(diff.pipelinesToCreate.length).toEqual(0);
  });
});
