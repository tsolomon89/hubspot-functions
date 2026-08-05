# Authoritative Architecture: HubSpot-Native Universal Commercial Kernel

**Target Repository:** `tsolomon89/hubspot-functions`  
**Execution Portal:** `149041124` (Account Role: `developer-test`)  
**Architecture Boundary:** Pure HubSpot-Native  

---

## 1. Executive Summary & Core Invariant

The HubSpot-Native Universal Commercial Kernel provides pure, stateless commercial qualification and lifecycle progression natively within HubSpot CRM.

```text
HubSpot Workflow Trigger
  -> Custom Code Action (reconcile-record.js)
  -> Fresh CRM Snapshot Load
  -> Pure Commercial Kernel Evaluation
  -> HubSpot CRM Mutation (Lead / Deal / Line Item / Task)
  -> Post-Write Authoritative Readback Verification
```

HubSpot CRM is the **sole durable commercial system of record**. There is **no external persistence**, no PostgreSQL database, no Vercel API server, no webhooks requiring external endpoints, no queues, no polling workers, and no custom CRM objects.

---

## 2. Universal Commercial Lifecycle & Native Object Model

The universal commercial lifecycle progresses through:

$$\text{Organization} \rightarrow \text{Relationship Type} \rightarrow \text{MQL} \rightarrow \text{SQL} \rightarrow \text{FTP} \rightarrow \text{RTP}_1 \rightarrow \text{RTP}_2 \rightarrow \cdots$$

### Native Object Mapping

| Commercial Concept | HubSpot Native Representation | Purpose & Constraints |
|---|---|---|
| Person Subject | `Contact` | Native Contact record holding email, phone, consent, and suppression flags. |
| Business Subject | `Company` | Native Company record holding domain, name, and suppression flags. |
| MQL & SQL Qualification | `Lead` | Exactly **one** native Lead record per commercial relationship spanning MQL and SQL. |
| FTP or RTP Transaction | `Deal` | Exactly **one** native Deal per transaction cycle (FTP = cycle 1, RTP = cycle $N$). |
| Commercial Offering Catalog | `Product` | Read-only catalog templates (identified by `hs_sku` or custom offering key). |
| Offering Instantiated on Transaction | `Line Item` | Transaction-specific offering parented to exactly **one** Deal. |
| Qualification Evidence | `Activities` (Meetings, Calls) | Native activities scoped to participating relationship contacts. |
| Human Summary Projection | `Lifecycle Stage` | Optional derived projection on Contact/Company (`lead`, `marketingqualifiedlead`, `salesqualifiedlead`, `customer`). |

---

## 3. Key Architecture Guarantees

1. **Pure Kernel Isolation**: `packages/commercial-kernel` has zero dependencies on HubSpot SDKs, Node environment variables, or CRM property names.
2. **Developer-Test Account Guard**: All mutating commands verify portal ID `149041124` and `accountRole: developer-test`. Mutations on non-developer-test portals are strictly forbidden.
3. **Deterministic Replay Safety**: Replaying custom code actions or processing duplicate events is completely idempotent. Duplicate Leads, Deals, Line Items, and Tasks are prevented via deterministic keys (`coa_opportunity_key`).
4. **Parented Line Items**: Offerings on transactions are instantiated as native Line Items attached to their parent Deal. Line Items are never shared across Deals. Products are read-only catalog templates.
5. **Fail-Closed Verification**: Every CRM mutation performs post-write readback verification. If readback fails, the action throws `ACTION_UNVERIFIED` to trigger native HubSpot workflow retries.
