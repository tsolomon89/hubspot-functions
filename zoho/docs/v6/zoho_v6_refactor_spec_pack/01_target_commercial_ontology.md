# 01 — Target Commercial Ontology

## Object hierarchy

```text
Account
  ├── Contacts
  ├── Product Deal: Account × Jurnii UX
  │     ├── Acquisition Quote
  │     ├── Expansion Quote
  │     └── Renewal Quote
  ├── Product Deal: Account × Jurnii 360
  │     ├── Acquisition Quote
  │     └── Renewal Quote
  └── Product Deal: Account × Jurnii Cortex
        └── Acquisition Quote
```

## Account

The Account is the company-level container.

The Account owns:

- Contacts
- Deals
- Quotes

The Account's state/status is an aggregate rollup from its Product Deals.

## Deal

A Deal is the product-specific commercial container.

```text
Deal = Account × Product
```

A Deal is not a contract. It is the box where all contracts/proposed contracts for that Account/Product relationship live.

A Deal should answer:

```text
What is the commercial state of this Account's relationship with this Product?
```

## Quote

A Quote is the contract/proposed contract.

A Quote should answer:

```text
What are the actual or proposed commercial terms?
```

No separate Contract module exists.

## Product and plan

Target product schema:

```text
Products module = product names only.
Plan details = Quote fields.
```

Plan field cluster:

```text
Quote Plan Products
Quote Plan Type
Quote Plan Brands
Quote Plan Frequency
```

Definitions:

```text
Quote Plan Products = the product being quoted.
Quote Plan Type = Fixed / Flex / other plan type.
Quote Plan Brands = number of brands in the commercial plan.
Quote Plan Frequency = service frequency, mainly for Jurnii 360.
```

## Quote type

Quote Type is required.

```text
Acquisition = first purchase for a Product Deal.
Expansion = mid-cycle upgrade/change after a won contract.
Renewal = continuation/end-of-term contract.
```

## Quote stage

Quote Stage defines the state of the contract/proposed contract.

```text
Draft       = scaffold / draft contract
Negotiation = active commercial negotiation
On Hold     = paused / blocked
Confirmed   = terms agreed, not signed
Closed Won  = signed contract
Closed Lost = failed quote/contract
```

## Quote ownership

Each Quote has one Contact.

```text
Quote.Contact = controlling external stakeholder.
```

Deal Contact mirrors Quote Contact:

```text
Quote.Contact -> Deal.Contact
```

If the controlling stakeholder changes, change the open Renewal or Expansion Quote Contact. Do not casually rewrite historical Closed Won Quote Contact.

## Deal contacts

A Deal can have many Contacts via Contact Roles.

Contacts are associated to Product Deals by Product Interest:

```text
Contact Product Interest includes Deal Product -> associate Contact to Deal.
```

Quote Contact must always be associated to the Deal.

## Deal amount

Deal Amount is a rollup:

```text
SUM(Quote ACV where Quote Stage != Closed Lost)
```

This includes Draft, Negotiation, On Hold, Confirmed, and Closed Won Quotes.

Closed Lost Quotes are excluded.

## Account rollup

Account remains open if any Product Deal is open/active or has a non-lost Quote.

Account is lost/closed only when all Product Deals are lost/closed.
