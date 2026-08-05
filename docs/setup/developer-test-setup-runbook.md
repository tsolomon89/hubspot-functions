# Runbook: Developer-Test Account & Token Secret Setup

This runbook documents the configuration and token installation procedures for running the HubSpot-Native Universal Commercial Kernel in developer test portal `149041124`.

---

## 1. Portal Identity & Role Verification

- **Portal ID**: `149041124`
- **Portal Name**: `Commercial_Operations_Automation`
- **Account Role**: `developer-test`
- **Config File**: `config/portal-installations.yaml`

```yaml
version: "1.0.0"
installations:
  "149041124":
    executionPortalId: 149041124
    accountRole: "developer-test"
    organizationKey: "org_global_corp"
    allowedRelationshipTypes:
      - "b2b"
      - "b2c"
    defaultRelationshipType: "b2b"
    expectedConfigVersion: "1.0.0"
```

The system automatically enforces `NON_DEVELOPER_TEST_PORTAL_MUTATION_GUARD` on all schema application and mutation commands.

---

## 2. Private App Access Token Installation

1. In HubSpot Developer Portal `149041124`, navigate to **Settings > Integrations > Private Apps**.
2. Create or open the Private App `Commercial Operations Automation`.
3. Ensure the required scopes listed in `src/app/app-hsmeta.json` are granted:
   - `crm.objects.contacts.read`, `crm.objects.contacts.write`
   - `crm.objects.companies.read`, `crm.objects.companies.write`
   - `crm.objects.deals.read`, `crm.objects.deals.write`
   - `crm.objects.leads.read`, `crm.objects.leads.write`
   - `crm.objects.line_items.read`, `crm.objects.line_items.write`
   - `crm.schemas.custom.read`, `crm.schemas.deals.read`, `crm.schemas.companies.read`, `crm.schemas.contacts.read`
   - `automation`
4. Copy the Private App Access Token.
5. In **Automation > Workflows**, open each Custom Code Action and add the secret:
   - Secret Name: `PRIVATE_APP_ACCESS_TOKEN`
   - Secret Value: `<paste Private App Access Token>`
6. Set local environment variable for authenticated CLI scripts:
   ```powershell
   $env:PRIVATE_APP_ACCESS_TOKEN="<your_token>"
   ```

---

## 3. Project Scaffolding & Validation

Run local project validation:
```powershell
npx hs project validate
```
Expected output:
`[SUCCESS] Project hubspot-functions is valid and ready to upload`
