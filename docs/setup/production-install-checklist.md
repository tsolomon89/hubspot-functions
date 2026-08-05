# Production Installation & Pre-Cutover Checklist

**Target Portal:** `149041124` (Production Jurnii CRM)  
**App UID:** `jurnii_commercial_automation`  
**Rule:** DO NOT INSTALL IN PRODUCTION UNTIL ALL GATES PASS AND USER AUTHORIZES.  

---

## Pre-Cutover Verification Gates

- [ ] **Developer Test Account Verification Passed:** App uploaded, installed, and validated in test account.
- [ ] **Automated Test Suite Clean:** 100% unit and integration tests passing (`npm test`).
- [ ] **Signature v3 Validation Verified:** HMAC SHA-256 endpoint validation verified with synthetic & test payloads.
- [ ] **Schema Dry-Run Plan Deterministic:** `schema plan` against target account returns expected diff; second `plan` after test apply is empty.
- [ ] **No Secret Leakage:** Tokens and secrets stored in approved secret stores (HubSpot Secrets / deployment env), completely absent from repo git history.
- [ ] **Workflow Action Unpublished:** `jurnii_reconcile_record` configured as `isPublished: false` until endpoint readiness is confirmed.
- [ ] **No Production Record Mutation:** Verification that zero production records, workflows, or properties were touched during initial foundation setup.
- [ ] **User Explicit Authorization Received:** Separate explicit user command received to perform production deployment.
