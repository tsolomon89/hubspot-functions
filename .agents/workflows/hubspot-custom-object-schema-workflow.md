# Workflow: Creating & Validating Custom Object Schemas

This workflow specifies how to define, deploy, and verify HubSpot Custom Object schemas and record associations.

---

## Step-by-Step Execution Plan

### Step 1: Draft Custom Object Schema JSON
Define the custom object entity requirements in a schema JSON file (e.g., `schema.json`):
```json
{
  "name": "custom_project",
  "labels": { "singular": "Project", "plural": "Projects" },
  "requiredProperties": ["project_name", "status"],
  "searchableProperties": ["project_name"],
  "primaryDisplayProperty": "project_name",
  "properties": [
    { "name": "project_name", "label": "Project Name", "type": "string", "fieldType": "text" },
    { "name": "status", "label": "Status", "type": "enumeration", "fieldType": "select", "options": [
      { "label": "Planning", "value": "planning" },
      { "label": "Active", "value": "active" },
      { "label": "Completed", "value": "completed" }
    ]}
  ],
  "associatedObjects": ["COMPANY", "CONTACT"]
}
```

### Step 2: Provision Schema via API Script
Execute a Node.js script using `@hubspot/api-client`:
```javascript
const hubspot = require('@hubspot/api-client');
const schemaData = require('./schema.json');

async function deploySchema() {
  const client = new hubspot.Client({ accessToken: process.env.PRIVATE_APP_TOKEN });
  const result = await client.crm.schemas.coreApi.create(schemaData);
  console.log('Successfully created Custom Object Schema:', result.fullyQualifiedName);
}
deploySchema();
```

### Step 3: Define Custom Association Labels (Optional)
If custom relationship types are required (e.g. "Primary Vendor", "Sponsor"), provision v4 association labels:
```javascript
await client.crm.associations.v4.schema.labelsApi.create(
  'custom_project',
  'company',
  { label: 'Primary Vendor', name: 'primary_vendor' }
);
```

### Step 4: Validate Record Creation & Search
1. Create a test custom object record via API or CRM UI.
2. Execute a search API query using `client.crm.objects.searchApi.doSearch` to verify indexed fields.
3. Verify record associations appear on connected Company/Contact pages.
