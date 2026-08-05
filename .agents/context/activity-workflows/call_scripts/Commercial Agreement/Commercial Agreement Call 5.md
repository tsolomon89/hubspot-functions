# Commercial Agreement Call 5 — Final Outbound Commercial Attempt

## Objective
Final phone check-in to confirm contract interest before removing the deal from the active outbound sales queue.

## Call Script
"Hi `${Contacts.First_Name}`, `${User.First_Name}` from Jurnii. I hope you're having a productive week."

*(Wait for response)*

"I just wanted to make one final call regarding the pending proposal for `${Contacts.Account_Name}`. 

We want to make sure we are respect your time. If this initiative has been postponed or is no longer a priority, I will pause my outreach and close out the proposal. Would you like to keep the discussion open, or should we archive the terms for now?"

## Call Outcomes
- **Positive**: Terms revived / agreed.
- **Neutral / No Answer**: Transition to Post-Call Email Chain 1. Send `Commercial Agreement Email 5`.
- **Negative**: Mark Lost.
