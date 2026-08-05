# Phase 3 — A/E/R Quote Transition Lifecycle (SCOPE)

Status: **scoping only — no code yet.** Author-reviewed against live code 2026-07-04.
Prereq: Phase 2 import path is operationally closed and validated live (canonical import,
scaffold Quote, natural activation, idempotency, product-scoped Deal/Quote model).

## 1. Goal

When a Quote is **Closed Won**, advance the contract lifecycle by creating/updating the
**successor** Quote(s) on the SAME Product Deal, deterministically and idempotently, without
ever duplicating an open slot and without ever marking a Deal Won.

```
Acquisition  --Closed Won-->  create/reuse the single open Renewal
Expansion    --Closed Won-->  update the single open Renewal (no new slot)
Renewal      --Closed Won-->  create the NEXT open Renewal
Renewal      --Closed Lost--> churn/loss rules (Deal may go Lost)
```

Non-goals: no new Deal creation (transitions stay within the existing Product Deal); no change
to the Phase 2 import/scaffold/activation code paths except the Confirmed→signed shift in §7.

## 2. Trigger surface (already exists)

- **WF020 Quotes** (field_update on `Quote_Stage`, active) / **WF021** (create_or_edit) →
  `automation.handleQuoteStageChange(quoteId)`.
- `handleQuoteStageChange` is a thin router: resolves old/new Deal (Quote reassignment handshake
  via `Quote_Last_Deal_ID`) and calls `processDeal(dealId, ctx=quote)`. **Unchanged in Phase 3.**
- All lifecycle behaviour already lives inside `processDeal`. Phase 3 adds the transition there.

## 3. Architecture (recommended)

New helper **`automation.applyQuoteLifecycle(string dealId)`** (a `_util`-style function),
called from `processDeal` in a new section **§10**, positioned AFTER §9 (Confirmed/Closed-Won
establishment) and BEFORE §6 Amount recompute so any newly-created successor Quote is counted.

Rationale: `processDeal` is the single commercial owner, already enumerates the Deal's Quotes,
and runs on every relevant edit (Quote via handleQuoteStageChange, Deal via WF001d, import/
contact paths). Housing the transition here + keying on `Quote_Applied_Lifecycle_Keys` makes it
fire exactly once per event regardless of which path re-reconciles the Deal.

`applyQuoteLifecycle(dealId)` algorithm (per reconcile):
1. Read all Quotes on the Deal (full records — getRelatedRecords omits custom fields).
2. Build the slot map: the single OPEN (non-Closed-Lost, non-Closed-Won) Quote per `Quote_Type`.
3. For each **Closed Won** Quote whose `Quote_Applied_Lifecycle_Keys` does NOT already contain its
   transition key: apply the type-specific transition (below), then stamp the key on the won Quote.
4. For each **Renewal Closed Lost** without its churn key: apply churn rules, stamp the key.
5. Enforce the invariant: at most one OPEN Quote per `Quote_Type` per Deal (see §6).

## 4. Per-transition specification

Let `won` = the Closed Won Quote; `Deal_Product` = the Deal's canonical product; `tier` =
Account Company Tier benchmark (1→26000, 2→16500, 3→10500, else 0), reused from §5b/§8z.

### 4a. Acquisition → Closed Won  ⇒  ensure the single open Renewal
- If an OPEN Renewal Quote already exists on the Deal (e.g. import supplied both Acq + Renewal
  groups) → **reuse** it (no create); optionally refresh its dates/renewal-chase from `won`.
- Else **create** one Renewal Quote (see §5 successor template).
- Stamp `Lifecycle:AcqCW:<wonId>` on `won`.

### 4b. Expansion → Closed Won  ⇒  update the single open Renewal (NO new slot)
- Find the single OPEN Renewal on the Deal.
  - If found → update it: bump `Contract_ACV` (add the expansion value or re-derive), keep its
    dates/renewal-chase. Expansions accumulate INTO the renewal, they do not spawn slots.
  - If NOT found → **[DECISION D3]** create a Renewal (treat like Acq) OR raise Manual Review
    `[expansion_without_renewal]`. Recommend: create, log a warning (keeps invariant intact).
