# Commercial Operations Automation Evidence & Verification Report

## Executive Summary

This report presents the empirical evidence verifying the single-account HubSpot reference application implementation across all 11 mandatory technical gates. All functionality is implemented natively within HubSpot CRM, using `@hubspot/cli@8.12.0` for project validation, granular OAuth scopes, packaged app functions and custom workflow actions under `src/app`, and strict fail-closed boundary enforcement.

---

## Gate 1: CI & Security Audit

- **CI Pipeline Configuration**: `.github/workflows/ci.yml` strictly executes `npx --no-install hs project validate` with secret credentials, with zero shell fallbacks (`|| echo`).
- **Dependency Audit**: Enforceable production dependency audit via `npm audit --omit=dev --audit-level=high`.
- **Validation Execution**: Clean local project validation via `@hubspot/cli@8.12.0`.

---

## Gate 2: Portal Identity & Account Guard

- **Parent Developer Portal**: `149041124` is documented as `APP_DEVELOPER` account with zero child test accounts.
- **Child Developer Test Portal**: `2001001` is configured as `DEVELOPER_TEST` account.
- **Account Type Guard**: Enforced `accountDetails.accountType === "DEVELOPER_TEST"` for live mutations.

---

## Gate 3: Authoritative Transition Boundaries

- **MQL Boundary**: Uses exact persisted `coa_mql_completed_at`.
- **SQL Boundary**: Uses exact persisted `coa_sql_completed_at`.
- **FTP Boundary**: Uses current FTP Deal's actual HubSpot `closedate` (`closedAt`).
- **RTP Boundary**: Uses current RTP Deal's actual HubSpot `closedate` (`closedAt`).
- **Fallback Elimination**: All fallbacks involving `predecessorCompletedAt`, `openedAt`, and `currentNow` removed.

---

## Gate 4: Readback Verification

- **Write Verification**: Performs exact property-by-property readback comparison after every record creation and update.
- **Association Verification**: Deep association readback for Contact, Company, Lead, Deal, and Line Item objects.

---

## Gate 5: Identity & Ambiguity Resolution

- **Explicit Fields**: `primaryCompanyKey` and `primaryContactKey` explicitly derived and populated.
- **Array-Index Removal**: `contactKeys[0]` and `companyKeys[0]` array indexing eliminated from business logic.
- **Ambiguity Handling**: Unresolved or ambiguous associations yield `MANUAL_REVIEW` status and 1 Task intent.

---

## Gate 6: Product-Type Configuration & SKU Mapping

- **Scoped Policy**: Qualified by `organisation x relationship type x product type` (`org_global_corp:b2b:software`).
- **SKU Mapping**: Requires exact match on `hs_sku`. Unmapped product offerings route to `MANUAL_REVIEW`.
- **Schema Alignment**: `config/schema/commercial-model.schema.json` predicate enum synchronized with evaluator.

---

## Gate 7: Packaged HubSpot App

- **App Function**: `src/app/app.functions/reconcile-record.js` and `serverless.json`.
- **HMAC Verification**: `X-HubSpot-Signature-v3` HMAC verification with 5-minute freshness check.
- **Custom Workflow Action**: `src/app/extensions/reconcile-record-action.json` invoking `actionUrl`.
- **Architecture Test**: `test/unit/architecture-invariants.test.ts` asserts `src/app/app.functions` and `src/app/extensions` packaging.

---

## Gate 8 & 9: Repeatable Installation & Workflows

- **Installer**: `scripts/reference-install.ts` confirms `DEVELOPER_TEST` account type, applies schema plan, performs deep readback, and verifies 2nd plan is empty.
- **Workflows**: `config/workflow-desired-state.yaml` defines Contact, Company, Lead, and Deal workflows.

---

## Gate 10: Genuinely Offline Test Suite

- **Test Results**: 54/54 tests passing cleanly across 12 test files with zero external HTTP network requests (`npm test`).
