# Renewal Call 1 — Value Review & Renewal Conversation

## Objective
Initiate the renewal conversation, review the custom value delivered over the past term (duplicate accounts resolved, process hours saved), present renewal/expansion terms, and book a renewal review meeting.

## Call Script

### Opening (Warm & Account-focused)
"Hi `${Contacts.First_Name}`, this is `${User.First_Name}` calling from Jurnii. It's great speaking with you again!"

*(Wait for response)*

"I’m reaching out because `${Contacts.Account_Name}`’s current Jurnii agreement is up for renewal next month. 

I’d love to take 10 minutes to review the value your team has gotten—specifically, the thousands of duplicate accounts we resolved and the hours of manual entry saved—and outline our renewal options, including expansion packages for new departments. 

Are you open to a brief 15-minute review session next Tuesday or Wednesday morning?"

## Call Outcomes
- **Positive**: Renewal review scheduled. Create Event.
- **Neutral**: Interested in renewal, but busy to schedule immediately. Send `Renewal Email 1`.
- **No Answer**: Voicemail left. Send `Renewal Email 1`.
- **Negative**: Decided to churn. Set `Stage1` = `Lost` or create retention review Task.
