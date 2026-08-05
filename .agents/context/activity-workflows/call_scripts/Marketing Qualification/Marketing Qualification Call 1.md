# Marketing Qualification Call 1 — Qualification & Profiling

## Objective
Establish initial contact, verify details, obtain Marketing Qualification, and gather missing profile data (Company, Role, and Business Needs).

## Prep Checklist
- Verify contact name: `${Contacts.Full_Name}`
- Verify company: `${Contacts.Account_Name}`
- Identify missing fields: Email, Role, and preferred products.

## Call Script

### Opening (Warm & Professional)
"Hi `${Contacts.First_Name}`, this is `${User.First_Name}` calling from Jurnii. How are you doing today?"

*(Wait for response)*

"Great. I noticed you recently engaged with our platform, and I wanted to reach out briefly to ensure we have the correct details to customize your experience. Do you have two minutes to verify a few details?"

### Qualification & Data Collection
"First, I see your company listed as `${Contacts.Account_Name}`. To make sure we route any relevant technical guides or updates correctly:
1. What is your current job title or role there?
2. What are the key areas or products you're looking to optimize or explore with Jurnii right now?"

### Obtaining Consent (Crucial Step)
"Excellent, thank you. To keep you updated on new features, industry benchmark reports, and product guides tailored to your interests, do I have your consent to send you these communications via email?"

*(If Yes: Stamp `Marketing_Consent_Status` = `Consented`)*
*(If No: Stamp `Marketing_Consent_Status` = `Not Consented`)*

### Closing
"Perfect, thanks `${Contacts.First_Name}`. That’s all I needed. Have a wonderful rest of your day!"

## Call Outcomes (Rep Guide)
- **Positive**: Customer consented AND provided missing details.
- **Neutral**: Customer was busy but didn't object; or customer answered but did not consent yet.
- **No Answer**: Voicemail left (if active) or call hung up.
- **Negative**: Customer requested no further calls.
