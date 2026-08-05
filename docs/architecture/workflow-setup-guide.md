# HubSpot Workflow & Custom Code Action Configuration Guide

## Architecture Overview
The Commercial Operations Automation System executes directly inside HubSpot Workflows using **HubSpot Custom Code Actions**.

```text
HubSpot Workflow Trigger -> HubSpot Custom Code Action -> Native CRM Record Mutation
```

No external Vercel server, Fastify API, or webhook endpoint is required.

---

## Required Workflow Enrollment Triggers

### 1. Contact & Company Qualification Workflow
- **Object Type:** `Contact` or `Company`
- **Enrollment Triggers:**
  - `coa_managed` is equal to `true`
  - `coa_relationship_type` is known or updated
  - Associated `Meeting` activity outcome changes to `COMPLETED`
  - Relevant property changes (`email`, `lifecyclestage`)
- **Workflow Action:**
  - **Action Type:** `Custom Code`
  - **Runtime:** `Node.js 20.x` (or `18.x`)
  - **Language:** JavaScript
  - **Code Source:** Copy contents from [reconcile-record.ts](file:///c:/Development/Projects/hubspot-functions/src/custom-code-actions/reconcile-record.ts)
  - **Secret Environment Variable:** `HUBSPOT_DEVELOPMENT_PERSONAL_ACCESS_KEY` or `PRIVATE_APP_ACCESS_TOKEN`

---

## 2. Lead Qualification Progression Workflow (MQL -> SQL)
- **Object Type:** `Lead` (standard object)
- **Enrollment Triggers:**
  - `coa_managed` is equal to `true`
  - `hs_pipeline_stage` property changes
- **Workflow Action:**
  - **Action Type:** `Custom Code`
  - **Output Fields:**
    - `status` (String)
    - `opportunityKey` (String)
    - `qualificationState` (String)

---

## 3. Deal Progression Workflow (FTP & RTP)
- **Object Type:** `Deal`
- **Enrollment Triggers:**
  - `coa_managed` is equal to `true`
  - `dealstage` changes to `Closed Won`
  - Associated Line Items created/modified
- **Workflow Action:**
  - **Action Type:** `Custom Code`
