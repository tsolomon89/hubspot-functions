# Commercial Operations Automation Evidence & Verification Report

## Executive Summary

This report presents the empirical evidence verifying the HubSpot-Native Universal Commercial Kernel project. All functionality is implemented natively within HubSpot CRM, using `@hubspot/cli@8.12.0` for project validation, granular OAuth scopes, and strict fail-closed boundary enforcement.

---

## 1. Project CLI & Validation Architecture

- **HubSpot CLI Version**: Exact repository-managed `@hubspot/cli@8.12.0` in `package.json` and `package-lock.json`.
- **Project Validation Command**: `npx --no-install hs project validate`.
- **Platform Compatibility**: Target `platformVersion: "2026.03"` declared in `hsproject.json`.

---

## 2. API Scope Matrix & Security Configuration

| API Endpoint | HTTP Method | Component | Required Scopes |
|---|---|---|---|
| `/crm/v3/objects/contacts` | GET, POST, PATCH | `SnapshotLoader`, `Adapter` | `crm.objects.contacts.read`, `crm.objects.contacts.write` |
| `/crm/v3/objects/companies` | GET, POST, PATCH | `SnapshotLoader`, `Adapter` | `crm.objects.companies.read`, `crm.objects.companies.write` |
| `/crm/v3/objects/leads` | GET, POST, PATCH | `SnapshotLoader`, `Adapter` | `crm.objects.leads.read`, `crm.objects.leads.write` |
| `/crm/v3/objects/deals` | GET, POST, PATCH | `SnapshotLoader`, `Adapter` | `crm.objects.deals.read`, `crm.objects.deals.write` |
| `/crm/v3/objects/products` | GET, POST | `Adapter` | `crm.objects.products.read`, `crm.objects.products.write` |
| `/crm/v3/objects/line_items` | GET, POST, PATCH | `Adapter` | `crm.objects.line_items.read`, `crm.objects.line_items.write` |
| `/crm/v3/objects/tasks` | GET, POST | `Adapter` | `crm.objects.tasks.read`, `crm.objects.tasks.write` |
| `/crm/v3/objects/meetings` | GET | `SnapshotLoader` | `crm.objects.meetings.read` |

---

## 3. Workflow & Deployment Status

- **Workflow Status**: `BLOCKED_REQUIRES_MANUAL_PUBLISH`
- **Blocker Explanation**: The HubSpot REST API does not support programmatic creation or publishing of Automation Workflows containing Custom Code Actions via Private App static tokens. Workflows must be configured and activated in the HubSpot UI using the bundled action `dist/hubspot-custom-code/reconcile-record.js`.
