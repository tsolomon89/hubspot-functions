# 08 — Coding Agent Prompt

You are working in the `zoho-functions` repository, specifically the v6 functions.

## Mission

Refactor v6 from the current Account-level Deal model to the new Product Deal model.

Current baseline:

```text
Account -> one canonical Deal -> per-Product Quotes inside that Deal
```

Target model:

```text
Account -> many Product Deals
Deal = Account × Product
Quote = contract / proposed contract
```

Do not treat the old one-Deal-per-Account behavior as an accidental bug. It is the previous invariant and must be intentionally replaced.

## Core invariants

Implement these invariants:

```text
1. Account owns Contacts, Deals, and Quotes.
2. Deal = Account × Product.
3. One Deal per Account per Product.
4. No Deal without a Quote.
5. Quote = contract.
6. Quote Type is required: Acquisition / Expansion / Renewal.
7. Quote.Contact controls Deal.Contact.
8. Deal.Amount = SUM Quote ACV for all Quotes where Quote Stage != Closed Lost.
9. Automatic activation tasks are Decision Maker only by default.
10. Workflow/sequence state must be Contact × Deal scoped.
11. Same Account alone is not enough for an activity to mutate a Product Deal.
```

## Product schema target

Products should be product-name only.

Plan and commercial terms live on Quote fields:

```text
Quote Plan Products
Quote Plan Type
Quote Plan Brands
Quote Plan Frequency
```

Keep the `Plan` moniker because it groups sortable plan-related fields.

Definitions:

```text
Quote Plan Products = product being quoted.
Quote Plan Type = Fixed / Flex / plan type.
Quote Plan Brands = number of brands.
Quote Plan Frequency = service frequency.
```

## Quote semantics

Quote Type:

```text
Acquisition
Expansion
Renewal
```

Quote Stage:

```text
Draft
Negotiation
On Hold
Confirmed
Closed Won
Closed Lost
```

Critical:

```text
Confirmed = terms agreed, not signed.
Closed Won = signed.
```

Only Closed Won should trigger signed lifecycle behavior.

## Lifecycle rules

### Acquisition

```text
Acquisition Closed Won:
    create Renewal Quote.
```

### Expansion

```text
Expansion Closed Won:
    starts new full-year contract from Expansion start date.
    supersedes previous active terms.
    update existing open Renewal Quote to match Expansion terms.
    do not create duplicate Renewal Quote.
```

### Renewal

```text
Renewal Closed Won:
    signed early is allowed.
    does not become effective/current until effective start date.
    create next Renewal Quote.
```

### Closed Lost

```text
Acquisition Closed Lost with no active quote -> Product Deal Lost.
Renewal Closed Lost -> Product Deal Lost/churned.
Account closes only if all Product Deals are lost/closed.
```

## Renewal window

Use:

```text
Renewal_Window_Start = Contract Date End - 45 days
```

This is when renewal chasing/workflow begins.

The user will provide actual Zoho field API names.

## Lead/import rules

Import is one row per Contact.

Lead import may include:

```text
Acquisition Quote *
Expansion Quote *
Renewal Quote *
Product Interest
Pipeline
Stage
State
Status
```

Do not add/use `Opportunity` on Leads. Opportunity is derived on Deals.

For each Contact row:

```text
1. Create/reuse Account.
2. Create/reuse Contact.
3. Resolve Product Interest.
4. Parse Acquisition/Expansion/Renewal quote groups.
5. For each Product:
   - create/reuse Product Deal.
   - ensure at least one Quote exists.
   - create Draft Acquisition Quote if no actual quote values exist.
6. Apply lifecycle in order:
   Acquisition -> Expansion -> Renewal.
```

## processLead

Refactor to create Product Deals instead of one generic Deal.

Group input by Product.

Do not create multiple Product Quotes under one Account-level Deal.

## processContact

Refactor to resolve Product Deals from Product Interest.

Create activation tasks only for Decision Makers by default.

Do not create one generic Account-level Deal.

## processDeal

Refactor to reconcile a single Product Deal.

Validate:

```text
Deal Product exists.
Quotes under Deal match Deal Product.
Quote Plan Products matches Deal Product.
```

Roll up:

```text
Deal.Amount = sum non-Closed-Lost Quote ACV.
Deal.Contact = controlling Quote.Contact.
```

## processAccount

Refactor duplicate handling.

Old duplicate definition:

```text
same Account
```

New duplicate definition:

```text
same Account + same Product
```

Multiple Deals under one Account are valid when Products differ.

## handleQuoteStageChange / lifecycle

Add explicit idempotent lifecycle behavior for Closed Won / Closed Lost quote transitions.

Repeated workflow fires must not create duplicate Renewal Quotes.

## Workflow/automation

One Contact may be in multiple Product Deal workflows at once.

Therefore, do not rely on global Contact sequence fields as the sole operational state.

The workflow state must be Contact × Deal scoped or otherwise represented through Deal/Task context without corrupting parallel workflows.

## Activity validation

A Contact can mutate a Product Deal only if connected by:

```text
Quote.Contact
Deal.Contact
Deal Contact Role
matching Product Interest
```

Same Account alone is insufficient.

## Manual Review

Prefer Aux Tasks and automation logs over many new CRM fields.

Use canonical review code strings in descriptions/logs:

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

## Idempotency

All automation must be idempotent.

Repeated workflow fires must not duplicate:

```text
Deals
Quotes
Renewal Quotes
Activation Tasks
Emails
Manual Review Tasks
```

Use deterministic lookup keys where possible.

Recommended concepts:

```text
Deal key = Account_Key + Product_Key
Open Quote slot = Deal + Quote_Type + non-lost/open status
Renewal slot = Deal + Renewal_Window_Start or source term
Activation task = Contact + Deal + Stage
```

## Tests

Implement and run the E2E plan in `07_e2e_test_plan.md`.

All test data must use a unique E2E identifier and be cleaned up after execution.
