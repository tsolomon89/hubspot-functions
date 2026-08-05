# HubSpot Architecture & Technical Foundation

**System Name:** Jurnii Commercial Automation (`hubspot-functions`)  
**Platform Target:** HubSpot Platform `2026.03`  
**Distribution:** Private App (`private`)  
**Authentication:** Static Personal Access Token (`static`)  

---

## 1. System Overview & Boundaries

The architecture decouples HubSpot UI and CRM event triggers from the commercial state machine:

```
+-----------------------------------------------------------------------+
|                             HubSpot Portal                            |
|                                                                       |
|   +-------------------+                     +--------------------+    |
|   |  CRM Objects      |                     | Workflows          |    |
|   | (Contacts,        |                     | (Custom Workflow   |    |
|   |  Companies, Deals)|                     |  Action)           |    |
|   +---------+---------+                     +---------+----------+    |
|             | Webhook Event                           | Action Call   |
+-------------|-----------------------------------------|---------------+
              v                                         v
+-----------------------------------------------------------------------+
|                     External TypeScript Service                       |
|                                                                       |
|   +---------------------------------------------------------------+   |
|   | Ingress Controller (Fastify API)                              |   |
|   | - Signature v3 Verification (X-HubSpot-Signature-v3)          |   |
|   | - Raw Body Preservation & Timestamp Drift Check (<5m)         |   |
|   | - Fast ACK (< 2s) & Async Envelope Queue                      |   |
|   +-------------------------------+-------------------------------+   |
|                                   |                                   |
|                                   v                                   |
|   +-------------------------------+-------------------------------+   |
|   | PostgreSQL Event Persistence & Deduplication                  |   |
|   | - hubspot_event_inbox (Unique eventId)                        |   |
|   | - hubspot_jobs (Durable state queue)                          |   |
|   | - hubspot_transition_keys (Unique transition idempotency)     |   |
|   +-------------------------------+-------------------------------+   |
|                                   |                                   |
|                                   v                                   |
|   +-------------------------------+-------------------------------+   |
|   | State Machine Worker                                          |   |
|   | - Domain Logic (Company x Product Deal state machine)         |   |
|   | - HubSpot API Client (@hubspot/api-client)                    |   |
|   | - Idempotent Quote Lifecycle Execution                        |   |
|   +---------------------------------------------------------------+   |
+-----------------------------------------------------------------------+
```

---

## 2. Component Structure

- **`src/app/`**: HubSpot project metadata and definitions (`app-hsmeta.json`, webhooks, workflow actions).
- **`services/api/`**: Fastify HTTP server for `/webhooks/hubspot`, `/workflow-actions/reconcile`, `/health`, `/ready`.
- **`services/worker/`**: Background worker picking up jobs from `hubspot_jobs`, executing state machine transitions.
- **`packages/domain/`**: Platform-neutral commercial invariants, state machines, valuation rules, and transition contracts.
- **`packages/hubspot-client/`**: Typed wrappers around `@hubspot/api-client` v3/v4 APIs with batching, rate-limit retry backoff, and pagination.
- **`packages/observability/`**: Structured logger redacting PII, tokens, and authorization headers.
- **`config/hubspot-schema.yaml`**: Manifest defining desired CRM property groups, custom properties, unique keys, association labels, and pipeline stages.

---

## 3. Security & Secret Management

- **No Secrets in Code or Source Control:** Credentials and static tokens are loaded from `.env` or HubSpot Project Secrets (`hs project secret add`).
- **Signature Validation:** Every incoming webhook payload is checked using `X-HubSpot-Signature-v3` with secret key HMAC-SHA256 comparison.
- **Data Redaction:** Observability package sanitizes email addresses, authorization headers, and API keys before logging to stdout or storage.

---

## 4. Idempotency & Replay Resilience

1. **Webhook Deduplication:** `hubspot_event_inbox` enforces a `UNIQUE(event_id, occurred_at)` index. Duplicate webhooks receive `200 OK` fast-ACK but do not queue duplicate jobs.
2. **Transition Execution Lock:** `hubspot_transition_keys` enforces a `UNIQUE(transition_key)` index. No transition (e.g. `AcqCW:12345`) can execute twice.
3. **Rest API Subform Re-fire Safety:** All quote line modifications reuse existing line IDs during batch updates to prevent duplicate line items or inflated Deal amounts.
