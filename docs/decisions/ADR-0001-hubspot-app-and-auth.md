# ADR-0001: HubSpot App Architecture, Private Distribution, and Static Authentication

**Status:** Approved  
**Date:** 2026-08-05  
**Deciders:** Jurnii Engineering & AI Agent  

---

## Context and Problem Statement

Jurnii is porting its commercial operations system from Zoho CRM Deluge to HubSpot. The target HubSpot portal (`149041124`) is an internal commercial system dedicated to Jurnii's sales operations. We must choose the distribution model, authentication scheme, developer platform version, and component deployment boundaries.

---

## Decision Drivers

1. **Single-Account Ownership:** The app serves Jurnii's internal portal only. It is not intended for public distribution or the HubSpot App Marketplace.
2. **Platform Currency:** Platform `2026.03` is the supported standard for HubSpot Projects and modern CLI deployment (`@hubspot/cli`).
3. **Security & Least Privilege:** Access must be restricted to explicit CRM scopes required by the commercial automation engine, using static access tokens managed securely outside source control.
4. **Resilience & Durability:** Complex commercial state transitions must run in an external TypeScript service backed by PostgreSQL to ensure idempotency and fast-ACK webhook responses.

---

## Considered Options

1. **Private Distribution + Static Authentication (Chosen)**
2. Private OAuth Distribution (Multi-Tenant)
3. Public App / Marketplace Distribution
4. Pure HubSpot In-App Serverless Functions without External Persistence

---

## Decision Outcome

**Chosen Option:** **Option 1: Private Distribution + Static Authentication**

### Rationale

- **Distribution Mode:** `private` — simplifies configuration and avoids OAuth token refresh choreography while serving a single dedicated HubSpot portal.
- **Authentication:** `static` — uses a static personal access token securely stored in `.env` / deployment secret stores.
- **Platform Version:** `2026.03` — ensures compatibility with HubSpot CLI (`@hubspot/cli`) and modern Project structures.
- **Testing Boundary:** The application will be uploaded and verified in an isolated **Developer Test Account** before any production cutover.
- **Component Boundary:** The HubSpot app project defines metadata, webhooks, and custom workflow actions (`isPublished: false`), while the external Node.js/TypeScript service executes business logic and state machine transitions.

---

## Consequences

- If the business requirement changes in the future to support multi-account installation across independent HubSpot portals, this ADR must be superseded by a Private OAuth design prior to production deployment.
- Static tokens must NEVER be committed to source code, chat logs, or build artifacts.
