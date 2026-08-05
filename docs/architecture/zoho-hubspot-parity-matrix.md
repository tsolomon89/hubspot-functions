# Zoho to HubSpot Parity Matrix

**Source Commit SHA (`zoho-functions`):** `24d5e2244fcd13efd51311fdced7cb2806ad489c`  
**Target Platform:** HubSpot (`hubspot-functions`)  
**Status Key:** `proven` | `planned` | `blocked` | `not portable`  

---

## 1. Domain Entities & Identity Mapping

| Concept | Zoho authority | HubSpot representation | Human writable | Automation writable | Trigger | Idempotency key | Entitlement | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Lead Intake** | `Leads` (transient) | `Contact` upsert + optional `Lead` object | No (intake form/API) | Yes | Contact creation / form submit | `email` / `jurnii_company_key` | Sales Hub / Contacts | `planned` |
| **Company Identity** | `Accounts` | `Company` (`jurnii_company_key`) | Read-only | Yes (on create/intake) | Company creation / edit | `jurnii_company_key` | Core CRM | `planned` |
| **Commercial Deal** | `Deals` (`Company × Product`) | `Deal` (`jurnii_deal_key`) | Read-only | Yes | Company x Product creation | `jurnii_company_key::jurnii_product_key` | Core CRM / Deals | `planned` |
| **Product Library** | `Products` | `Product` library (SKUs) | Yes (Admin) | Read-only | Manual catalog setup | `SKU` / `product_code` | Products & Line Items | `planned` |
| **Product Quote** | `Quotes` | `Quote` object + Line Items | Read-only / Rep | Yes | Stage transition / Commercial command | `Deal_ID:Quote_Type:Product_Key` | Revenue Hub / Quotes | `planned` |
| **Contact Roles** | `Contacts_X_Deals` | Labeled Deal-to-Contact Associations | Yes (Rep) | Yes | Role assignment | `Deal_ID:Contact_ID:Label` | Association Labels | `planned` |
| **Outreach Sequence** | `Contacts.Sequence_State` | HubSpot Sequences / External Queue | Rep (Activation task) | Yes | `jurnii_activate_sequence` Task command | `Contact_ID:Sequence_Step` | Sales Hub Professional (Sequences) | `planned` |
| **Activity Loss** | Activity outcome (`Lost`) | Task/Call/Meeting `State=Lost` | Rep | Yes | Task/Call/Meeting update | `Activity_ID` | Core CRM Tasks/Calls/Meetings | `planned` |
| **Manual Review** | `Tasks` `[code]` | HubSpot Task with `[code]` prefix | Rep (resolves task) | Yes | Ambiguous product / pricing gap | `Deal_ID:Review_Code` | Core CRM Tasks | `planned` |
| **Automation Ledger** | Deluge internal logging | PostgreSQL (`hubspot_event_inbox` & `hubspot_execution_log`) | No | Yes | Ingress / State machine | `eventId` / `transitionKey` | External DB | `planned` |

---

## 2. Field Authority & Lifecycle States

| Concept | Zoho authority | HubSpot representation | Human writable | Automation writable | Trigger | Idempotency key | Entitlement | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Deal Pipeline & Stage** | `Deals.Opportunity_Stage` (1-8) | Deal Pipeline Stage (1-8) | No | Yes | Sequence route / Quote outcome | `Deal_ID:Stage` | Deal Pipelines | `planned` |
| **Opportunity Type** | `Deals.Stage` (MQL, SQL, FTP, RTP) | Custom Deal Property `jurnii_opportunity_type` | No | Derived from Stage | Stage update | `Deal_ID:Opportunity_Type` | Custom Properties | `planned` |
| **Deal Commercial State** | `Deals.Opportunity_State` (`Open`/`Lost`) | Deal Property `jurnii_opportunity_state` | Explicit loss only | Yes | All contacts lost / Churn | `Deal_ID:State` | Custom Properties | `planned` |
| **Deal Commercial Status** | `Deals.Opportunity_Status` (`New`/`Working`/`Closed`) | Deal Property `jurnii_opportunity_status` | No | Derived (Human activitylogged) | Call/Task/Meeting logged | `Deal_ID:Status` | Custom Properties | `planned` |
| **Automation Kill Switch** | `Deals.Automation_Suppressed` | Deal Property `jurnii_automation_suppressed` (Boolean) | Yes | Yes | Rep toggle | `Deal_ID` | Custom Properties | `planned` |
| **Deal Amount Valuation** | `Deals.Amount` (Hierarchy §8b) | Deal `amount` | No | Yes | Quote calculation / Target ACV fallback | `Deal_ID:Amount` | Core Deals | `planned` |

---

## 3. Quote Transition Lifecycle (A/E/R)

| Concept | Zoho authority | HubSpot representation | Human writable | Automation writable | Trigger | Idempotency key | Entitlement | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Acquisition -> Won** | `applyQuoteLifecycle` (Acq CW) | Successor Renewal Quote creation | Rep (Marks Quote Closed Won) | Yes | Quote `Closed Won` | `Lifecycle:AcqCW:<Quote_ID>` | Quotes / CPQ | `planned` |
| **Expansion -> Won** | `applyQuoteLifecycle` (Exp CW) | Update open Renewal ACV | Rep (Marks Quote Closed Won) | Yes | Quote `Closed Won` | `Lifecycle:ExpCW:<Quote_ID>` | Quotes / CPQ | `planned` |
| **Renewal -> Won** | `applyQuoteLifecycle` (Ren CW) | Next cycle Renewal Quote creation | Rep (Marks Quote Closed Won) | Yes | Quote `Closed Won` | `Lifecycle:RenCW:<Quote_ID>` | Quotes / CPQ | `planned` |
| **Renewal -> Lost** | `applyQuoteLifecycle` (Ren CL) | Deal State -> Lost (if sole quote) | Rep (Marks Quote Closed Lost) | Yes | Quote `Closed Lost` | `Lifecycle:RenCL:<Quote_ID>` | Quotes / CPQ | `planned` |

---

## 4. Invariant Preservation Verification

1. **`Company × Product` Deal:** Each product key under a Company has exactly one canonical Deal (`jurnii_deal_key = companyKey::productKey`).
2. **No Persistently Won Deals:** Winning a gate advances stage to Onboarding/Renewal; the `Closed Won` status exists on Quotes only.
3. **No Stage Regression:** Deal stage monotonically advances (1 -> 8).
4. **Deterministic Manual Review:** Ambiguity emits a Task with code prefix `[code]`; automation never auto-guesses.
5. **Human Activation Gate:** Outreach emails remain suppressed until a human completes the `Sequence Activation` task.