- Stamp `Lifecycle:ExpCW:<wonId>` on `won`.

### 4c. Renewal → Closed Won  ⇒  create the NEXT open Renewal
- Create a new Renewal Quote for the following cycle (see §5 successor template), dates rolled
  forward from `won`'s contract end.
- Stamp `Lifecycle:RenCW:<wonId>` on `won`.

### 4d. Renewal → Closed Lost  ⇒  churn/loss rules
- The renewal slot is lost. **[DECISION D4]** If the Deal has NO other OPEN (non-Closed-Lost,
  non-Closed-Won) Quote, set the Deal `Opportunity_State="Lost"`, `Opportunity_Status="Closed"`,
  `Lost_Reasons="Churned / Did Not Renew"` (the exact approved picklist option; `Reason_For_Loss__s`
  is NOT written — it has no such option and none is created). Deals never Won — Lost is allowed. If
  other OPEN Quotes remain, leave the Deal Open. `rollupAccountState` then churns the Account only
  when ALL its Product Deals are Lost.
- Stamp `Lifecycle:RenCL:<wonId>` on the lost Quote.

## 5. Successor Quote template (create)

Reuse the §8z/§5b invokeurl POST pattern (Quoted_Items line, `List_Price` policy, trigger-suppressed):

| Field | Value |
|---|---|
| `Quote_Type` | `Renewal` |
| `Quote_Stage` | `Draft`  **[DECISION D5: Draft vs Negotiation]** |
| `Quote_Product` | = `Deal_Product` (canonical; never a variant) |
| `Contract_Date_Start` | predecessor `Contract_Date_End` + 1 day |
| `Contract_Date_End` | new start + 1 year **[DECISION D6: term length / carry predecessor duration]** |
| `Quote_Contract_Date_Renewal` | new `Contract_Date_End` − 45d (renewal **chase** date; matches import) |
| `Contract_ACV` | **[DECISION D2]** carry predecessor `Contract_ACV` (renewal estimate) OR 0 |
| `Quote_Target_ACV` | tier benchmark |
| `Contact_Name` | Deal primary/controlling Contact |
| `Account_Name` / `Deal_Name` | the Deal's Account / the Deal |
| `Quote_Applied_Lifecycle_Keys` | provenance, e.g. `Origin:RenCW:<wonId>` |

## 6. Invariants & enforcement

- **≤1 open Quote per Quote_Type per Deal.** Before any create, re-check there is no existing
  OPEN (non-Closed-Lost, non-Closed-Won) Quote of that type; if one exists, reuse/update it.
  This is the "no duplicate open Renewal / Acquisition / Expansion slots" rule.
- **Idempotency via `Quote_Applied_Lifecycle_Keys`** (field confirmed to exist). Each transition
  stamps a deterministic key on the triggering (won/lost) Quote; a present key ⇒ skip. Mirrors the
  proven `impKey` (§5b) and `scafKey` (§8z) patterns; safe under WF re-fire and the async WF001d run.
- **Confirmed is NOT signed. Only Closed Won triggers the signed lifecycle.** See §7.
- **Deal.Amount = SUM of OPEN Quote totals** — OPEN = `Quote_Stage != Closed Lost` AND `!= Closed Won`
  (D1 decision). A signed (Closed Won) Quote is contract history (reported from Quote/contract
  reporting), NOT carried in the active Deal.Amount; its value lives on via the successor Renewal
  (which carries the predecessor ACV, D2). Result: Amount stays ≈ 1× current contract value, never
  double-counts signed year + renewal. Included stages: Draft/Negotiation/Delivered/On Hold/Confirmed.
- **Deals never Won.** `Opportunity_State ∈ {Open, Lost}` only. Closed Won lives on the Quote, not the Deal.

