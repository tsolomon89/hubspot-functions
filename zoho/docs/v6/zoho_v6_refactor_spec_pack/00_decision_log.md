# 00 — Decision Log

## Core model

```text
Account owns Contacts, Deals, and Quotes.
Deal = Account × Product.
Quote = contract / proposed contract.
```

There is no separate Contract module. For current purposes, a Quote is the contract object.

Invoices are explicitly out of scope.

## Account

The Account is the company-level container. It owns all commercial records:

```text
Account
  ├── Contacts
  ├── Deals
  └── Quotes
```

Account rollup follows aggregate Product Deal state.

The Account remains open/active if any Product Deal is open, active, or has an open Quote. The Account becomes lost/closed only when all Product Deals are lost/closed.

## Deal

A Deal is the product-specific commercial box.

```text
Deal = Account × Product
```

There should be exactly one Deal per Account per Product.

Deal name format:

```text
{Account Name} - {Product}
```

There must be no duplicate Product Deals.

A duplicate Deal is:

```text
same Account + same Product
```

Different Products under the same Account are not duplicates.

## Quote

A Quote is the contract/proposed contract for a Product Deal.

```text
Quote = contract
```

A Deal may contain multiple Quotes over time:

- Acquisition Quote
- Expansion Quote(s)
- Renewal Quote(s)

But a Deal must not contain duplicate open Quotes for the same commercial slot.

## Product schema

Products should be product-name only.

Examples:

```text
Jurnii UX
Jurnii 360
Jurnii Cortex
```

Plan-level details live on the Quote:

```text
Quote Plan Products
Quote Plan Type
Quote Plan Brands
Quote Plan Frequency
```

`Quote Plan Products` is intentionally named with the `Plan` moniker to allow the plan-related fields to sort together. Its meaning is the Product being quoted.

## Quote Type

`Quote Type` is required.

Allowed values:

```text
Acquisition
Expansion
Renewal
```

Inference rules:

```text
First purchase for Product Deal = Acquisition.
Mid-cycle upgrade/change after a won Quote = Expansion.
End-of-term continuation = Renewal.
```

## Quote Stage

Quote stages:

```text
Draft
Negotiation
On Hold
Confirmed
Closed Won
Closed Lost
```

Meanings:

```text
Draft       = draft contract / scaffold
Negotiation = terms being negotiated
On Hold     = paused / blocked
Confirmed   = terms agreed, not signed
Closed Won  = signed
Closed Lost = failed
```

Critical rule:

```text
Confirmed is not signed.
Only Closed Won is signed.
```

## No Deal without Quote

Every Product Deal must have at least one Quote.

If no real quote values exist, create a Draft Acquisition Quote.

Default Draft Quote values should come from:

1. Pricing matrix, if enough data exists.
2. Target ACV from Company Tier, if pricing cannot resolve.

## Target ACV vs Quote ACV

```text
Target ACV = benchmark based on Company Tier.
Quote ACV = actual amount being quoted.
```

## Deal Amount

Final rule:

```text
Deal.Amount = SUM(Quote ACV for all Quotes on the Deal where Quote Stage != Closed Lost)
```

Included:

```text
Draft
Negotiation
On Hold
Confirmed
Closed Won
```

Excluded:

```text
Closed Lost
```

Deal Amount is therefore total non-lost product-deal quote value, not strictly current active signed ACV.

## Expansion

Expansion starts a new full-year contract from the Expansion start date.

Expansion supersedes the dates and terms of the prior Acquisition or Renewal contract.

A downgrade should not be created as an Expansion. Downgrades belong in Renewal. This is primarily a user/process rule, but the automation should raise Manual Review if it detects an obvious downgrade attempt.

## Renewal

Always create or update a Renewal Quote when a Quote becomes Closed Won.

Rules:

```text
Acquisition Closed Won -> create Renewal Quote.
Expansion Closed Won -> update Renewal Quote to match Expansion terms.
Renewal Closed Won -> create next Renewal Quote.
```

A Renewal can be signed early, but it does not become active/current until its effective contract start date.

Same principle for Expansion signed early.

## Renewal window

The field called renewal date/start in prior discussion should be treated as:

```text
Renewal workflow/window start = Contract Date End - 45 days
```

Use conceptual name:

```text
Renewal_Window_Start
```

The user's actual Zoho field names will be provided separately.

## Closed Lost behavior

Acquisition Closed Lost with no active Quote means the Product Deal is lost.

Renewal Closed Lost means the Product Deal is lost/churned.

Account closes only if all Product Deals are lost/closed and no other Product Deal or open Quote remains active/open.

If another Product Deal remains open/active, the Account remains open.

## Contact model

A Deal can have many Contacts.

A Quote has exactly one Contact.

The Quote Contact is the controlling commercial stakeholder for that Quote.

Rule:

```text
Quote.Contact -> Deal.Contact
```

If a Quote Contact exists, ensure that Contact is associated to the Deal and set Deal.Contact to that Contact.

If Quote Contact is blank, fallback to Decision Maker / Contact Role logic.

Closed Won historical Quote Contact should not be casually overwritten. If the stakeholder changes, assign the new Contact to the Renewal or Expansion Quote.

## Deal Contact Roles

Deal Contact Roles are based on Contact Product Interest.

Rules:

```text
Contact with UX interest -> UX Deal.
Contact with 360 interest -> 360 Deal.
Contact with both -> both Deals.
```

Do not attach every Account Contact to every Product Deal by default.

## Automation and activation

Automatic activation tasks should be created only for Decision Makers by default.

The activation gate remains.

```text
Decision Maker = auto-eligible.
Activation Task = human permission gate.
Non-Decision Maker = manual activation only by default.
```

## Parallel workflows

One Contact can be part of multiple workflows for different Product Deals at the same time.

Therefore workflow/sequence state must be scoped to Contact × Deal, not only global Contact fields.

Global Contact stage/sequence fields may remain as summary/mirror fields only. They must not be the sole operational state for product-specific automation.

## Import shape

Import is one row per Contact.

A single Contact row can create multiple Product Deals and multiple Quotes based on Product Interest and quote groups.

## Migration

No legacy migration logic is needed for production. Existing Zoho data will be cleared before fresh import.

E2E test data must be isolated and cleaned up after testing.
