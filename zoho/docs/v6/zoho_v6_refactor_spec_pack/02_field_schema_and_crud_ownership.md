# 02 — Field Schema and CRUD Ownership

## Lead field strategy

Lead fields should represent import/source data.

Lead fields should not duplicate fields that are derived only on Deals.

Important rule:

```text
Pipeline should exist on Lead/import.
Opportunity should not exist on Lead/import.
Opportunity is derived on Deals.
```

## Old Lead fields to remove/stop using

The old Initial/Current contract model should be removed or ignored.

```text
Contract_Current_ACV
Contract_Current_ACV_Gap
Contract_Current_Date_End
Contract_Current_Date_End_Days_Remaining
Contract_Current_Date_Renewal
Contract_Current_Date_Renewal_Days_Remaining
Contract_Current_Date_Start
Contract_Current_Plan_Brands
Contract_Current_Plan_Products
Contract_Current_Plan_Type

Contract_Initial_ACV
Contract_Initial_ACV_Gap
Contract_Initial_Date_End
Contract_Initial_Date_End_Days_Remaining
Contract_Initial_Date_Renewal
Contract_Initial_Date_Renewal_Days_Remaining
Contract_Initial_Date_Start
Contract_Initial_Plan_Brands
Contract_Initial_Plan_Products
Contract_Initial_Plan_Type

Contract_Target_ACV
```

Replace them with quote-event groups:

```text
Acquisition Quote *
Expansion Quote *
Renewal Quote *
```

## Lead quote field groups

### Acquisition

```text
Acquisition Quote ACV
Acquisition Quote ACV Gap
Acquisition Quote Contract Date End
Acquisition Quote Contract Date End Days Remaining
Acquisition Quote Contract Date Renewal
Acquisition Quote Contract Date Renewal Days Remaining
Acquisition Quote Contract Date Start
Acquisition Quote Plan Brands
Acquisition Quote Plan Frequency
Acquisition Quote Plan Products
Acquisition Quote Plan Type
Acquisition Quote Stage
Acquisition Quote Target ACV
```

### Expansion

```text
Expansion Quote ACV
Expansion Quote ACV Gap
Expansion Quote Contract Date End
Expansion Quote Contract Date End Days Remaining
Expansion Quote Contract Date Renewal
Expansion Quote Contract Date Renewal Days Remaining
Expansion Quote Contract Date Start
Expansion Quote Plan Brands
Expansion Quote Plan Frequency
Expansion Quote Plan Products
Expansion Quote Plan Type
Expansion Quote Stage
Expansion Quote Target ACV
```

### Renewal

```text
Renewal Quote ACV
Renewal Quote ACV Gap
Renewal Quote Contract Date End
Renewal Quote Contract Date End Days Remaining
Renewal Quote Contract Date Renewal
Renewal Quote Contract Date Renewal Days Remaining
Renewal Quote Contract Date Start
Renewal Quote Plan Brands
Renewal Quote Plan Frequency
Renewal Quote Plan Products
Renewal Quote Plan Type
Renewal Quote Stage
Renewal Quote Target ACV
```

## Quote module custom field set

Target quote fields:

```text
Quote ACV
Quote ACV Gap
Quote Contact
Quote Contract Date End
Quote Contract Date End Days Remaining
Quote Contract Date Renewal
Quote Contract Date Renewal Days Remaining
Quote Contract Date Start
Quote Plan Brands
Quote Plan Frequency
Quote Plan Products
Quote Plan Type
Quote Stage
Quote Target ACV
Quote Type
```

Note: use native Zoho Quote Contact field if available, rather than adding a duplicate custom Quote Contact field.

## Quote plan field definitions

```text
Quote Plan Products = product being quoted, e.g. Jurnii UX / Jurnii 360 / Jurnii Cortex.
Quote Plan Type = Fixed / Flex / other plan type.
Quote Plan Brands = number of brands.
Quote Plan Frequency = service frequency.
```

The `Plan` moniker is intentionally retained so these fields sort together.

## Derived / formula fields

These should generally be formula or automation-owned:

```text
Quote ACV Gap
Quote Contract Date End Days Remaining
Quote Contract Date Renewal
Quote Contract Date Renewal Days Remaining
Quote Target ACV
```

Ownership:

```text
Quote ACV Gap = Quote Target ACV - Quote ACV.
Quote Contract Date Renewal = Quote Contract Date End - 45 days.
Quote Contract Date End Days Remaining = days until Contract Date End.
Quote Contract Date Renewal Days Remaining = days until renewal window start.
Quote Target ACV = derived from Company Tier.
```

Do not CRUD formula-style fields unless the final Zoho field type requires it.

## Target ACV and Quote ACV

```text
Target ACV = based on Company Tier.
Quote ACV = actual amount being quoted.
```

Default Draft Quote values:

1. Use pricing matrix when enough data exists.
2. Otherwise use Target ACV from Company Tier.

## Deal fields implied

Essential Deal fields:

```text
Deal_Name
Deal_Key
Deal Product / Product Key
Pipeline
Opportunity Stage
Opportunity State
Opportunity Status
Amount
Contact_Name
Account_Name
```

Conceptual field definitions:

```text
Deal Product = Product from Quote Plan Products / Product Interest.
Deal_Key = Account_Key + Product_Key.
Amount = SUM non-Closed-Lost Quote ACV.
Deal.Contact = controlling Quote.Contact.
```

## CRUD ownership matrix

| Field group | Owner |
|---|---|
| Account identity/company fields | Lead import / processLead |
| Contact identity/job fields | Lead import / processLead / processContact |
| Contact Role | processContact from Job Title unless explicit |
| Product Interest | Lead import / manual |
| Pipeline | Lead import / manual, copied into Deal |
| Opportunity | Derived on Deal only |
| Acquisition/Expansion/Renewal Lead fields | Lead import only |
| Quote records | processLead / processDeal / lifecycle functions |
| Quote ACV | Import / manual / pricing matrix |
| Quote Target ACV | Derived from Company Tier |
| Quote ACV Gap | Formula / derived |
| Quote Contract Date Renewal | Formula / derived: End - 45 |
| Quote Days Remaining fields | Formula / derived |
| Deal Amount | Derived: sum non-Closed-Lost Quote ACV |
| Deal Contact | Derived from Quote Contact |
| Deal Stage | Derived from Contact × Deal workflow / Quote owner stage |
| Account rollup | processAccount |

## Pipeline vs Opportunity

Lead should include:

```text
Pipeline
```

Lead should not include:

```text
Opportunity
```

Opportunity on Deals is derived from Stage.

Recommended mapping remains:

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
