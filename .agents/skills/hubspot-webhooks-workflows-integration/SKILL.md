---
name: hubspot-webhooks-workflows-integration
description: Architecting event webhooks, Custom Workflow Actions (Custom Code in Workflows), payload processing, idempotency, and retry handling.
---

# Skill: HubSpot Webhooks & Workflows Integration

This skill covers handling event subscriptions, processing real-time webhooks, and creating Custom Workflow Actions (Custom Code) inside HubSpot automation workflows.

---

## 1. Webhook Subscriptions Architecture

HubSpot apps subscribe to CRM events (e.g. `contact.creation`, `company.propertyChange`, `deal.deletion`).

### Standard Webhook Payload Structure
```json
[
  {
    "eventId": 100,
    "subscriptionId": 12345,
    "portalId": 67890,
    "appId": 54321,
    "occurredAt": 1754385200000,
    "subscriptionType": "contact.propertyChange",
    "attemptNumber": 0,
    "objectId": 998877,
    "propertyName": "email",
    "propertyValue": "user@example.com",
    "changeSource": "CRM_UI"
  }
]
```

---

## 2. Idempotency & Batch Processing Pattern

Because webhooks can be retried by HubSpot in edge network failure scenarios, your webhook listener **must** be idempotent.

```javascript
const redis = require('./redisClient'); // Example cache / key-value store

async function processWebhookEvent(event) {
  const idempotencyKey = `hs_evt_${event.eventId}_${event.occurredAt}`;

  // 1. Check if event was already processed
  const alreadyProcessed = await redis.get(idempotencyKey);
  if (alreadyProcessed) {
    console.log(`Skipping duplicate event ${event.eventId}`);
    return;
  }

  // 2. Process event logic
  switch (event.subscriptionType) {
    case 'contact.creation':
      await handleContactCreated(event.objectId);
      break;
    case 'company.propertyChange':
      await handleCompanyPropertyChange(event.objectId, event.propertyName, event.propertyValue);
      break;
    default:
      console.log(`Unhandled subscription type: ${event.subscriptionType}`);
  }

  // 3. Store idempotency key with TTL (e.g., 24 hours)
  await redis.set(idempotencyKey, 'PROCESSED', 'EX', 86400);
}
```

---

## 3. Custom Workflow Actions (Custom Code in Workflows)

HubSpot Operations Hub allows running Node.js custom code blocks inside CRM workflows.

### Workflow Custom Code Input & Callback Signature
```javascript
const hubspot = require('@hubspot/api-client');

exports.main = async (event, callback) => {
  // 1. Extract inputs defined in the Workflow Action configuration
  const contactId = event.object.objectId;
  const companyName = event.inputFields['companyName'];

  const hsClient = new hubspot.Client({
    accessToken: process.env.SECRET_WORKFLOW_TOKEN
  });

  try {
    // 2. Fetch or update CRM data
    const companySearch = await hsClient.crm.companies.searchApi.doSearch({
      filterGroups: [{
        filters: [{ propertyName: 'name', operator: 'EQ', value: companyName }]
      }]
    });

    let matchStatus = 'NO_MATCH';
    if (companySearch.results.length > 0) {
      matchStatus = 'MATCHED';
      const matchedCompanyId = companySearch.results[0].id;

      // Associate contact to matched company
      await hsClient.crm.associations.v4.basicApi.create(
        'contact', contactId,
        'company', matchedCompanyId,
        [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 1 }]
      );
    }

    // 3. Return output fields back to the workflow engine
    callback({
      outputFields: {
        matchStatus: matchStatus,
        processedTimestamp: new Date().toISOString()
      }
    });

  } catch (err) {
    console.error('Error in workflow custom code:', err);
    // Throwing error triggers workflow retry action
    throw err;
  }
};
```

---

## 4. Security & Best Practices Checklist

1.  **Fast Ack**: Respond with HTTP `200 OK` to HubSpot webhook requests within **5 seconds**. For heavy computations, push events to a queue (e.g. SQS, Redis, BullMQ) and process asynchronously.
2.  **Signature Check**: Always validate incoming headers with `X-HubSpot-Signature-v3`.
3.  **Error States**: Custom workflow actions should return standard `outputFields` on expected edge cases rather than failing ungracefully.
