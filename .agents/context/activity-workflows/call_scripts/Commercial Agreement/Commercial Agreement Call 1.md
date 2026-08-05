# Commercial Agreement Call 1 — Initial Terms Review

## Objective
Confirm receipt of the commercial proposal, answer initial questions, address any immediate objections, and establish the review timeline.

## Call Script

### Opening (Professional & Direct)
"Hi `${Contacts.First_Name}`, this is `${User.First_Name}` calling from Jurnii. I hope you're having a great day."

*(Wait for response)*

"I’m reaching out to confirm you received the formal Jurnii proposal I sent over for `${Contacts.Account_Name}` yesterday? 

I wanted to make sure you had a chance to open it and check if you or your operations team had any initial questions regarding the licensing, scope of work, or pricing?"

### Addressing Objections & Setting Timeline
"Perfect. Since we want to ensure a smooth transition once we launch, who else on your finance or legal team will need to review these terms? 

Should we schedule a brief 10-minute call next week to finalize any modifications before signature?"

## Call Outcomes
- **Positive**: Terms agreed/ready for signature. Set `Commercials_Status` = `Intent to Sign`.
- **Neutral**: Terms received, review is in progress. Send `Commercial Agreement Email 1`.
- **No Answer**: Voicemail left. Send `Commercial Agreement Email 1`.
- **Negative**: Rejected terms. Move to Lost.
