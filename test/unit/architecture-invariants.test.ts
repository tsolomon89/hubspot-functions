import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Architecture Invariants & 2026.03 Component Packaging Assertions', () => {
  const rootDir = path.join(__dirname, '../../');

  it('should verify pg and fastify dependencies are absent from package.json', () => {
    const pkgRaw = fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8');
    const pkg = JSON.parse(pkgRaw);
    
    expect(pkg.dependencies?.pg).toBeUndefined();
    expect(pkg.dependencies?.fastify).toBeUndefined();
    expect(pkg.devDependencies?.['@types/pg']).toBeUndefined();
  });

  it('should verify db/ directory and migrations are deleted', () => {
    const dbDirExists = fs.existsSync(path.join(rootDir, 'db'));
    expect(dbDirExists).toBe(false);
  });

  it('should verify services/worker/ queue polling worker directory is deleted', () => {
    const workerDirExists = fs.existsSync(path.join(rootDir, 'services/worker'));
    expect(workerDirExists).toBe(false);
  });

  it('should verify services/api/ external API server directory is deleted', () => {
    const apiDirExists = fs.existsSync(path.join(rootDir, 'services/api'));
    expect(apiDirExists).toBe(false);
  });

  it('should verify src/app/functions/ official 2026.03 app function component directory exists and is packaged', () => {
    const functionsDir = path.join(rootDir, 'src/app/functions');
    expect(fs.existsSync(functionsDir)).toBe(true);
    expect(fs.existsSync(path.join(functionsDir, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(functionsDir, 'reconcile-record-hsmeta.json'))).toBe(true);
    expect(fs.existsSync(path.join(functionsDir, 'reconcile-record.js'))).toBe(true);

    const meta = JSON.parse(fs.readFileSync(path.join(functionsDir, 'reconcile-record-hsmeta.json'), 'utf-8'));
    expect(meta.type).toBe('app-function');
    expect(meta.uid).toBe('reconcile_record_function');
  });

  it('should verify src/app/workflow-actions/ official 2026.03 custom workflow action component directory exists and is packaged', () => {
    const actionsDir = path.join(rootDir, 'src/app/workflow-actions');
    expect(fs.existsSync(actionsDir)).toBe(true);
    expect(fs.existsSync(path.join(actionsDir, 'reconcile-record-action-hsmeta.json'))).toBe(true);

    const actionMeta = JSON.parse(fs.readFileSync(path.join(actionsDir, 'reconcile-record-action-hsmeta.json'), 'utf-8'));
    expect(actionMeta.type).toBe('workflow-action');
    expect(actionMeta.uid).toBe('reconcile_record_workflow_action');
    expect(actionMeta.config.actionUrl).toBeDefined();
    expect(actionMeta.config.isPublished).toBe(true);
    expect(actionMeta.config.supportedClients).toContain('WORKFLOWS');
    expect(actionMeta.config.labels).toBeDefined();
    expect(actionMeta.config.objectTypes).toEqual(['CONTACT', 'COMPANY', 'LEAD', 'DEAL']);
    expect(actionMeta.config.inputFields).toHaveLength(2);
    expect(actionMeta.config.outputFields).toHaveLength(7);
  });

  it('should verify no vercel.app URLs exist in project files', () => {
    const filesToScan = [
      'package.json',
      'src/app/app-hsmeta.json',
      'docs/architecture/hubspot-foundation.md'
    ];

    for (const relPath of filesToScan) {
      const fullPath = path.join(rootDir, relPath);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        expect(content).not.toContain('vercel.app');
      }
    }
  });

  it('should verify single-file deployable CommonJS JavaScript artifact in dist/hubspot-custom-code/reconcile-record.js', () => {
    const artifactPath = path.join(rootDir, 'dist/hubspot-custom-code/reconcile-record.js');
    expect(fs.existsSync(artifactPath)).toBe(true);

    const code = fs.readFileSync(artifactPath, 'utf-8');
    expect(code).toContain('main');
    expect(code).toContain('require("@hubspot/api-client")');
    expect(code).not.toContain('import {');
    expect(code).not.toContain('export async function');
    expect(code).not.toContain('require("./');
    expect(code).not.toContain('require("../');
  });
});
