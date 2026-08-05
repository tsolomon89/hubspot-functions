# HubSpot Platform Research (Platform 2026.03)

**Last Updated:** 2026-08-05  
**Platform Target:** `2026.03`  
**Distribution Mode:** Private App (Static Token Auth)  

---

## Technical Platform Decisions & Official Evidence Matrix

| Claim or decision | Live account evidence | Official source URL | Last updated or accessed | Consequence for implementation |
| --- | --- | --- | --- | --- |
| **Platform Version 2026.03** | `hsproject.json` platformVersion specification | https://developers.hubspot.com/docs/apps/developer-platform/overview | 2026-08-05 | Project scaffolding must use `platformVersion: "2026.03"` in `hsproject.json`. |
| **CLI & Project Tooling** | `@hubspot/cli` supports `hs project upload`, `hs project secret` | https://developers.hubspot.com/docs/apps/developer-platform/build-apps/create-an-app | 2026-08-05 | Build and deploy automation relies on `@hubspot/cli` v5+. |
| **Distribution & Authentication** | Single-account deployment target | https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/overview | 2026-08-05 | Private static authentication using personal access token; no OAuth redirect endpoints required. |
| **Webhook Request Signature v3** | `X-HubSpot-Signature-v3` header | https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/request-validation | 2026-08-05 | Validate HMAC-SHA256 signature using `HTTP_METHOD + URI + RAW_BODY + TIMESTAMP`. Reject drift > 300,000ms. |
| **Webhook Fast Acknowledge** | 5-second HTTP response limit | https://developers.hubspot.com/docs/api-reference/webhooks | 2026-08-05 | Ingress endpoint must persist raw payload to PostgreSQL `hubspot_event_inbox` and reply `200 OK` within < 2 seconds. |
| **Custom Workflow Actions** | Operations Hub workflow extension | https://developers.hubspot.com/docs/apps/developer-platform/add-features/custom-workflow-actions | 2026-08-05 | Action set to `isPublished: false`. Ingress accepts enrolled record ID and triggers async worker reconciliation. |
| **CRM Unique Value Properties** | `hasUniqueValue: true` on single-line text properties | https://developers.hubspot.com/docs/api-reference/legacy/crm/properties/guide | 2026-08-05 | Company identity `jurnii_company_key` and Deal identity `jurnii_deal_key` configured as unique text properties. |
| **v4 Associations & Labeled Links** | Labeled Deal-to-Contact associations | https://developers.hubspot.com/docs/api-reference/latest/crm/associations/associations-schema/guide | 2026-08-05 | Labeled associations configured for `Decision Maker`, `End User`, and `Influencer`. |
| **CRM Object & Line Item APIs** | `crm.objects.deals`, `crm.objects.companies`, `crm.objects.contacts`, `crm.line_items` | https://developers.hubspot.com/docs/api-reference/latest/crm/using-object-apis | 2026-08-05 | API client must adapt to v3/v4 object endpoints with batching (max 100 per request) and rate-limit handling. |
| **EU Data Residency** | Portal hostname `app-eu1.hubspot.com` | https://developers.hubspot.com/docs/api/overview | 2026-08-05 | API base URL must target `api-eu1.hubspot.com` if regionalized, or global endpoints matching account routing. |
