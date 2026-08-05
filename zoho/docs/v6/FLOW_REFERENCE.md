# v6 Flow Reference

## Current Architecture
- **A Deal is `Account × Product`** (`Deal_Key = accountKey::productKey`). There is one
  canonical open Deal *per product key* under an Account — not one Deal per Account and
  not one Deal per Lead. Where this doc says "the canonical open Deal", read it as "the
  canonical open Deal for that product key". `processAccount` elects the lowest-id live
  Deal per product key and silences the rest as duplicates.
- **`processDeal` is the sole commercial owner** — Amount, Quotes, contract ledger,
  primary Contact, stage transitions, and the Account rollup all flow through it. The
  Contact owns the outreach sequence; `Deal.Opportunity_Stage` rolls up from the
  furthest-progressed open Contact under the Account.
- Leads remain intake/staging. Contacts, Accounts, Deals, Products, and Quotes are the durable graph.
- Activity Product evidence comes from multi-select picklist values on Tasks, Calls, and Events.
- Activity handlers pass Product-name strings in `contextJson.products`.
- `processDeal` resolves Product names, links Contact and Deal Product related lists, creates or updates per-Product Quotes, recomputes Amount, rebuilds ledgers, and gates commercial transitions.
- `handleQuoteStageChange` is a thin WF021 adapter. It coordinates Quote reassignment and calls `processDeal` for the exact Deal(s) involved.
- Imported Leads also feed Quotes: `processLead` extracts `Contract_Initial_*`/`Contract_Current_*` evidence and calls `processDeal` with `source="import_bootstrap"` (see "Imported-Contract Bootstrap"). Future contracts remain activity-driven; imports use this controlled idempotent path.

## Workflow State
| Workflow | Module | Current cutover role |
| --- | --- | --- |
| WF021 Quotes Create/Edit | Quotes | New unified Quote workflow. Keep disabled until all gates pass. |
| WF020 Quotes | Quotes | Legacy Quote_Stage field-update workflow. Keep active until WF021 is verified. |
| WF004 Commercials Status Handler | Deals | Legacy back-compat wrapper. Keep active until WF021 is verified, then disable. |
| WF006 Calls | Calls | Keep. Adapter reads Product-name picklist values and passes `products`. |
| WF007 Events | Events | Keep. Adapter infers meeting type from `Meeting_Task_Stage` and passes `products`. |
| WF008 Tasks | Tasks | Keep. Adapter reads Product-name picklist values and passes `products`. |

## Activity Product Fields
| Module | Field | Data type | Meaning |
| --- | --- | --- | --- |
| Tasks | `Task_Contract_Products` | Multi-select picklist | Product-name strings selected by the rep. |
| Calls | `Call_Task_Contract_Products` | Multi-select picklist | Product-name strings selected by the rep. |
| Events | `Meeting_Task_Contract_Products` | Multi-select picklist | Product-name strings selected by the rep. |

Required actual values must equal `Products.Product_Name`, including:
- `Jurnii 360 - Fixed`
- `Jurnii 360 - Flex`
- `Jurnii UX - Fixed`
- `Jurnii UX - Flex`
- `Jurnii Cortex - Fixed`
- `Jurnii Cortex - Flex`

## Activity Context
```json
{
  "source": "activity",
  "sourceModule": "Tasks|Calls|Events",
  "sourceActivityId": "991103...",
  "contactId": "991103...",
  "activityState": "Won",
  "products": ["Jurnii UX - Fixed"],
  "numberOfBrands": 5,
  "contractDateStart": "2027-01-01",
  "contractDateEnd": "2027-12-31"
}
```

Activity contexts carry Product names only.

## Product Resolution
- `processDeal` loads active Products and indexes by normalized `Product_Name` and `Product_Code`.
- Exact Product-name match wins.
- Product-code fallback is allowed only when no Product-name match exists.
- Duplicate active names or codes are ambiguous and raise Manual Review.
- Unresolved Product strings raise Manual Review and do not create a Quote for that Product.

## Quote Ownership
- One Product Quote is keyed by Deal, `Quote_Product`, and `Opportunity_Type`.
- The Quote header `Quote_Product` must match the single distinct Product in `Quoted_Items.Product_Name`.
- Activity-updatable Quote stages are Draft, Negotiation, Delivered, and On Hold.
- Confirmed, Closed Won, and Closed Lost Quotes are not overwritten by activity evidence.
- `Quote_Applied_Activity_Keys` is the idempotency ledger. Keys are exact newline-delimited values like `Calls:991103...`.

## Imported-Contract Bootstrap (Leads import, 2026-06-26)
Imported Leads carry split-contract evidence in `Contract_Initial_*` / `Contract_Current_*` fields. This is a SECOND commercial-evidence source alongside activities; it uses the SAME commercial owner (`processDeal`), not a parallel engine.

