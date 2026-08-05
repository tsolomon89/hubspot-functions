# HubSpot Workflow & Custom Code Action Setup Guide

This guide explains how to configure HubSpot Workflows and Custom Code Actions to execute the stateless commercial reconciliation kernel natively within HubSpot.

---

## 1. Prerequisites

1. Access to a HubSpot portal with **Workflow Custom Code Actions** enabled (Sales / Service / Operations Hub Professional or Enterprise).
2. The `hubspot-functions` project built and uploaded via `@hubspot/cli`:
   ```bash
   npm run build
   hs project upload --skip-auto-deploy
   ```

---

## 2. Deploying the Custom Code Action Source

HubSpot Custom Code Actions run inside HubSpot's serverless Node.js environment. They execute standard CommonJS JavaScript files exposing `exports.main = async (event, callback) => { ... }`.

1. Open `dist/hubspot-custom-code/reconcile-record.js` in your repository.
2. Copy the entire contents of `dist/hubspot-custom-code/reconcile-record.js`.
3. In HubSpot, navigate to **Automation > Workflows**.
4. Create or edit a workflow (Contact, Company, Lead, or Deal enrolled).
5. Add an action: **Custom Code**.
6. Set **Language** to `Node.js 18.x` or `Node.js 20.x`.
7. Paste the copied bundle into the code editor.
8. Set **Properties to include in event**:
   - `recordId`
   - `objectType`
   - `organizationKey` (optional override)
   - `relationshipType` (optional override)

---

## 3. Workflow Triggering Patterns

- **Contact Workflow:** Triggers when Contact email or lifecycle stage changes. Automatically bootstraps or reconciles the managed Lead.
- **Company Workflow:** Triggers when Company domain or relationship key changes. Automatically bootstraps or reconciles the managed Lead.
- **Lead Workflow:** Triggers when Lead pipeline stage changes (`mql` -> `sql`).
- **Deal Workflow:** Triggers when Deal stage changes (`open` -> `closedwon`).

---

## 4. Retries & Error Handling

- The custom code action exports `exports.main`.
- If an unverified receipt or API network error occurs, the code throws an explicit `Error`.
- HubSpot Workflows catch thrown errors natively and schedule automatic retries.
