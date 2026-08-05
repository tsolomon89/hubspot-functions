# Renewal Call 5 — Final Outbound Renewal Check-in

## Objective
Final phone attempt to secure a renewal conversation before the agreement expiration and possible service suspension.

## Call Script
"Hi `${Contacts.First_Name}`, `${User.First_Name}` from Jurnii. I hope you're having a productive week."

*(Wait for response)*

"This is my final check-in regarding `${Contacts.Account_Name}`’s upcoming renewal. 

We want to make sure you have no interruption to your active sync and duplicate account lookups. If you have decided not to renew, please let me know so we can coordinate database detachment safely. Otherwise, would you like to schedule a slot to finalize the renewal terms?"

## Call Outcomes
- **Positive**: Renewal conversation resumed.
- **Neutral / No Answer**: Transition to Post-Call Email Chain 1. Send `Renewal Email 5`.
- **Negative**: Mark Churned / Lost.