Authority model:
- **Product Interest** (`Leads.Product_Interest`, multiselect of exact SKU names) = Product-interest evidence only. It creates the Contact↔Product link (`Contacts_X_Products`). It NEVER creates a Quote and never defines brands/dates/tier/price.
- **Contract Target ACV** (`Contract_Target_ACV`, formula from `Company_Tier`: 1=26000, 2=16500, 3=10500) = benchmark only. Never a Quote value, never `Deal.Amount`. `Company_Tier` is propagated Lead→Deal on BOTH create and reuse: when the Deal tier is blank it is set; when it is populated and differs from the Lead it is NOT overwritten and a `[company_tier_conflict]` review is raised.
- **Split contract fields** (`Contract_Initial_*` / `Contract_Current_*`) = the customer's actual contract terms → the Quote-bootstrap input.
- **Quote** = canonical commercial transaction. **Deal `Contract_*` ledger** = derived from Confirmed/Closed-Won Quotes only.
- **Deal.Amount valuation hierarchy** (§8b — Amount is BOTH the contracted value AND the pre-contract pipeline value):
  1. **Lost** (any Opportunity Type): `Amount = 0` (override wins over Quotes / Target / imported ACV — a lost RTP never keeps its old renewal value).
  2. **Active non-Closed-Lost priced Quotes** (sum > 0): `Amount = SUM(Quote totals)` — the actual quoted/contracted authority (includes Confirmed imported-ACV Quotes).
  3. **Open + Opportunity Type ∈ {MQL, SQL, FTP} + no priced Quote**: `Amount = Target ACV` (pre-contract pipeline value), computed from Company Tier (Deal → Account; 1→26000/2→16500/3→10500/else 0).
  4. **Open RTP + no priced Quote**: `Amount = 0` and `[rtp_missing_commercial_evidence]` review — Target ACV is NOT used as an actual renewal value; RTP value must come from an active renewal Quote or an imported-ACV Quote.
  5. Otherwise `Amount = 0`.
  Product `Unit_Price` is NEVER an Amount source (forbidden). Target ACV stays a benchmark; it is only the pipeline Amount for pre-Quote open MQL/SQL/FTP Deals.
- **Account-driven tier refresh (Account is live-authoritative):** `Company_Tier` is an Account attribute; `Deal.Company_Tier` is only a mirror/cache. `WF001c Process Account` (Accounts, create_or_edit, no criteria) fires `processAccount` on any Account create/edit → reconciles the canonical open Deal via `processDeal`. §8b derives the pipeline Amount from the **live Account tier** (`acctTierLive`), and §8a2 keeps `Deal.Company_Tier` in lock-step with the Account: set/update when they differ, and **clear** it when the Account tier is removed. No `[company_tier_conflict]` — there is no manual Deal-level tier override, so the Account always wins. Therefore: Account tier 1→3 → Deal mirror 3 + Amount 26000→10500; Account tier removed → Deal mirror cleared + Amount 0. `processLead` seeds the Lead's tier onto the **Account** on conversion (the Account is the source of truth); the Deal mirror follows.

`processLead` extraction (step 1c) → encodes one term per Plan-Products family (multiselect):
`term~family~planType~brands~dateStart~dateEnd~importedACV~frequency~tier`, terms joined by `;`, blanks as sentinel `_`. Initial+Current identical → one term (Current). A Product-Interest vs contract plan-type clash raises `[contract_product_conflict]` and emits no term. Then `processLead` calls `processDeal` with:
```json
{ "source": "import_bootstrap", "sourceModule": "Leads", "sourceRecordId": "<leadId>",
  "contactId": "<contactId>", "opportunityType": "RTP", "termsEncoded": "Current~Jurnii UX~Flex~5~2026-01-01~2026-12-31~8400~_~Base" }
```

`processDeal` §5b (`source=="import_bootstrap"`), per term:
- Resolve the exact active Product by `Product_Plan_Products` + `Product_Plan_Type` (0 → `[contract_product_unresolved]`; >1 → `[contract_product_ambiguous]`; variant family with no plan type → `[contract_tuple_incomplete]`).
- Link Product → Contact junction + Deal Products (idempotent).
- **Contract value (imported-existing-contract rule):** the **imported ACV is authoritative** — when `Contract_*_ACV` is present and > 0 it becomes the line value / `Contract_ACV` / Deal Amount. The catalogue `resolveQuoteLinePrice` (default tier Base) is a **benchmark**: if it can also price and differs (exact 2dp compare, no invented tolerance), an informational `[imported_acv_variance]` review is raised but the imported ACV is kept. When the catalogue cannot price (e.g. Jurnii 360 without frequency, Jurnii Cortex) but an imported ACV exists, the imported ACV is used and `[pricing_from_imported_acv]` is raised. The catalogue calc is the **fallback** only when no imported ACV exists (e.g. multi-family terms, which carry no per-family ACV). A line is unpriced (`List_Price = 0`, never `Unit_Price`) ONLY when neither an imported ACV nor a catalogue price is available.
- **Stage rule:** Confirmed when the term is dated and has a known value (imported ACV OR catalogue calc) — so Amount + ledger derive immediately, with the value-source review (above) attached for human confirmation. Otherwise Draft + Manual Review (`[pricing_unavailable]` / `[pricing_frequency_missing]` / `[contract_tuple_incomplete]`); the confirmed ledger does not derive.
- **Idempotency key** in `Quote_Applied_Activity_Keys`: `ImportBootstrap:Lead:<leadId>:<term>:<prodId>:<start>:<end>`. Key already present → skip. Else term-match (Deal + `Quote_Product` + `Opportunity_Type` + dates, not Closed) → UPDATE in place (reuse the existing `Quoted_Items` line id, read via REST GET — Deluge `getRecordById` omits subform line ids). Else CREATE. Re-import never duplicates the Quote or the line.
- Strict REST readback verifies key + product + line + brands; failure raises `[quote_post_write_verification_failed]`.

