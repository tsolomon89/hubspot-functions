# Endpoint-to-Scope Matrix

This document maps all HubSpot API endpoints invoked by the runtime and schema CLI tools to their required OAuth / Private App scopes.

---

| API Endpoint | HTTP Method | Invoking Component | Required Scope | Purpose |
|---|---|---|---|---|
| `/crm/v3/objects/contacts` | GET, POST, PATCH | `SnapshotLoader`, `Adapter`, `SchemaTool` | `crm.objects.contacts.read`, `crm.objects.contacts.write` | Load contact properties, update lifecycle stage |
| `/crm/v3/objects/companies` | GET, POST, PATCH | `SnapshotLoader`, `Adapter`, `SchemaTool` | `crm.objects.companies.read`, `crm.objects.companies.write` | Load company properties, update lifecycle stage |
| `/crm/v3/objects/leads` | GET, POST, PATCH | `SnapshotLoader`, `Adapter`, `SchemaTool` | `crm.objects.leads.read`, `crm.objects.leads.write` | Manage qualification Leads |
| `/crm/v3/objects/deals` | GET, POST, PATCH | `SnapshotLoader`, `Adapter`, `SchemaTool` | `crm.objects.deals.read`, `crm.objects.deals.write` | Manage transaction Deals |
| `/crm/v3/objects/products` | GET, POST | `SnapshotLoader`, `Adapter` | `crm.objects.products.read`, `crm.objects.products.write` | Resolve Product catalog items |
| `/crm/v3/objects/line_items` | GET, POST, PATCH | `SnapshotLoader`, `Adapter` | `crm.objects.line_items.read`, `crm.objects.line_items.write` | Create and verify transaction Line Items parented to Deals |
| `/crm/v3/objects/tasks` | GET, POST | `Adapter` | `crm.objects.contacts.write` / `automation` | Create Manual Review Tasks |
| `/crm/v3/objects/meetings` | GET | `SnapshotLoader` | `crm.objects.contacts.read` | Read completed meeting evidence |
| `/crm/v4/associations/{fromObjectType}/{toObjectType}/batch/read` | GET, POST | `SnapshotLoader`, `Adapter` | Object read scopes | Query association pairs between CRM objects |
| `/crm/v3/properties/{objectType}` | GET, POST | `SchemaTool` | `crm.schemas.contacts.read`, `crm.schemas.companies.read`, `crm.schemas.deals.read`, `crm.schemas.custom.read` | Inspect and reconcile CRM properties |
| `/crm/v3/pipelines/{objectType}` | GET, POST, PATCH | `SchemaTool` | `crm.schemas.deals.read`, `crm.schemas.custom.read` | Inspect and reconcile Lead/Deal pipelines |
