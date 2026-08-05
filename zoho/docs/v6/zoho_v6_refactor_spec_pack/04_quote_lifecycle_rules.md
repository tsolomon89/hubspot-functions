# 04 — Quote Lifecycle Rules

## Quote is contract

There is no separate Contract object.

```text
Quote = contract / proposed contract
```

## Quote Type

Required values:

```text
Acquisition
Expansion
Renewal
```

## Quote Stage

```text
Draft       = draft contract / scaffold
Negotiation = active commercial negotiation
On Hold     = paused / blocked
Confirmed   = terms agreed, not signed
Closed Won  = signed
Closed Lost = failed
```

Only `Closed Won` means signed.

## Acquisition

Acquisition is the first purchase for a Product Deal.

### Acquisition Closed Won

```text
1. Quote is signed.
2. Product Deal becomes active / RTP according to pipeline rules.
3. Create Renewal Quote.
4. Roll up Deal.Amount.
```

### Acquisition Closed Lost

```text
If no active quote exists:
    Product Deal becomes Lost.
```

If there are other open/won Quotes on the same Product Deal, do not blindly close the Deal; create Manual Review if state is ambiguous.

## Expansion

Expansion is a mid-cycle upgrade/change after a won Quote exists.

Expansion starts a new full-year term from the Expansion start date.

Expansion supersedes the dates and terms of the previous active Acquisition or Renewal.

### Expansion Closed Won

```text
1. Quote is signed.
2. Expansion becomes controlling future/current terms according to its start date.
3. Existing open Renewal Quote is updated to match Expansion terms.
4. Do not create duplicate Renewal Quote.
5. Roll up Deal.Amount.
```

### Expansion Closed Lost

```text
If an active/won Quote exists:
    Product Deal remains active/RTP.
If no active/won Quote exists:
    Manual Review.
```

### Downgrade rule

Downgrades should not be created as Expansions.

Downgrades belong in Renewal.

If automation detects an obvious downgrade attempt in an Expansion, create Manual Review.

## Renewal

Renewal is the continuation/end-of-term contract.

A Renewal Quote is created or updated whenever a Quote becomes Closed Won.

### Renewal window

```text
Renewal_Window_Start = Contract_Date_End - 45 days
```

This is when renewal workflow/chasing begins.

### Renewal Closed Won

```text
1. Renewal is signed.
2. It does not become current/active until its effective contract start date.
3. Create the next Renewal Quote.
4. Roll up Deal.Amount.
```

### Renewal Closed Lost

```text
Product Deal becomes Lost/churned.
```

Account remains open only if another Product Deal remains open/active or has an open Quote.

## Signed early behavior

Renewal can be signed before effective start date.

Expansion can be signed before effective start date.

Rule:

```text
Closed Won = signed.
Effective/current terms are date-aware.
```

The active/current commercial terms should not change until the Quote's effective start date.

## Duplicate Quote rules

A Product Deal may contain multiple Quotes over time, but may not contain duplicate open Quotes for the same commercial slot.

Default invariants:

```text
One open Acquisition Quote per Product Deal.
One open Renewal Quote per Product Deal.
One open Expansion Quote per Product Deal by default.
```

Historical Closed Won and Closed Lost Quotes are allowed.

## On Hold

On Hold blocks customer-facing send and lifecycle progression.

It does not automatically mark the Deal Lost.

## Confirmed

Confirmed means terms agreed but not signed.

Confirmed must not:

```text
Generate Renewal Quote.
Mark Quote as signed.
Move Deal into signed/RTP lifecycle.
Trigger commercial:signed behavior.
```

## Deal Amount rollup

```text
Deal.Amount = SUM(Quote ACV where Quote Stage != Closed Lost)
```

Recalculate after any Quote stage/value change.