Multi-family Current term → one Quote per family (shares plan type / brands / dates / frequency — a documented schema limitation: a single Lead tuple cannot carry per-product values). Jurnii 360 frequency is read from the per-term fields `Contract_Initial_Plan_Frequency` / `Contract_Current_Plan_Frequency` (picklist `4x per day` / `2x per day` / `1x per day`) and carried in the encoded term's `frequency` slot; with a valid frequency a 360 term prices and can confirm. If frequency is blank, the 360 line stays unpriced (`[pricing_frequency_missing]`) — never fabricated. Frequency is a per-term contract dimension (it can differ Initial vs Current), not interest evidence, so it lives with the other `Contract_*` fields rather than being tied to Product Interest.

## Quote Reconciliation
- `WF021` fires on Quote create/edit after cutover.
- `handleQuoteStageChange` reads `Quote_Last_Deal_ID` and current `Deal_Name`.
- No move: call `processDeal(currentDeal, {"source":"quote","reconciliationRole":"current"})` and verify marker.
- Move A to B: call old-role reconciliation for A, then new-role reconciliation for B, then stamp and verify `Quote_Last_Deal_ID=B`.
- Unlink: call old-role reconciliation for the old Deal, then clear the marker.
- Quote deletion is not part of the automation path; use Closed Lost.

## Commercial State
- Quote lifecycle and `processDeal` are commercial authority.
- Delivered Quotes can route `commercial:sent` after all relevant Quotes are ready.
- Confirmed Quotes require both contract dates before term ledger and signed transition logic.
- Signed commercial state keeps Deal `Opportunity_State` Open; Deals are not persistently Won.
- Closed Lost Quotes are excluded from active amount and do not automatically close the Deal while other viable evidence remains.

## Retired Or Legacy Behavior
- `Commercials_Status` is DEP-labeled and legacy-only while WF004 is active.
- `handleCommercialsStatusChange` maps legacy values to a safe wrapper. It does not write phantom fields.
- Do not write `Commercials_Sent_At`, `Signed_At`, `Commercials_Discussed_At`, or `Intent_To_Sign`.
- `Meeting_Type` is DEP-labeled and unused. Events use `Meeting_Task_Stage`, `Meeting_Task_State`, and `Meeting_Task_Lost_Reasons`.
- v6 idempotency is owned by ledger keys, related links, and re-fire guards.
- Quote-line updates (both the import-bootstrap and the activity `§5` update paths) read existing `Quoted_Items` and the line id via the REST API, not `getRecordById` (which omits subform line ids and custom subform fields). Sending the line WITH its id makes the PUT update in place; without it Zoho appends a duplicate line and inflates the Quote total / Deal Amount / contract ACV on re-fire.
- The provisional `Product.Unit_Price` sum as `Deal.Amount` is REMOVED and stays forbidden — a linked Product is interest evidence, not valuation authority. With no priced Quote, Amount is the Target-ACV pipeline value (open MQL/SQL/FTP) or 0 (Lost, or open RTP with no Quote) per the §8b hierarchy — never Unit_Price.
- `processLead` no longer reads/writes the phantom contract fields `Contract_Start_Date`, `Contract_End_Date`, `Contract_Renewal_Date`, `Contract_ACV_Intial`, `Contract_ACV_Current`, `Contract_Type`, `Contract_Currency` (none exist on Leads or Deals). Use the `Contract_Initial_*`/`Contract_Current_*` fields; `Contract_*_Plan_Products` is multiselect on Leads and Deals.

## Cutover Acceptance
- Metadata readback confirms Quote fields, activity Product picklists, and Events `Meeting_Task_Stage`.
- Atomic Quote write proof confirms header, `Quoted_Items`, and `Quote_Applied_Activity_Keys` can be written and read back together.
- T1-T50 pass.
- Final workflow readback confirms `WF021` active, `WF020` inactive, and `WF004` inactive.
