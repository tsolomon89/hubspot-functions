# Demo Hosted Call 1 — Gathering Commercial Requirements

## Objective
Follow up after the demo, gather additional commercial requirements (user counts, specific integrations, preferred payment terms), and prepare for sending commercial terms.

## Call Script

### Opening (Warm & Enthusiastic)
"Hi `${Contacts.First_Name}`, `${User.First_Name}` calling from Jurnii. It was great demonstrating the platform to you and the team yesterday!"

*(Wait for response)*

"I’m currently putting together the custom commercial terms we discussed for `${Contacts.Account_Name}` to hand off to our drafting team. 

To ensure the proposal is 100% accurate, I wanted to quickly verify:
- What is your expected initial user license count?
- Are there any specific legal or procurement guidelines we need to include in the drafting stage?"

### Next Steps
"Excellent. I will get our team to finish drafting the terms. We aim to have the proposal sent over by tomorrow. Once sent, it will start our formal terms review."

## Call Outcomes
- **Positive**: Requirements gathered. Update `Commercials_Status` = `Drafting` or `Ready to Send`.
- **Neutral**: Customer is interested but needs to confirm details internally. Send `Demo Hosted Email 1`.
- **No Answer**: Voicemail left. Send `Demo Hosted Email 1`.
- **Negative**: Decided not to move forward. Mark Lost.
