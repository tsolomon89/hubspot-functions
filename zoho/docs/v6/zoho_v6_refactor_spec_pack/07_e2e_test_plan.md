# 07 — E2E Test Plan

All tests should use a unique E2E identifier and clean up records after execution.

## Test 1 — Product Interest creates Product Deal + Draft Quote

Input:

```text
Lead/Contact with Product Interest = Jurnii UX.
No quote values.
Decision Maker contact.
```

Expected:

```text
Account exists.
Contact exists.
UX Product Deal exists.
Deal name = Account Name - Jurnii UX.
Draft Acquisition Quote exists.
Quote Plan Products = Jurnii UX.
Quote Type = Acquisition.
Quote Stage = Draft.
Deal.Amount includes Draft Quote ACV if ACV exists.
```

## Test 2 — Two Product Interests create two Deals and two Quotes

Input:

```text
One Contact with Product Interest = Jurnii UX + Jurnii 360.
```

Expected:

```text
Two Product Deals.
Two Draft Acquisition Quotes.
No generic Account-level Deal.
No duplicate silencing.
Contact associated to both Deals.
```

## Test 3 — Product-scoped Contact Roles

Input:

```text
Contact A = UX interest.
Contact B = 360 interest.
Contact C = UX + 360 interest.
```

Expected:

```text
UX Deal has Contact A and C.
360 Deal has Contact B and C.
Not every Account Contact is attached to every Deal.
```

## Test 4 — Decision Maker activation gating

Input:

```text
Decision Maker Contact and End User Contact with same Product Interest.
```

Expected:

```text
Decision Maker gets automatic Sequence Activation Task.
End User does not get automatic activation task.
End User can still be manually activated.
```

## Test 5 — No Product Interest gating

Input:

```text
Lead/Contact with no Product Interest and no quote product evidence.
```

Expected:

```text
No Product Deal created.
Manual Review created.
No SQL/FTP progression.
```

## Test 6 — Acquisition Quote import

Input:

```text
Lead row with Acquisition Quote fields:
Quote Plan Products
Quote Plan Type
Quote Plan Brands
Quote Plan Frequency
Quote ACV
Contract Date Start/End
Quote Stage
```

Expected:

```text
Product Deal created.
Acquisition Quote populated from import.
Quote Type = Acquisition.
Quote.Contact set.
Deal.Contact mirrors Quote.Contact.
Deal.Amount includes Quote ACV unless Closed Lost.
```

## Test 7 — Acquisition Closed Won creates Renewal

Input:

```text
Acquisition Quote Stage = Closed Won.
```

Expected:

```text
Renewal Quote created.
Renewal Quote Type = Renewal.
Renewal_Window_Start = Contract Date End - 45 days.
Deal.Amount includes Acquisition + Renewal if Renewal has non-lost ACV.
No duplicate Renewal on repeated workflow fire.
```

## Test 8 — Confirmed does not act as signed

Input:

```text
Acquisition Quote Stage = Confirmed.
```

Expected:

```text
No signed lifecycle.
No Renewal generated solely because of Confirmed.
No commercial:signed transition.
Quote remains agreed/not-signed.
```

## Test 9 — Expansion Closed Won updates Renewal

Input:

```text
Existing Closed Won Acquisition with open Renewal Quote.
Expansion Quote becomes Closed Won with new terms.
```

Expected:

```text
Expansion starts new full-year term.
Renewal Quote updated to match Expansion terms.
No duplicate Renewal Quote created.
Deal.Amount includes all non-Closed-Lost Quote ACV.
```

## Test 10 — Renewal Closed Won creates next Renewal

Input:

```text
Existing Renewal Quote becomes Closed Won.
```

Expected:

```text
Next Renewal Quote created.
No duplicate next Renewal on repeated workflow fire.
Current/effective terms remain date-aware.
```

## Test 11 — Renewal Closed Lost churns Product Deal

Input:

```text
Only Product Deal's Renewal Quote becomes Closed Lost.
```

Expected:

```text
Product Deal becomes Lost.
Account becomes Lost only if no other Product Deal is open/active.
```

## Test 12 — Account remains open if another Product Deal exists

Input:

```text
UX Renewal Closed Lost.
360 Deal remains open/active.
```

Expected:

```text
UX Deal Lost.
360 Deal remains open.
Account remains open.
```

## Test 13 — Quote Contact controls Deal Contact

Input:

```text
Quote.Contact = Contact A.
Then open Renewal Quote.Contact changes to Contact B.
```

Expected:

```text
Deal.Contact initially Contact A.
Deal.Contact changes to Contact B when Renewal Quote becomes controlling/current workflow contact.
Contact B associated to Deal.
Historical Closed Won Quote Contact not rewritten.
```

## Test 14 — Parallel workflows for same Contact

Input:

```text
Same Contact on UX Deal and 360 Deal.
UX workflow = Demo Booking.
360 workflow = Commercial Agreement.
```

Expected:

```text
Workflow state is scoped by Contact × Deal.
Progression on UX does not overwrite 360 workflow state.
Progression on 360 does not overwrite UX workflow state.
```

## Test 15 — Activity product validation

Input:

```text
UX-only Contact attempts to mutate 360 Product Deal through activity.
```

Expected:

```text
Mutation blocked.
Manual Review created.
No Deal stage change.
No Quote change.
```

## Test 16 — Task with multiple Products

Input:

```text
Task evidence includes UX and 360.
```

Expected:

```text
UX Quote created/updated under UX Deal.
360 Quote created/updated under 360 Deal.
No multi-product Quote under one Deal.
```

## Test 17 — Duplicate open Quote prevention

Input:

```text
Two attempts to create open Renewal Quote for same Product Deal.
```

Expected:

```text
Existing Renewal Quote reused/updated.
No duplicate open Renewal Quote.
```

## Test 18 — Duplicate Product Deal prevention

Input:

```text
Two imports for same Account + Product.
```

Expected:

```text
One Product Deal.
Existing Deal reused.
No duplicate Product Deal.
```

## Test 19 — Closed Lost quote excluded from Deal.Amount

Input:

```text
Deal has Draft Quote ACV 10k and Closed Lost Quote ACV 20k.
```

Expected:

```text
Deal.Amount = 10k.
```

## Test 20 — E2E cleanup

Expected:

```text
All E2E Accounts, Contacts, Deals, Quotes, Tasks, Calls, Events, logs if applicable are removed or isolated after test.
```
