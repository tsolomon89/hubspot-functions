# Runbook: HubSpot Workflow Desired State & Custom Code Action Setup

This document describes how to configure, verify, and enable the required HubSpot Workflows in developer test portal `149041124`.

---

## 1. Desired State Overview

Desired workflow state is declared in `config/workflow-desired-state.yaml`:

| Workflow Name | Enrolled Object | Triggers | Custom Code Action Input | Secrets |
|---|---|---|---|---|
| COA Contact Bootstrap & Communication Reconciliation | `CONTACT` | Email/Phone/Consent change | `relationshipType`, `offeringKeys` | `PRIVATE_APP_ACCESS_TOKEN` |
| COA Company B2B Subject Routing | `COMPANY` | Name/Domain/Suppression change | `relationshipType: b2b` | `PRIVATE_APP_ACCESS_TOKEN` |
| COA Lead Progression Reconciliation | `LEAD` | Stage/Offering change | `relationshipType` | `PRIVATE_APP_ACCESS_TOKEN` |
| COA Deal Transaction Progression | `DEAL` | Stage change (Closed Won) | `relationshipType` | `PRIVATE_APP_ACCESS_TOKEN` |

---

## 2. Custom Code Action Configuration in Portal UI

When installing or editing custom code actions in portal `149041124`:

1. **Language / Runtime**: Select `Node.js 20.x` (or supported Node runtime).
2. **Code**: Paste the compiled contents of `dist/hubspot-custom-code/reconcile-record.js`.
3. **Secrets**: Select `PRIVATE_APP_ACCESS_TOKEN`.
4. **Input Variables**:
   - `relationshipType`: Map to property `coa_relationship_type`
   - `offeringKeys`: Map to property `coa_offering_keys`
5. **Data Outputs**:
   - `objectId` (String)
   - `objectType` (String)
   - `opportunityKey` (String)
   - `qualificationState` (String)
   - `appliedIntentsCount` (Number)
   - `verified` (Boolean)
   - `status` (String)
6. **Re-enrollment**: Enable re-enrollment for all trigger properties.

---

## 3. Deployment Safety Protocol

- Always install workflows in **DISABLED** state first.
- Execute unit and contract tests locally: `npm test`.
- Validate project metadata: `npx hs project validate`.
- Test against synthetic fixture records (`COA_E2E_<timestamp>`).
- Enable workflows in portal `149041124` only after fixture verification succeeds.
