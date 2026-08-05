# Demo Confirmation Call 1 — No-Show recovery call script

## Objective
Establish contact after a demo no-show, understand the reason, reschedule the demo, and protect future attendance.

## Call Script

### Opening (Empathetic & Solution-Focused)
"Hi `${Contacts.First_Name}`, this is `${User.First_Name}` calling from Jurnii. I hope everything is alright on your end."

*(Wait for response)*

"We had a brief, 15-minute tailored demo scheduled for `${Contacts.Account_Name}` earlier today, and I wanted to check in since we missed you. 

I know how hectic things get in operations. Would you be open to quickly finding a slot to reschedule for next week? It takes just 15 minutes, and we'll show you exactly how Jurnii automates duplicate account cleanups."

### Handling Rescheduling
"How is `${Contacts.Account_Name}`'s calendar looking for next Tuesday morning or Wednesday afternoon? We can easily get you back on the schedule."

## Call Outcomes
- **Positive**: Rescheduled successfully. Create new Event, set `Demo_Outcome` = `Rescheduled`.
- **Neutral / No Answer**: Send `Demo Confirmation No-Show Email`. Create next attempt/email chain step.
- **Negative**: Customer cancelled project. Mark Lost.
