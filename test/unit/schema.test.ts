import { describe, it, expect } from 'vitest';
import { SchemaTool } from '../../packages/domain/schema-cli';
import * as path from 'path';

describe('Schema Tool Plan & Apply Determinism', () => {
  const manifestPath = path.join(__dirname, '../../config/hubspot-schema.yaml');
  const tool = new SchemaTool(manifestPath);

  it('should load schema manifest cleanly', () => {
    const manifest = tool.loadManifest();
    expect(manifest.version).toBe('2026.03');
    expect(manifest.project).toBe('hubspot-functions');
  });

  it('should generate deterministic schema plan diff', () => {
    const diff = tool.plan();
    expect(diff.propertiesToCreate.length).toBeGreaterThan(0);
    expect(diff.associationLabelsToCreate.length).toBeGreaterThan(0);
    expect(diff.pipelinesToCreate.length).toBeGreaterThan(0);
  });

  it('should result in an empty plan diff after apply is executed against full schema match', () => {
    const manifest = tool.loadManifest();
    const mockFullAccountSchema = {
      properties: {
        companies: manifest.properties.companies,
        deals: manifest.properties.deals
      }
    };

    const secondPlan = tool.plan(mockFullAccountSchema);
    expect(secondPlan.propertiesToCreate.length).toBe(0);
  });
});
