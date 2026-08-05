# Demo Booking Call 1 — Scheduling a Tailored Demo

## Objective
Establish contact, qualify the company's pain points, present the value of a live demonstration, and book a demo meeting.

## Call Script

### Opening (Value-led & Engaging)
"Hi `${Contacts.First_Name}`, this is `${User.First_Name}` calling from Jurnii. I hope your day is going well."

*(Wait for response)*

"I’m reaching out because several operations and engineering teams at `${Contacts.Account_Name}` have recently explored Jurnii to resolve scheduling, data consistency, and process automation issues. 

Typically, companies see a 40% reduction in duplicate data errors within the first month. I wanted to see if you would be open to a brief, 15-minute tailored walk-through of the platform this week?"

### Handling the Demo Pitch
"We’ll show you exactly how we map your active records and streamline manual checks. How is your calendar looking for this Thursday or Friday morning?"

## Call Outcomes
- **Positive**: Customer agreed to a demo. Set `Demo_Outcome` = `Scheduled` / create Event.
- **Neutral**: Customer was interested but not ready to book; or asked for more email details. Send `Demo Booking Email 1`.
- **No Answer**: Voicemail left. Send `Demo Booking Email 1`.
- **Negative**: Customer not interested. Move Deal to Lost.