## 7. Confirmed → Closed Won semantic shift (touches §9 — needs sign-off)  **[DECISION D1]**

Today §9 treats **Confirmed** as contract establishment: on first Confirmed it stamps
`Contract_ACV` + `Contract_Signed_Date`; line 1929 counts `Confirmed || Closed Won` for RTP.
Phase 3 spec: "Confirmed is not signed; only Closed Won triggers signed lifecycle."

Recommended interpretation (least disruptive to the validated import):
- **Confirmed** = terms agreed / contract ready. Keep stamping `Contract_ACV` here (so Amount +
  ledger reflect agreed value) but do **NOT** stamp `Contract_Signed_Date` and do **NOT** treat
  Confirmed as "signed/RTP" for the transition lifecycle.
- **Closed Won** = signed. Move `Contract_Signed_Date` stamping here; Closed Won is the ONLY
  trigger for §4 transitions and for "signed/active" (RTP / Account "Active Customer").
- Consequence: imported Quotes left at `Confirmed` will be "agreed, not signed" (no renewal
  spawned, Account stays Prospect) until moved to Closed Won. Confirm this matches intent, since
  it changes how the current Confirmed-based §9/rollup behave. **This is the one place Phase 3
  reopens Phase 2 code; flagged deliberately.**

## 8. Field readiness

- `Quote_Applied_Lifecycle_Keys` — **exists** (verified). Idempotency ledger for §4.
- `Quote_Contract_Date_Renewal` — exists. Renewal chase date.
- `Contract_Date_Start` / `Contract_Date_End` / `Contract_ACV` / `Quote_Target_ACV` /
  `Quote_Type` / `Quote_Stage` / `Contract_Signed_Date` — all exist.
- **Optional new fields [DECISION D7]:** `Quote_Supersedes` / `Quote_Superseded_By` (lookup) for
  explicit lineage. Not required (the Deal groups the chain), but useful for reporting. Defer unless wanted.

## 9. Open decisions (need your call before build)

- **D1** Confirmed-vs-Closed-Won signed shift (§7) — accept recommended split? (touches §9)
- **D2** Successor `Contract_ACV`: carry predecessor value (Amount reflects renewal pipeline) or 0
  (unpriced until negotiated). Affects Deal.Amount sum.
- **D3** Expansion Closed Won with no open Renewal: auto-create vs Manual Review.
- **D4** Renewal Closed Lost churn: Deal→Lost only when no other live Quote (recommended) vs always.
- **D5** New successor stage: `Draft` (recommended) vs `Negotiation`.
- **D6** Renewal term length: fixed 1 year vs carry predecessor duration.
- **D7** Add lineage lookup fields? (default: no.)

## 10. Test plan (post-build smoke, tag ZZSMK-P3)

1. Acq Closed Won → exactly one open Renewal appears; re-fire → no duplicate (key present).
2. Import with Acq + Renewal groups, Acq→Closed Won → existing open Renewal reused, not duplicated.
3. Expansion Closed Won → the single open Renewal updated (ACV bumped), no new slot.
4. Renewal Closed Won → next open Renewal created; only one open Renewal at a time.
5. Renewal Closed Lost (sole live Quote) → Deal Lost + Account Churned via rollup.
6. Confirmed (not Closed Won) → NO transition, NO Contract_Signed_Date (per D1).
7. Deal.Amount = SUM non-Closed-Lost across the chain at each step.
8. Deal never Won at any step; zero automation-function failures.

## 11. Build order (once decisions land)

1. Author `_util_applyQuoteLifecycle.deluge` (per §3/§4/§5/§6).
2. Wire §10 call in `processDeal` (after §9, before §6) + implement the D1 §7 shift.
3. Adversarial review (idempotency, duplicate-slot, concurrency, Amount, no-Deal-Won).
4. User publishes → smoke (§10) → commit after live matches.
