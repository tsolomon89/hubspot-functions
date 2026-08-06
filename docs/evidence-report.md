# Commercial Operations Automation - Evidence Report

## Repository Context & Current Architecture Status

This report documents current repository evidence for the HubSpot Native Commercial Kernel implementation.

### Portal Roles & Environment Identity
- **Parent Developer Account**: Portal `149041124` is documented as `APP_DEVELOPER`.
- **Runtime Guard**: All live mutations require an API-verified `DEVELOPER_TEST` account (`accountDetails.accountType === "DEVELOPER_TEST"`).

### Platform Version 2026.03 Components
- App Function defined under `src/app/functions/` with type `app-function`.
- Workflow Action defined under `src/app/workflow-actions/` with type `workflow-action`.
- Signature verification strictly enforced via `X-HubSpot-Signature-v3` HMAC-SHA256 with fail-closed HTTP 401 handling on missing signature or secret.

### Authoritative Lifecycle Boundaries
- MQL completion persists `coa_mql_completed_at`.
- SQL completion persists `coa_sql_completed_at`.
- Transitions require valid timestamps without fallbacks to predecessor completion, opening dates, or current evaluation time.

### Dependency Audit & Build Verification
- Production dependencies audited via `npm audit --omit=dev --audit-level=high`.
- Offline unit and contract test suite executed via `npm test`.
