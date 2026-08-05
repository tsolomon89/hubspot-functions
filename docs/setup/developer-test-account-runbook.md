# Developer Account Runbook

## Environment & Account Credentials
- **Portal ID:** `149041124` (Developer Account)
- **App Name:** `Commercial Operations Automation`
- **CLI Configuration:** Managed via `hs auth` and `HUBSPOT_DEVELOPMENT_PERSONAL_ACCESS_KEY`.

---

## Deployment & Verification Commands
```bash
# 1. Validate Project Manifest & Assets
hs project validate

# 2. Upload Project Build to Developer Portal
hs project upload

# 3. Provision Schema Properties & Pipelines
npx ts-node packages/domain/schema-cli.ts apply
```
