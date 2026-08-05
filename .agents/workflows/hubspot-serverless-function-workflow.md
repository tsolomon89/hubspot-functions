# Workflow: Developing & Deploying Serverless Functions

This workflow guides the end-to-end process of building, configuring, testing, and debugging Node.js serverless functions in a HubSpot Project.

---

## Step-by-Step Execution Plan

### Step 1: Create Endpoint Folder & Manifest
Navigate to your project's `src/app/` directory and ensure an `app.functions` directory exists:
```
src/app/app.functions/
├── serverless.json
├── package.json
└── getAccountData.js
```

### Step 2: Define Endpoint Route (`serverless.json`)
Add your endpoint specification to `serverless.json`:
```json
{
  "runtime": "nodejs20.x",
  "version": "1.0",
  "endpoints": {
    "getAccountData": {
      "file": "getAccountData.js",
      "method": "GET"
    }
  }
}
```

### Step 3: Implement Function Logic
Create `getAccountData.js` implementing the standard export:
```javascript
const hubspot = require('@hubspot/api-client');

exports.main = async (context = {}, sendResponse) => {
  try {
    const hsClient = new hubspot.Client({
      accessToken: process.env.PRIVATE_APP_TOKEN
    });
    // Add logic here
    return sendResponse({ statusCode: 200, body: { success: true } });
  } catch (err) {
    return sendResponse({ statusCode: 500, body: { error: err.message } });
  }
};
```

### Step 4: Install Dependencies & Verify Build
Ensure `@hubspot/api-client` is listed in `app.functions/package.json` and run:
```bash
cd src/app/app.functions
npm install
```

### Step 5: Sync & Monitor via CLI Logs
From project root, upload files and tail live execution logs:
```bash
hs project upload
hs logs app.functions/getAccountData --follow
```

### Step 6: Test Endpoint Call
Trigger the endpoint from your React UI extension or via curl:
```bash
curl -X GET "https://api.hubapi.com/express/v1/app-functions/getAccountData" \
     -H "Authorization: Bearer <YOUR_ACCESS_TOKEN>"
```
Verify `200 OK` status and output format in CLI log output.
