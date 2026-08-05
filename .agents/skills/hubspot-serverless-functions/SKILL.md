---
name: hubspot-serverless-functions
description: Patterns and instructions for developing Node.js serverless functions in HubSpot Projects, @hubspot/api-client integration, authentication, X-HubSpot-Signature-v3 verification, rate limiting, and monitoring via hs logs.
---

# Skill: HubSpot Serverless Functions

HubSpot serverless functions allow secure backend computation, third-party API integration, and CRM data transformation within HubSpot Projects.

---

## 1. Folder Structure & `serverless.json`

Serverless endpoints live in an `app.functions` directory inside your project.

### `serverless.json` Definition
```json
{
  "runtime": "nodejs20.x",
  "version": "1.0",
  "environment": {},
  "endpoints": {
    "getAccountSummary": {
      "file": "getAccountSummary.js",
      "method": "GET"
    },
    "processWebhook": {
      "file": "processWebhook.js",
      "method": "POST"
    }
  }
}
```

---

## 2. Standard Endpoint Handler Pattern

Every serverless function exports a handler function taking `context` and `sendResponse`.

```javascript
const hubspot = require('@hubspot/api-client');

exports.main = async (context = {}, sendResponse) => {
  try {
    // 1. Extract parameters & headers
    const { body, query, headers } = context;
    const portalId = context.portalId;

    // 2. Initialize HubSpot API client with context token or Private App Token secret
    const hsClient = new hubspot.Client({
      accessToken: process.env.PRIVATE_APP_TOKEN || context.secrets.PRIVATE_APP_TOKEN
    });

    // 3. Execute business logic (e.g. fetch contact details)
    const contactId = query.contactId || (body && body.contactId);
    if (!contactId) {
      return sendResponse({
        statusCode: 400,
        body: { error: 'Missing contactId parameter' }
      });
    }

    const contact = await hsClient.crm.contacts.basicApi.getById(contactId, [
      'email',
      'firstname',
      'lastname',
      'company'
    ]);

    // 4. Return success response
    return sendResponse({
      statusCode: 200,
      body: {
        success: true,
        contact: contact.properties
      }
    });

  } catch (error) {
    console.error('Error executing serverless function:', error);
    return sendResponse({
      statusCode: error.code || 500,
      body: {
        success: false,
        message: error.message || 'Internal Server Error'
      }
    });
  }
};
```

---

## 3. Webhook Signature Verification (`X-HubSpot-Signature-v3`)

For incoming webhooks from HubSpot or public integrations, always verify authentication signatures using `X-HubSpot-Signature-v3`.

```javascript
const crypto = require('crypto');

function verifyHubSpotSignature(context) {
  const signatureVersion = context.headers['x-hubspot-signature-v3'];
  const rawSignature = context.headers['x-hubspot-signature'];
  const requestTimestamp = context.headers['x-hubspot-request-timestamp'];

  if (!rawSignature || !requestTimestamp) {
    return false;
  }

  // Reject requests older than 5 minutes to prevent replay attacks
  const FIVE_MINUTES_MS = 5 * 60 * 1000;
  if (Date.now() - parseInt(requestTimestamp, 10) > FIVE_MINUTES_MS) {
    return false;
  }

  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
  const requestUrl = context.url;
  const httpMethod = context.method;
  const requestBody = JSON.stringify(context.body || {});

  const sourceString = httpMethod + requestUrl + requestBody + requestTimestamp;
  const hash = crypto
    .createHmac('sha256', clientSecret)
    .update(sourceString)
    .digest('base64');

  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(rawSignature));
}
```

---

## 4. Rate Limit & Error Backoff Strategy

*   **API Limit**: HubSpot Standard API limits cap requests at 100 requests / 10 seconds per token.
*   **Retry Pattern**: Implement exponential backoff for HTTP `429` (Rate Limit Exceeded) responses.

```javascript
async function executeWithRetry(apiCall, maxRetries = 3) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await apiCall();
    } catch (err) {
      if (err.statusCode === 429 && attempt < maxRetries - 1) {
        attempt++;
        const backoffMs = Math.pow(2, attempt) * 500 + Math.random() * 100;
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      } else {
        throw err;
      }
    }
  }
}
```

---

## 5. Live Debugging & Monitoring (`hs logs`)

Use the CLI to monitor serverless function output in real-time during execution:

```bash
# Tail logs for a specific function
hs logs app.functions/getAccountSummary

# Tail logs continuously
hs logs app.functions/getAccountSummary --follow

# View past log entries
hs logs app.functions/getAccountSummary --limit=50
```
