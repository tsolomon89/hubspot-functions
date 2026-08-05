---
name: hubspot-crm-custom-objects-api
description: Guide for defining Custom Objects schemas, associations, properties, Search API/COQL queries, and batch operations via @hubspot/api-client.
---

# Skill: HubSpot Custom Objects & CRM Data API

Custom Objects enable businesses to model custom schema entities (e.g. Subscriptions, Projects, Licenses, Assets) native to HubSpot CRM.

---

## 1. Defining Custom Object Schemas

Custom Object schemas are defined using the HubSpot CRM Schema API (`/crm/v3/schemas`).

### Schema Definition Template (`subscription-schema.json`)
```json
{
  "name": "subscription",
  "labels": {
    "singular": "Subscription",
    "plural": "Subscriptions"
  },
  "requiredProperties": ["subscription_name", "tier", "start_date"],
  "searchableProperties": ["subscription_name", "account_id"],
  "primaryDisplayProperty": "subscription_name",
  "secondaryDisplayProperties": ["tier", "mrr"],
  "properties": [
    {
      "name": "subscription_name",
      "label": "Subscription Name",
      "type": "string",
      "fieldType": "text"
    },
    {
      "name": "tier",
      "label": "Subscription Tier",
      "type": "enumeration",
      "fieldType": "select",
      "options": [
        { "label": "Starter", "value": "starter" },
        { "label": "Professional", "value": "professional" },
        { "label": "Enterprise", "value": "enterprise" }
      ]
    },
    {
      "name": "mrr",
      "label": "Monthly Recurring Revenue",
      "type": "number",
      "fieldType": "number"
    },
    {
      "name": "start_date",
      "label": "Start Date",
      "type": "date",
      "fieldType": "date"
    }
  ],
  "associatedObjects": ["COMPANY", "CONTACT", "DEAL"]
}
```

---

## 2. Programmatic Schema Creation (Node.js)

```javascript
const hubspot = require('@hubspot/api-client');

async function createCustomObjectSchema(schemaDefinition) {
  const hsClient = new hubspot.Client({ accessToken: process.env.PRIVATE_APP_TOKEN });

  try {
    const response = await hsClient.crm.schemas.coreApi.create(schemaDefinition);
    console.log('Custom Object Schema created successfully:', response.fullyQualifiedName);
    return response;
  } catch (error) {
    console.error('Error creating schema:', error.response ? error.response.body : error);
    throw error;
  }
}
```

---

## 3. Search API & Filtering

Use the HubSpot CRM Search API (`/crm/v3/objects/{objectType}/search`) for multi-condition filtering and sorting.

```javascript
async function searchSubscriptionsByTier(tierValue, minMrr) {
  const hsClient = new hubspot.Client({ accessToken: process.env.PRIVATE_APP_TOKEN });

  const filterGroup = {
    filters: [
      {
        propertyName: 'tier',
        operator: 'EQ',
        value: tierValue
      },
      {
        propertyName: 'mrr',
        operator: 'GTE',
        value: minMrr.toString()
      }
    ]
  };

  const searchObject = {
    filterGroups: [filterGroup],
    sorts: [{ propertyName: 'mrr', direction: 'DESCENDING' }],
    properties: ['subscription_name', 'tier', 'mrr', 'start_date'],
    limit: 50
  };

  const searchResult = await hsClient.crm.objects.searchApi.doSearch('subscription', searchObject);
  return searchResult.results;
}
```

---

## 4. Record Associations API

Associations define links between standard records (Companies, Contacts, Deals) and Custom Objects.

```javascript
// Associate a Subscription Custom Object record to a Company
async function associateSubscriptionToCompany(subscriptionId, companyId) {
  const hsClient = new hubspot.Client({ accessToken: process.env.PRIVATE_APP_TOKEN });

  await hsClient.crm.associations.v4.basicApi.create(
    'subscription', // From Object Type
    subscriptionId, // From Record ID
    'company',      // To Object Type
    companyId,      // To Record ID
    [
      {
        associationCategory: 'USER_DEFINED',
        associationTypeId: 14 // Custom Association Type ID
      }
    ]
  );
}
```

---

## 5. Batch Operations API

For high-throughput updates, use batch APIs to minimize API requests and avoid rate limits.

```javascript
async function batchUpdateMRR(updatesArray) {
  // updatesArray: [{ id: '123', properties: { mrr: '500' } }, ...]
  const hsClient = new hubspot.Client({ accessToken: process.env.PRIVATE_APP_TOKEN });

  const batchInput = {
    inputs: updatesArray
  };

  const response = await hsClient.crm.objects.batchApi.update('subscription', batchInput);
  return response.results;
}
```
