import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Architecture Invariants & Component Packaging Assertions', () => {
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

  it('should verify src/app/app.functions/ app function component directory exists and is packaged', () => {
    const appFunctionsDir = path.join(rootDir, 'src/app/app.functions');
    expect(fs.existsSync(appFunctionsDir)).toBe(true);
    expect(fs.existsSync(path.join(appFunctionsDir, 'serverless.json'))).toBe(true);
    expect(fs.existsSync(path.join(appFunctionsDir, 'reconcile-record.js'))).toBe(true);
  });

  it('should verify src/app/extensions/ custom workflow action component directory exists and is packaged', () => {
    const extensionsDir = path.join(rootDir, 'src/app/extensions');
    expect(fs.existsSync(extensionsDir)).toBe(true);
    expect(fs.existsSync(path.join(extensionsDir, 'reconcile-record-action.json'))).toBe(true);
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
