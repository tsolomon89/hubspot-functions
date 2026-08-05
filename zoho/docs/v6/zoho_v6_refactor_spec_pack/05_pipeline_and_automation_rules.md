# 05 — Pipeline and Automation Rules

## Stage / Opportunity mapping

Opportunity should be derived on Deals, not imported on Leads.

Recommended mapping:

```text
Marketing Consent -> MQL
Demo Booking -> SQL
Demo Confirmation -> SQL
Demo Hosted -> SQL
Proposal Preparation -> FTP
Commercial Agreement -> FTP
Onboarding -> RTP
Renewal -> RTP
```

## Product gating

Product-specific commercial progression requires Product context.

Rules:

```text
MQL can exist without Product Interest.
SQL requires Product Interest or product-specific intent.
FTP requires Product Deal and Quote.
```

No Product Interest and no Quote product evidence means:

```text
No Product Deal.
No SQL/FTP product pipeline progression.
Manual Review.
```

## Deal stage

Deal stage is relative to the workflow state of the Quote owner / Deal Contact for that Product Deal.

```text
Quote.Contact -> Deal.Contact
Deal stage follows Contact × Deal workflow state.
```

## Contact × Deal scoped workflow

One Contact can be involved in multiple Product Deal workflows at the same time.

Example:

```text
Same Contact:
UX Deal = Demo Booking
360 Deal = Commercial Agreement
```

Therefore workflow state must be scoped to Contact × Deal.

Do not rely on global Contact sequence fields as the sole operational state.

Global Contact fields may remain as summaries/mirrors only:

```text
Contact.Stage
Contact.Sequence_State
Contact.Sequence_Stage
Contact.Sequence_Step
```

But the operational sequence must be Deal-scoped.

## Activation gating

Automatic activation task creation is only for Decision Makers by default.

Decision Maker status is inferred from Contact Role / Job Title as currently done.

Rules:

```text
Decision Maker -> eligible for automatic Sequence Activation Task.
Non-Decision Maker -> no automatic activation task by default.
Non-Decision Maker -> can still be manually activated/worked.
Activation Task -> human route gate.
```

The activation gate remains. Even for Decision Makers, the human must select route/action.

## Quote Contact and Deal Contact

Each Quote has one Contact.

Rule:

```text
Quote.Contact -> Deal.Contact
```

If Quote.Contact is populated:

```text
1. Ensure Contact is associated to Product Deal.
2. Set Deal.Contact to Quote.Contact.
```

If Quote.Contact is blank:

```text
Fallback to Decision Maker / Contact Role ranking.
If unresolved, Manual Review.
```

## Deal Contact Roles

Deal contacts are product-scoped.

Associate Contact to Product Deal when:

```text
Contact Product Interest includes Deal Product
or Contact is Quote.Contact
or Contact was manually added to Deal Contact Roles
```

Do not auto-remove manually associated Contacts unless explicitly instructed.

Do not attach every Account Contact to every Product Deal.

## Activity validation

Same Account alone is not enough to let an activity mutate a Product Deal.

An activity can affect a Product Deal only if the Contact is connected by one of:

```text
Quote.Contact
Deal.Contact
Deal Contact Role
matching Product Interest
```

If not:

```text
Block mutation.
Create Manual Review.
Log relationship mismatch.
```

This prevents UX-only Contacts from accidentally moving 360 Deals.

## Closed Lost routing

### Acquisition Closed Lost

If no active/won Quote exists:

```text
Product Deal -> Lost
```

### Expansion Closed Lost

If active/won Quote exists:

```text
Product Deal remains active/RTP.
```

### Renewal Closed Lost

```text
Product Deal -> Lost/churned.
```

Account closes only if all Product Deals are lost/closed.

## Account rollup

Account is open if any Product Deal is open, active, or has a non-lost Quote.

Account is lost/closed only when all Product Deals are lost/closed.
