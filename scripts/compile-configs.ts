import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

function compileConfigs() {
  const rootDir = path.join(__dirname, '../');
  const configDir = path.join(rootDir, 'config/organizations');
  const installationsPath = path.join(rootDir, 'config/portal-installations.yaml');

  // Load installations
  let installations: Record<string, any> = {};
  if (fs.existsSync(installationsPath)) {
    const raw = fs.readFileSync(installationsPath, 'utf-8');
    const parsed = yaml.parse(raw);
    installations = parsed?.installations || {};
  }

  // Load organization configs
  const configs: Record<string, any> = {};
  if (fs.existsSync(configDir)) {
    const files = fs.readdirSync(configDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
    for (const file of files) {
      const raw = fs.readFileSync(path.join(configDir, file), 'utf-8');
      const parsed = yaml.parse(raw);
      if (parsed && parsed.organizationKey && parsed.relationshipType) {
        const key = `${parsed.organizationKey}:${parsed.relationshipType}`;
        configs[key] = parsed;
      }
    }
  }

  console.log('Compiled configurations:', {
    installations: Object.keys(installations),
    configs: Object.keys(configs)
  });

  return { installations, configs };
}

if (require.main === module) {
  compileConfigs();
}
