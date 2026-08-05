# 06 — v6 Refactor Requirements

## Current-state baseline

Current v6 is Account-level Deal centric.

The current processor resolves one canonical active Deal per Account using an account-level Deal key.

The target refactor must replace that baseline with Product Deals:

```text
Deal = Account × Product
```

Do not treat the current one-Deal-per-Account behavior as an accidental bug. It is the old invariant to replace.

## Target invariants

```text
1. Account owns all Contacts, Deals, and Quotes.
2. Deal = Account × Product.
3. No Product Deal without a Quote.
4. Quote = contract.
5. Quote Type is required.
6. Quote.Contact controls Deal.Contact.
7. Deal.Amount = sum of non-Closed-Lost Quote ACV.
8. Automation/workflow state is Contact × Deal scoped.
```

## Product schema refactor

Current Product+Plan SKU behavior should not be preserved as the target model.

Target:

```text
Products module = product names only.
Plan details live on Quote fields.
```

Fields:

```text
Quote Plan Products
Quote Plan Type
Quote Plan Brands
Quote Plan Frequency
```

## processLead requirements

Refactor `processLead` to:

```text
1. Create/reuse Account.
2. Create/reuse Contact.
3. Resolve Product Interest.
4. Parse Acquisition/Expansion/Renewal quote groups.
5. Group by Quote Plan Products.
6. For each Product:
   - create/reuse Account × Product Deal
   - ensure Draft Acquisition Quote exists if no real quote data exists
   - create/update Acquisition Quote if Acquisition fields exist
   - create/update Expansion Quote if Expansion fields exist
   - create/update Renewal Quote if Renewal fields exist
7. Apply lifecycle order:
   Acquisition -> Expansion -> Renewal
8. Create/update activation tasks only when Decision Maker auto-eligible.
```

Do not create/import Lead.Opportunity. Opportunity is derived on Deals.

## processContact requirements

Refactor `processContact` to:

```text
1. Normalize Contact.
2. Resolve Contact Role from Job Title when blank.
3. Resolve Product Interest.
4. For each Product Interest:
   - resolve/create Product Deal
   - ensure Contact is associated to that Product Deal
   - ensure at least one Quote exists
5. Create activation task only if:
   - Contact is Decision Maker
   - Contact/Deal workflow is Not Activated
   - no duplicate open activation task exists
```

Do not create one generic Account-level Deal.

## processDeal requirements

Refactor `processDeal` to reconcile exactly one Product Deal.

Responsibilities:

```text
1. Validate Deal has Product.
2. Validate Quotes under Deal match Deal Product.
3. Validate Quote Plan Products match Deal Product.
4. Set Deal.Contact from controlling Quote.Contact.
5. Roll up Deal.Amount from non-Closed-Lost Quotes.
6. Derive Opportunity from stage.
7. Reconcile Product-scoped Contact Roles.
8. Avoid moving or creating Quotes for multiple Products inside one Deal.
```

If context/activity evidence references a different Product than the supplied Deal:

```text
Route to correct Product Deal if safe.
Otherwise Manual Review.
```

## processAccount requirements

Refactor duplicate detection.

Old duplicate definition:

```text
same Account
```

New duplicate definition:

```text
same Account + same Product
```

Multiple Deals under one Account are valid when Products differ.

Account rollup:

```text
Account open if any Product Deal is open/active/non-lost.
Account lost/closed only if all Product Deals lost/closed.
```

## handleQuoteStageChange requirements

This adapter should trigger Quote lifecycle when relevant.

On Quote stage change:

```text
If Quote Stage becomes Closed Won:
    apply quote lifecycle idempotently.
If Quote Stage becomes Closed Lost:
    apply loss rules.
Always reconcile related Product Deal.
```

## applyQuoteLifecycle requirement

Add or implement explicit lifecycle logic.

Conceptual function:

```text
applyQuoteLifecycle(quoteId)
```

Responsibilities:

```text
1. Read Quote.
2. Validate Quote Type.
3. Validate Product Deal.
4. For Acquisition Closed Won:
   - create Renewal Quote if missing.
5. For Expansion Closed Won:
   - update Renewal Quote to match Expansion terms.
6. For Renewal Closed Won:
   - create next Renewal Quote.
7. Enforce no duplicate open Renewal.
8. Enforce no duplicate open Acquisition/Expansion defaults.
9. Recalculate Deal.Amount.
10. Reconcile Account rollup.
```

## routeContactSequence / activity routing requirements

Workflow must be Contact × Deal scoped.

Do not let global Contact sequence fields be the sole source of truth.

Activity validation:

```text
same Account alone is insufficient.
```

A Contact can mutate a Product Deal only when tied through:

```text
Quote.Contact
Deal.Contact
Deal Contact Role
matching Product Interest
```

## handleTaskCompletion requirements

Task evidence that references multiple Products must create/update Quotes under the correct Product Deals.

Do not create multiple Product Quotes under one Deal.

If Task.What_Id is UX Deal but Task product evidence contains 360:

```text
Route 360 evidence to 360 Deal if safe.
Otherwise Manual Review.
```

## Idempotency requirements

All lifecycle automation must be idempotent.

Repeated workflow fires must not create duplicate:

```text
Deals
Quotes
Renewals
Activation Tasks
Emails
Manual Review tasks
```

Recommended deterministic keys:

```text
Deal key = Account_Key + Product_Key
Quote open slot = Deal + Quote_Type + open/non-lost stage
Renewal slot = Deal + Renewal_Window_Start / source term
Activation task = Contact + Deal + Stage
Lifecycle application = Quote + Stage transition
```

If schema should remain light, idempotency can be implemented by deterministic lookup rather than adding extra fields.

## Manual Review

Prefer code-level review codes in Aux Task descriptions/logs rather than many new CRM fields.

Recommended review codes:

```text
[missing_product_interest]
[product_unresolved]
[quote_missing_contact]
[non_decision_maker_quote_contact]
[duplicate_product_deal]
[duplicate_open_quote]
[quote_product_mismatch]
[activity_product_mismatch]
[expansion_downgrade_attempt]
[renewal_date_invalid]
[quote_lifecycle_conflict]
```
