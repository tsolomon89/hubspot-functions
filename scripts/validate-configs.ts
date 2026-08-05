import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

export function validateConfigurations(): { valid: boolean; errors: string[] } {
  const rootDir = path.join(__dirname, '../');
  const schemaPath = path.join(rootDir, 'config/schema/commercial-model.schema.json');
  const configDir = path.join(rootDir, 'config/organizations');
  const installationsPath = path.join(rootDir, 'config/portal-installations.yaml');

  const errors: string[] = [];

  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);

  if (!fs.existsSync(schemaPath)) {
    return { valid: false, errors: [`Schema file not found at ${schemaPath}`] };
  }

  const schemaContent = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
  const validateSchema = ajv.compile(schemaContent);

  // 1. Validate installations file
  if (fs.existsSync(installationsPath)) {
    try {
      const rawInst = fs.readFileSync(installationsPath, 'utf-8');
      const parsedInst = yaml.parse(rawInst);
      if (!parsedInst || typeof parsedInst !== 'object' || !parsedInst.installations) {
        errors.push(`[portal-installations.yaml] Missing top-level 'installations' object`);
      } else {
        for (const [portalId, inst] of Object.entries<any>(parsedInst.installations)) {
          if (!inst.organizationKey) {
            errors.push(`[portal-installations.yaml] Portal ${portalId} missing organizationKey`);
          }
          if (!inst.accountRole) {
            errors.push(`[portal-installations.yaml] Portal ${portalId} missing accountRole`);
          }
          if (!inst.allowedRelationshipTypes || !Array.isArray(inst.allowedRelationshipTypes)) {
            errors.push(`[portal-installations.yaml] Portal ${portalId} missing allowedRelationshipTypes array`);
          }
        }
      }
    } catch (e: any) {
      errors.push(`[portal-installations.yaml] Failed to parse YAML: ${e.message}`);
    }
  } else {
    errors.push(`[portal-installations.yaml] File does not exist at ${installationsPath}`);
  }

  // 2. Validate organization configs
  const seenKeys = new Set<string>();

  if (fs.existsSync(configDir)) {
    const files = fs.readdirSync(configDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
    if (files.length === 0) {
      errors.push(`[config/organizations] No configuration YAML files found`);
    }

    for (const file of files) {
      const filePath = path.join(configDir, file);
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = yaml.parse(raw);

        if (!parsed || typeof parsed !== 'object') {
          errors.push(`[${file}] Invalid YAML content or empty document`);
          continue;
        }

        const valid = validateSchema(parsed);
        if (!valid && validateSchema.errors) {
          for (const err of validateSchema.errors) {
            errors.push(`[${file}] ${err.instancePath || '/'} ${err.message}`);
          }
        }

        if (parsed.organizationKey && parsed.relationshipType) {
          const comboKey = `${parsed.organizationKey}:${parsed.relationshipType}`;
          if (seenKeys.has(comboKey)) {
            errors.push(`[${file}] Duplicate organizationKey:relationshipType pair detected: ${comboKey}`);
          }
          seenKeys.add(comboKey);
        }
      } catch (e: any) {
        errors.push(`[${file}] YAML syntax error: ${e.message}`);
      }
    }
  } else {
    errors.push(`[config/organizations] Directory does not exist at ${configDir}`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

if (require.main === module) {
  const result = validateConfigurations();
  if (!result.valid) {
    console.error('❌ Configuration validation failed:');
    result.errors.forEach(err => console.error(`  - ${err}`));
    process.exit(1);
  } else {
    console.log('✅ Configuration validation passed cleanly.');
  }
}
