import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Architecture Invariants & Negative Assertions', () => {
  const rootDir = path.join(__dirname, '../../');

  it('should verify pg dependency is absent from package.json', () => {
    const pkgRaw = fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8');
    const pkg = JSON.parse(pkgRaw);
    
    expect(pkg.dependencies?.pg).toBeUndefined();
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

  it('should verify postgres integration test directory is deleted', () => {
    const pgTestDirExists = fs.existsSync(path.join(rootDir, 'test/integration/postgres'));
    expect(pgTestDirExists).toBe(false);
  });
});
