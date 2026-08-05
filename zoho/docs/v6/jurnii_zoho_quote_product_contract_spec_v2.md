# Jurnii Zoho Quote/Product Contract Spec v6

## Purpose
Define the current Product Quote contract model used by v6 automation.

## Product Evidence
- Activity modules cannot use Product multi-select lookups for the contract Product input.
- Tasks, Calls, and Events use multi-select picklists containing exact Product-name strings.
- `processDeal` resolves those strings to active Products by `Product_Name`, then `Product_Code`.
- Ambiguous or unresolved Product values create Manual Review and do not create a Product Quote.

## Product Quote Shape
| Location | Field | Rule |
| --- | --- | --- |
| Quote header | `Quote_Product` | Lookup to the single Product represented by the Quote. |
| Quote line | `Quoted_Items.Product_Name` | Must contain the same single Product as `Quote_Product`. |
| Quote header | `Opportunity_Type` | FTP or RTP, derived from the Deal floor. |
| Quote header | `Quote_Last_Deal_ID` | Marker used to detect Quote reassignment. |
| Quote header | `Quote_Applied_Activity_Keys` | Exact newline-delimited Activity keys. |

## Contract Data
- Brands and dates from an activity apply to the Quote/Quote line, not to Contact mirror fields.
- Blank incoming activity fields never erase existing nonblank Quote values.
- Confirmed Quotes require both contract start and end dates before term ledger and signed transition logic.
- Pricing failure is nonfatal: create the Quote, raise Manual Review, and avoid retry loops.

## Amount And Ledger
- Deal Amount is recomputed from non-Closed-Lost Quote totals.
- Confirmed and Closed Won Quotes can contribute to Initial/Current contract ledgers.
- Closed Lost Quotes are excluded from active Amount.
- Reopened Quotes trigger recompute and do not preserve stale totals.

## Workflow Model
- `WF021` is the final Quote create/edit workflow.
- `WF020` remains active only during staging and is disabled after the WF021 gates pass.
- `WF004` remains active only during staging as a safe legacy wrapper and is disabled after the WF021 gates pass.

## Retired Model
- Do not write Deal phantom fields: `Commercials_Sent_At`, `Signed_At`, `Commercials_Discussed_At`, or `Intent_To_Sign`.
- Use Quote ledger keys for activity idempotency.
- Activity input is Product names; `processDeal` owns Product resolution.
