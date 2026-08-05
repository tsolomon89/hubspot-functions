# Onboarding Call 1 — Launching Technical Configuration

## Objective
Establish technical setup readiness, guide the customer through the initial portal login, review database connection credentials, and launch setup.

## Call Script

### Opening (Warm & Operational)
"Hi `${Contacts.First_Name}`, this is `${User.First_Name}` calling from Jurnii. It's great to connect today for our onboarding kickoff!"

*(Wait for response)*

"I’m reaching out to guide `${Contacts.Account_Name}` through the initial platform configuration. 

Let's make sure we have:
1. Your admin login to the secure Jurnii portal.
2. The sandbox or database connection parameters we’ll need to link your CRM records.

Are you logged in right now, or should we walk through the setup together?"

### Guided Setup
"Perfect. Let's start by navigating to Setup → Database and mapping `${Deals.Deal_Name}`’s custom parameters. This will verify our connection instantly."

## Call Outcomes
- **Positive**: Setup completed or in progress. Set `Stage1` = `Onboarding` / create verification Task.
- **Neutral**: Customer was busy or did not have credentials ready. Send `Onboarding Email 1`.
- **No Answer**: Voicemail left. Send `Onboarding Email 1`.
- **Negative**: Blocked technically. Create data repair/support Task.
