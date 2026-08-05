# Rule: HubSpot Development Guidelines & Constraints

This rule defines mandatory architecture standards, security policies, rate-limiting constraints, and project conventions for developing on the HubSpot platform in Antigravity 2.0.

---

## 1. Security & Token Hygiene

> [!CAUTION]
> NEVER hardcode access tokens, API keys, client secrets, or OAuth credentials in source files.

1.  **Project Secrets**: Store runtime credentials as HubSpot Project Secrets (`hs project secret add <NAME>`).
2.  **Environment Access**: Reference secrets via `process.env.<SECRET_NAME>` in serverless functions.
3.  **Webhook Validation**: ALL incoming webhooks or external HTTP calls MUST validate the `X-HubSpot-Signature-v3` signature header against `process.env.HUBSPOT_CLIENT_SECRET`. Reject unauthenticated requests immediately with HTTP `401 Unauthorized`.

---

## 2. API Rate Limiting & Backoff Standards

1.  **Rate Limit Threshold**: HubSpot Standard API permits up to **100 requests per 10 seconds** per token.
2.  **Exponential Backoff**: Any client request receiving HTTP `429` (Rate Limit Exceeded) MUST execute exponential backoff with random jitter before retrying.
3.  **Batch API Priority**: When modifying multiple CRM records (Contacts, Deals, Companies, Custom Objects), ALWAYS prefer batch endpoints (`batchApi.update`, `batchApi.create`) over singular loop requests to conserve rate limits.

---

## 3. Platform Versioning (Projects 2026.03+)

1.  **Target Platform**: All `hsproject.json` manifests MUST specify `"platformVersion": "2026.03"` or higher.
2.  **App Cards**: Deprecated legacy sidebar cards MUST NOT be introduced. All CRM UI components MUST be written as React UI Extensions using `@hubspot/ui-extensions` and configured as App Cards (`crm-card`).

---

## 4. UI Extensions Guidelines

1.  **Native Components Only**: Front-end React UI extensions MUST restrict component imports to standard components provided by `@hubspot/ui-extensions` (`Tile`, `Flex`, `Button`, `Table`, `Text`, `Form`, `Modal`, `Alert`, `LoadingSpinner`).
2.  **Serverless Layer**: UI extensions MUST NOT embed sensitive third-party API keys or perform raw database calls directly. All data mutations and external integrations MUST route through project serverless functions using `runServerlessFunction`.
3.  **Feedback & Error Boundary**: Always present a loading state (`LoadingSpinner`) during asynchronous requests and clear alert notifications (`Alert`) on error.

---

## 5. Dependency Management

1.  **Lockfiles**: `package-lock.json` MUST be generated and committed for root and sub-packages (`app.functions/`, `extensions/`).
2.  **Installation**: Use `hs project install-deps` to ensure all nested dependencies are synchronized prior to deployments.
