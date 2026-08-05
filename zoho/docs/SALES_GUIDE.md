# Jurnii Sales System — SDR & AE Guide

**How to use and maintain the Zoho CRM automation.**

This is your working manual. It explains what the system does for you, what *you* do at
each step, and — just as importantly — what you should **never** touch because the
automation owns it. Everything here matches how the system actually behaves today.

> **The one-sentence mental model:** you work *Contacts* and log *activities* (calls,
> meetings, tasks); the automation builds and maintains everything else — Accounts,
> Deals, Quotes, amounts, stages, and the outreach emails.

---

## Contents

1. [What the system does for you](#1-what-the-system-does-for-you) · [Quick start](#quick-start--a-lead-just-landed)
2. [The pipeline: stages and what they mean](#2-the-pipeline-stages-and-what-they-mean)
3. [How records connect](#3-how-records-connect) · [Imports](#when-a-list-is-imported) · [Partnership deals](#partnership-deals)
4. [Starting outreach — the Sequence Activation task](#4-starting-outreach--the-sequence-activation-task)
5. [Working a sequence day to day](#5-working-a-sequence-day-to-day)
6. [Emails: what sends automatically](#6-emails-what-sends-automatically)
7. [Quotes, pricing, and Deal amount](#7-quotes-pricing-and-deal-amount)
8. [Winning, losing, and renewals](#8-winning-losing-and-renewals)
9. [Manual Review tasks — reading and clearing them](#9-manual-review-tasks--reading-and-clearing-them)
10. [Field cheat-sheet: what you set vs. what you never touch](#10-field-cheat-sheet-what-you-set-vs-what-you-never-touch)
11. [Maintaining the system (admin)](#11-maintaining-the-system-admin)
12. [Troubleshooting & FAQ](#12-troubleshooting--faq)
- [Appendix A — field names (Zoho label ↔ API name)](#appendix-a--field-names-zoho-label--api-name)

---

## 1. What the system does for you

When a lead arrives (form, import, referral, manual add), the automation:

- **Converts it** into a Contact and files it under the correct **Account** (deduplicated
  by website domain, then email domain, then company name — so you don't get duplicate
  companies).
- **Creates a Deal for each product** the person is interested in. If someone wants two
  products, you get two Deals. This is normal and correct.
- **Links products, sets the stage, and creates a Quote** for each Deal.
- **Asks you to start outreach** by dropping a *Sequence Activation* task in your queue.
- Once you activate, it **runs the email cadence, schedules your follow-up calls, sends
  demo reminders, prepares draft quotes, and advances the stage** as you log outcomes.

You are never expected to hand-build a Deal, calculate an amount, or write a stage into a
record. If you find yourself doing that, stop — something upstream needs fixing instead
(see [Manual Review](#9-manual-review-tasks--reading-and-clearing-them)).

### Quick start — a lead just landed

1. A **Contact + Account** appear automatically, plus **one Deal per product of interest**.
   You don't create these.
2. Check your tasks for a **Sequence Activation** task (raised for decision-makers). Open
   it, set **`Task_Sequence_Type`** = `Email` / `Call` / `Manual`, optionally add a
   `warm` / `cold` note, and set **`Task_State = Won`** to start outreach (§4).
3. Work the activities the system creates: log each **Call** (`Call_Task_State`),
   book/run the **Demo** (`Meeting_Task_State`), complete **Tasks** (`Task_State = Won`).
   The stage advances as you go (§5).
4. At **Proposal Preparation**, complete **Draft Commercials**, then **Send Commercials**
   (this marks the Quote *Delivered* and moves you to Commercial Agreement).
5. On signature, set the Quote to **Closed Won** — the Deal crosses into **Onboarding** and
   the signed-confirmation email goes out.
6. If a **Manual Review** `[code]` task appears, fix the flagged field and complete it (§9).

Never hand-edit Amount, State, Status, or stage — the automation owns them (§10).

---

## 2. The pipeline: stages and what they mean

There are **two pipeline fields** on every Deal, and they move together:

- **Opportunity Type** — the coarse bucket: **MQL → SQL → FTP → RTP**. In Zoho this is the
  field labelled **"Opportunity Type"** (its API name is `Stage`).
- **Stage** — the fine-grained step you actually work. In Zoho this is the field labelled
  **"Opportunity Stage"** (its API name is `Opportunity_Stage`).

> ⚠️ **Mind the names.** The field you see labelled **"Opportunity Type"** has the API
> name `Stage`, and the field labelled **"Opportunity Stage"** has the API name
> `Opportunity_Stage`. This guide writes API names in `code font`; **[Appendix A](#appendix-a--field-names-zoho-label--api-name)**
> maps every one to the label you actually see in Zoho.

| # | Stage | Bucket | What it means | What you do here |
| --- | --- | --- | --- | --- |
| 1 | **Marketing Consent** | MQL | Top-of-funnel. A qualified-interest conversation (despite the name, it is *not* a request for email permission). | Open the conversation. Book a demo. |
| 2 | **Demo Booking** | SQL | You're trying to get a walkthrough on the calendar. | Book the demo. |
| 3 | **Demo Confirmation** | SQL | A demo is on the calendar. | Confirm attendance; the system sends confirmation + reminder. |
| 4 | **Demo Hosted** | SQL | The demo slot has come (or been missed). | Run the demo, or recover a missed one. |
| 5 | **Proposal Preparation** | FTP | Post-demo; you're preparing the commercial proposal. | Build the draft quote (task-driven). |
| 6 | **Commercial Agreement** | FTP | Proposal is out; you're negotiating to a signature. | Send commercials, negotiate, close. |
| 7 | **Onboarding** | RTP | Signed. The customer is being onboarded. | Onboarding setup. |
| 8 | **Renewal** | RTP | Existing customer approaching renewal. | Work the renewal. |

**Key rules:**

- **Stages only move forward.** The automation never lets a stage regress. Once a Deal is
  signed (RTP floor), later low-stage activity can't pull it backward.
- **"Marketing Consent" is stage 1's real name.** You may see a field called
  `…Marketing_Qualification_Completed_At` — that's a legacy field name, not a second
  stage. There is no separate "Marketing Qualification" stage.
- **The Deal's stage comes from the furthest-along open Contact** under the Account. If a
  more senior contact is further ahead, the Deal follows them.

---

## 3. How records connect

```
Lead (intake only)
  └─ converts to ─► Contact ───┐
                               ├─ filed under ─► Account (one per real company)
                               │
       one Deal per product ─► Deal  (Account × Product)
                                 └─ has ─► Quote (one per product, priced)
```

- **One Account per company.** Duplicates are auto-detected and merged onto the canonical
  Account. Don't create a second Account for the same company by hand.
- **One Deal per product, per Account.** If you see `(Duplicate)` appended to a Deal name
  and it's Closed as *Duplicate / Test Record*, the system silenced a redundant Deal —
  that's expected.
- **Contacts are linked to Deals with a Role** (Decision Maker > End User > Influencer),
  derived from job title. The most senior open contact becomes the Deal's **primary
  contact**.
- **Multiple contacts, one Account.** Several people at the same company all land under one
  Account and are attached to the relevant Deals automatically.

### When a list is imported

- Each row becomes **one Contact** under its Account (deduped by domain, then name), plus
  **one Deal per product of interest**, each with a Quote. Leads **always convert** —
  missing enrichment data never blocks it.
- Product Interest values must be **exact catalogue names** (see §7 / Appendix A) or you'll
  get `[product_unresolved]` reviews.
- If a row carries an **existing contract** (imported ACV / dates / plan), those *bootstrap*
  the Quote and the **imported value is authoritative** — the catalogue price is only a
  benchmark, and a mismatch raises an informational `[imported_acv_variance]` review rather
  than overriding the real number.
- **Imports don't send email.** Outreach still waits on activation (§4), so a bulk import
  never blasts a sequence on its own.

### Partnership deals

Products in the **Partnership** pipeline create *Partnership* Deals, not B2B ones. The
automated B2B sequence and cadence emails **do not run** on them — they're held, and no
Sequence Activation task is raised. Track and progress partnership opportunities manually.

---

## 4. Starting outreach — the Sequence Activation task

**This is the single most important thing you do.** Nothing is emailed and no cadence runs
until a human activates the sequence. The system will not guess for you.

### How it appears

For a **Decision-Maker** contact with exactly **one** B2B Deal, the automation creates a
task named:

> **Activate sequence: {Contact Name} — {Stage}**

The task Description explains the choice. It sits in your queue and **blocks** the sequence
until you complete it.

> **Who counts as a Decision Maker?** The role is inferred from the contact's **job title**.
> A recognised senior title maps to Decision Maker; a title that matches nothing in the map
> but *isn't blank* also defaults to Decision Maker (so it will get an activation task); a
> genuinely blank title is treated as non-Decision-Maker and gets no auto-activation.

### How to activate

On the activation task, set two things:

1. **`Task_Sequence_Type`** — choose the route:
   - **`Email`** — sends the stage's opener email now and schedules your follow-up Call 1.
   - **`Call`** — creates your first Call; no opener email.
   - **`Manual`** — you'll manage this contact by hand; automated dispatch stops.
2. **`Task_State` = `Won`** — this is the *commit*. Setting the route alone does nothing;
   setting `Task_State = Won` is what actually activates.

Optionally, add a **Note** on the task with a single word to pick the opener tone:

- **`warm`** — an already-familiar contact; more direct opener.
- **`cold`** — a contact who engaged before and went quiet; a reconnect opener.
- *(no note)* — treated as a brand-new first-contact opener.
- Anything ambiguous (e.g. "warm/cold") → the system reopens the task and raises a review
  rather than guessing.

Once committed, `Sequence_Activated_At` is stamped and outreach begins. **That timestamp is
the master proof of activation** — until it's set, no email can go out, ever.

### Why it sometimes *doesn't* appear automatically

- The contact isn't a **Decision Maker** → no auto-activation task (by design).
- The contact has **more than one** B2B Deal → you get a *review* task instead, so you can
  pick which product's sequence to run (the system never auto-picks).
- The Deal is **Partnership** or its product is unresolved → no sequence (Partnership deals
  don't run the B2B cadence).

---

## 5. Working a sequence day to day

You drive the sequence by **logging outcomes on activities**. Each activity type has **one
command field** you set — the automation reads it and does the rest.

### Logging a Call (`WF006`)

On a sequenced Call, set **`Call_Task_State`**:

| You set | The system does |
| --- | --- |
| **`Won`** (connected, positive) | Advances the Contact one stage, supersedes stale calls, sets up the next step. |
| **`Open`** with a **`Next_Follow_Up_Date`** | Reschedules the call for that date. |
| **`Lost`** + **`Call_Task_Lost_Reasons`** | Routes by reason (see [loss handling](#8-winning-losing-and-renewals)). Blank reason → the call reopens with a review. |

If the call produced commercial detail, fill the **`Call_Task_Contract_Products`**
multiselect (plus `_Brands`, `_Date_Start`, `_Date_End`, `_Frequency`) — this feeds the
Quote. Product values **must exactly match** the catalogue names (see §7).

### Booking and running a Demo (`WF007`)

Demos live on **Meetings/Events**. Set **`Meeting_Task_State`** and use
**`Meeting_Task_Stage`** to signal the meeting type:

- **Book a demo** → creating the meeting advances the Contact to **Demo Confirmation** and
  the system sends a confirmation email + schedules a reminder (1 business day before).
- **Demo attended** (`Won`) → advances toward Proposal Preparation (post-demo follow-up).
- **Demo booked but didn't happen** — mark the meeting `Lost` with reason **`No Meeting /
  Demo`**. The Contact **stays at Demo Hosted** and runs the 5-step **Demo Hosted recovery**
  cadence to re-hold it (the copy never claims the demo happened). It does *not* revert a
  stage. *(This is the correct way to handle a no-show — use `No Meeting / Demo`.)*
- **Demo Lost for any other reason** (e.g. `No Authority`, `Invalid / Bad Data`,
  `Duplicate / Test Record`) → routes per the loss table in §8 (find a decision maker, data
  repair, suppress, or a review). It doesn't revert the stage or close the Deal by itself.
- Commercial/renewal meetings (higher stages) route through `processDeal` and update the
  Quote/ledger. Like commercial tasks, a Won commercial meeting can **bounce back open with
  a review** if the quote package isn't ready — the demo itself never signs the deal; the
  Quote does.

### Completing Tasks (`WF008`)

Task-driven stages (Proposal Preparation, Onboarding) and commercial steps use Tasks. Set
**`Task_State = Won`** to complete them. The ones you'll see:

| Task type | What completing it does |
| --- | --- |
| **Draft Commercials** | Builds the Draft Quote package (priced from the catalogue) and then surfaces a **Send Commercials** task. Stays at Proposal Preparation. |
| **Send Commercials** | Validates the quote package, marks the Quote **Delivered**, and advances the Contact to **Commercial Agreement**. |
| **Onboarding Setup** | Completes the sequence (customer is onboarded). |
| **Data Repair / Review Reply / Enrichment** | Housekeeping — resumes the sequence when done. |

> If a commercial task **bounces back open** with a review attached, a gate failed (e.g. the
> quote wasn't ready). Read the review, fix the cause, and complete it again.

---

## 6. Emails: what sends automatically

**You do not send cadence emails by hand — the automation does.** One function
(`sendSequencedEmail`) owns every automated send, using pre-written Zoho templates in the
Jurnii voice.

### Cadence families (5 steps each)

`Marketing Consent`, `Demo Booking`, `Demo Hosted` (recovery), `Commercial Agreement`,
`Renewal`. Step 1 is the activation opener (warm/cold/new variant), steps 2–4 are sent when
a call doesn't connect, step 5 is the scheduled post-call email. Follow-up calls and the
post-call email are spaced roughly **2 business days** apart.

### Single-shot event emails

Demo confirmation, demo reminder, post-demo follow-up, proposal-sent, and the
**signed-confirmation** email (sent once when a Deal first crosses into Onboarding).

### What happens when a contact engages with an email

Engagement events don't advance the stage — they interrupt *you*, not the automation:

- **Reply** → the automation raises a **Review Reply** task and marks that email done. A
  reply is **not** treated as automatically positive — *you* read it and decide the next
  move. **The cadence pauses until you clear that task** (see the blocking-task note in §9).
- **Bounce** → a **Data Repair** task, and the Contact is flagged *Needs Enrichment*.
- **Opened / clicked** → logged only; no task, no stage change.
- **No reply in the window** → recorded quietly as a per-email non-response; it only
  escalates to a lost contact if the whole sequence has already finished.

### The send gates (why an email might *not* go out)

Every send must pass **all** of these, or it's skipped (and often logged as a review):

1. **Not already sent** (idempotent — the same email never double-sends).
2. **Sequence activated** — `Sequence_Activated_At` must be set.
3. **Contact has an email address** (no-recipient guard).
4. **B2B pipeline** — Partnership and unresolved-product Deals are blocked.
5. **Template resolves.**
6. For scheduled/date-based emails: **`Deal.Automation_Suppressed` is not true**.

If a contact "isn't getting emails," walk this list top to bottom — it's almost always
#2 (never activated) or #6 (Deal suppressed).

> **Consent is not a send gate here.** Automated B2B pipeline emails send subject to
> activation, recipient-email, pipeline, suppression, and existing safety controls.
> `Marketing_Consent` is **not** a sales-email permission field — it records affirmative
> consent for general marketing or promotional campaigns, and is checked or blank. A blank
> checkbox does **not** block these sales/pipeline/operational emails. Only a future
> general-marketing sender should require `Marketing_Consent == true`. See §11.

---

## 7. Quotes, pricing, and Deal amount

### Every Deal has a Quote

The system creates at least a **Draft** scaffold Quote for every open Product Deal (once its
product is resolved), so a Deal never sits without a Quote. As you progress, the Quote moves
through stages:

`Draft → Negotiation → Delivered → Confirmed → Closed Won` (or `Closed Lost` / `On Hold`).

- **Confirmed** = terms agreed but **not yet signed**. Requires both contract dates.
- **Closed Won** = **signed**. This is the only stage that stamps a signed date and counts
  as a win.
- You (or the commercial tasks) move Draft → Negotiation → Delivered. Confirmed/Closed
  stages reflect the real commercial event.

### Pricing (how a Quote line is priced)

Pricing is a **banded matrix** by product, plan type, and number of brand-markets:

| Product | Priced by | Notes |
| --- | --- | --- |
| **Jurnii UX** (Fixed / Flex) | Brand bands: 5, 7, 10, 15, 20, 50, 100 | Auto-priced. |
| **Jurnii 360** (Fixed / Flex) | Frequency (`4x` / `2x` / `1x` per day) × brand bands 5, 10, 20, 50 | Needs frequency, or it can't price. |
| **Jurnii Cortex** | — | **Not auto-priced** — always raises a review for manual pricing. |

**ACV = price-per-brand × brand-markets**, rounded to 2 decimals. The band sets the
volume-discounted per-brand rate; the actual market count is the multiplier (e.g. 8 markets
falls in the "10" band → `1,848 × 8 = 14,784.00`). If the automation can't price a line
(missing brand count, missing frequency, or Cortex), it **leaves the line unpriced and
raises a Manual Review** — it never invents a number.

> **Pricing tier.** Each band also carries a tier — **Base** (the default), **Markup**, or
> **Agency** — on the quote line (`Quoted_Item_Pricing_Tier`). For **Jurnii UX** and
> **Jurnii 360 4×/day**, Markup and Agency price higher than Base; for **Jurnii 360 2×/day
> and 1×/day** all three tiers currently price the same. If a UX quote total looks higher
> than the Base figures above, check the tier.

### How `Deal.Amount` is set (never edit it by hand)

The automation computes Amount in this priority:

1. **Lost** → `0`.
2. **Has priced, open quotes** → the **sum of those quote totals** (the real number).
3. **Open, pre-contract (MQL/SQL/FTP), no priced quote yet** → the **Target ACV** benchmark
   from Company Tier (Tier 1 = 26,000 / Tier 2 = 16,500 / Tier 3 = 10,500) as a pipeline
   estimate.
4. **Open renewal with no quote** → `0` + a review (a renewal's value must come from a real
   renewal quote).

> **Target ACV is a benchmark, not a price.** It's only used as a *pipeline estimate* for
> early-stage deals with no quote yet. A product's list price is **never** summed into
> Amount.

---

## 8. Winning, losing, and renewals

### Deals are never "Won"

A Deal's **State** is only ever **`Open`** or **`Lost`**. Winning a gate doesn't close the
Deal as Won — it advances it to the next motion. The "win" lives on the **Quote**
(`Closed Won`) and in the advance into **Onboarding**. Don't look for a "Won" deal state;
look for the Onboarding/Renewal stage and a Closed Won quote.

### State & Status quick reference

- **State** = `Open` (working) or `Lost` (closed unsuccessfully).
- **Status** = `New` (no real activity), `Working` (you've logged a call/meeting/task/note),
  or `Closed` (only when Lost). *Automated emails do not make a Deal `Working` — only human
  activity does.*

### Loss is always local

Marking one **call, meeting, or task** as Lost does **not** close the Deal. Loss routes by
reason:

| Lost reason | What happens |
| --- | --- |
| `No Response` | Continues the cadence (or, if exhausted, marks the contact lost). |
| `No Authority` | Creates a "find the decision maker" task. |
| `No Fit` / `No Commercial Interest` / `No Budget` | Raises a Manual Review. |
| `Terms Rejected` / `Churned / Did Not Renew` | Closes the Deal **only** at the final commercial step; otherwise a review. |
| `Invalid / Bad Data` | Creates a Data Repair task. |
| `Duplicate / Test Record` | Suppresses the record. |
| `No Meeting / Demo` | Continues the demo cadence, or a review. |

A **Deal** closes only when **all** its contacts are Lost (or an explicit Deal-level loss),
or when a **Renewal quote is Closed Lost** (churn).

### Renewals happen automatically

When an **Acquisition** quote is **Closed Won**, the system creates a **Renewal** quote
rolled forward one year, with a chase date **45 days before** the contract ends. Expansion
wins bump the renewal's value; a renewal win rolls the next renewal. You work renewals like
any other stage.

---

## 9. Manual Review tasks — reading and clearing them

When the automation hits something it refuses to guess, it creates a **Manual Review** task
whose subject starts with a bracketed `[code]`. This is a feature: it surfaces the exact
problem instead of silently doing the wrong thing.

Common codes and what they mean:

| Code | Meaning | How you clear it |
| --- | --- | --- |
| `[product_unresolved]` / `[product_key_unresolved]` | A product name didn't match the catalogue. | Fix the product value to an exact catalogue name (see §7 / Appendix A). |
| `[quote_product_mismatch]` | More than one product resolved on one Deal, or the quote's product doesn't match. | Correct the product on the activity/quote so it's unambiguous. |
| `[multi_product_sequence_ambiguous]` | The contact has >1 B2B Deal; the system won't pick which to sequence. | Choose the right Deal and activate its sequence. |
| `[pricing_unavailable]` | Couldn't price a line from the catalogue (Cortex, or a missing brand count / frequency). | Add the missing detail, or price the quote by hand. |
| `[pricing_from_imported_acv]` / `[imported_acv_variance]` | An imported contract value was used, or differs from the catalogue benchmark. | Informational — confirm the imported value is right. |
| a **"could not be auto-priced"** review | A line couldn't be priced (Cortex, or a missing brand count / frequency) and was left unpriced. *(Free-text subject, not a bracketed code.)* | Add the missing detail, or price the quote by hand. |
| `[conflicting_opening_variant]` | The activation note said both warm and cold. | Set a single clear `warm`/`cold` note and re-activate. |
| `[contract_product_conflict]` | Product Interest clashes with the imported contract's plan type. | Reconcile the product vs plan type on the import. |
| `[rtp_missing_commercial_evidence]` / `[renewal_date_invalid]` / `[target_acv_unresolved]` | An open renewal has no valid renewal quote, dates, or ACV to value it. | Add/confirm the renewal quote, its dates, and its value. |
| `[quote_write_failed]` / `[quote_post_write_verification_failed]` | A quote couldn't be saved or verified after writing. | Usually transient — re-trigger the activity; if it persists, escalate to an admin. |
| `[activity_relationship_mismatch]` | A call/meeting/task isn't linked to the right Contact + Deal. **The activity made no changes** until it's re-linked. | Re-link the activity to the correct Contact and Deal, then re-save. |
| `[draft_commercials_*]` / `[send_commercials_*]` | The quote package wasn't ready when a commercial task ran. | Read the note, fix the quote/products, then complete the task again. |

*(Codes are open-ended: any other `[bracketed_code]` you see names its own problem. The
subject text always spells out what to fix. There is **no** `[company_tier_conflict]` — a
Lead/Deal tier difference is reconciled silently, with the Account's tier always winning.)*

> **Blocking tasks pause the cadence.** An open **Manual Review**, **Review Reply**, or
> **Draft/Send Commercials** task **freezes the Contact's sequence** until it's closed —
> nothing advances and no follow-ups fire. Clear these promptly, or outreach silently
> stalls.

**Rule of thumb:** fix the *cause* (the field the automation couldn't read), then complete
the review task. The next automation run picks up the corrected data.

---

## 10. Field cheat-sheet: what you set vs. what you never touch

This section uses **API names** (`code font`). To find the field in Zoho, see the label in
**[Appendix A](#appendix-a--field-names-zoho-label--api-name)** — for most fields the Zoho
label is just the API name with underscores replaced by spaces (e.g. `Call_Task_State` →
"Call Task State"); the Deal pipeline fields are the exceptions.

### ✅ Fields you set (the command surface)

| Where | Field | Purpose |
| --- | --- | --- |
| Activation Task | `Task_Sequence_Type` + `Task_State=Won` | Start the sequence (Email/Call/Manual). |
| Activation Task | Note = `warm` / `cold` | Opener tone. |
| Call | `Call_Task_State` (Won/Open/Lost) | Log the call outcome. |
| Call | `Call_Task_Lost_Reasons`, `Next_Follow_Up_Date` | Loss reason / reschedule. |
| Call | `Call_Task_Contract_Products` (+ Brands/Dates/Frequency) | Commercial detail → Quote. |
| Meeting | `Meeting_Task_State`, `Meeting_Task_Stage`, `Meeting_Task_Lost_Reasons` | Demo/commercial outcome. |
| Task | `Task_State` (Won/Lost), `Task_Lost_Reasons` | Complete/lose a task. |
| Quote | `Quote_Stage` | Move Draft → Negotiation → Delivered; reflect Confirmed/Closed Won/Lost. |
| Contact | `Marketing_Consent` (checkbox) | Records affirmative *general-marketing* consent (checked or blank). **Not** a sales-email gate — see §11. |

### ⛔ Fields the automation owns — do **not** edit by hand

`Deal.Amount` · `Opportunity_State` (State) · `Opportunity_Status` (Status) · `Stage`
(Opportunity Type) · all `Contract_*` ledger fields (ACV, dates, plan) · all `Sequence_*`
fields · all `*_Completed_At` timestamps · `Deal_Key` / `Deal_Product_Key` ·
`Product_Interest_Staging` (a read-only formula).

Editing these either gets overwritten on the next run or breaks the loop-prevention rules.

---

## 11. Maintaining the system (admin)

For team leads / admins keeping the system healthy.

### Kill switch

Set **`Deal.Automation_Suppressed = true`** to stop *all* automation on a specific Deal
(useful for a sensitive/manual deal or to halt a misfire). Everything except direct manual
edits stops until you set it back.

### Consent

`Contacts.Marketing_Consent` is a two-state checkbox (checked or blank) that records
**affirmative consent for general marketing / promotional campaigns only**. It is **not**
a permission field for sales or pipeline email:

- Automated B2B pipeline emails — every cadence and event email in this system — send
  subject to activation, recipient-email, pipeline, and suppression controls; they are
  **not** gated by `Marketing_Consent`. A blank checkbox does not block them.
- `Marketing_Consent` records affirmative consent for general marketing or promotional
  campaigns. It is checked or blank — there is no separate "declined" state.
- Only a future general-marketing / promotional sender should require
  `Marketing_Consent == true`.
- Affirmative consent is **carried from the Lead** (`Leads.Contact_Marketing_Consent`) onto
  a blank Contact field during conversion: a genuine `true` is preserved, a blank Lead
  leaves the Contact blank, and conversion never fabricates or clears consent. Forms,
  imports, API submissions, or manual edits may also set the Contact field directly.

There is **no unsubscribe/preference footer** in the automated templates — if compliance
requires one, it must be added to the templates. Any existing unsubscribe, opt-out,
invalid-address, or do-not-contact suppression remains authoritative where implemented.

### Product catalogue must match exactly

Activity product picklists (`*_Contract_Products` on Calls/Meetings/Tasks) must contain
product names that **exactly match active Products**, or the automation raises a
`[product_unresolved]` review. The variant SKU names used on activities are:

`Jurnii 360 - Fixed` · `Jurnii 360 - Flex` · `Jurnii UX - Fixed` · `Jurnii UX - Flex` ·
`Jurnii Cortex - Fixed` · `Jurnii Cortex - Flex`

**There are two resolution layers, so keep both consistent:**
- The **activity** path matches those exact SKU names against active Products.
- The **import / pricing / lifecycle** path keys off the canonical *name-only* families —
  `Jurnii UX`, `Jurnii 360`, `Jurnii Cortex` — plus a plan type (`Fixed`/`Flex`) and, for
  360, a frequency. It rejects plan-variant-only records.

Keep these picklists in sync with the `Products` module. Deactivated / variant-only products
that the resolver rejects should not appear as selectable options.

### Publishing changes

- **Deluge functions are published by hand** in the Zoho UI — the integration cannot push
  source. After editing a function in this repo, an admin must paste and publish it live.
  **Don't treat repo code as live until it's published.**
- **Email templates** are editable in place (via the Zoho template API / UI). All 41
  automated templates have been rewritten in the Jurnii voice and published.
- **New required fields must exist in Zoho *before* the function that reads them is
  published** — the activation gate "fails closed," so a missing field silently blocks
  sends.

### Loop prevention (why some fields are off-limits)

Workflows must only trigger on **source fields** a human edits, never on fields the
automation writes (Amount, State, Status, computed stage, ledger). Triggering on a
calculated field creates infinite loops. This is why §10's "never touch" list exists.

---

## 12. Troubleshooting & FAQ

**"My contact isn't getting any emails."**
Check, in order: (1) Is the sequence activated? (`Sequence_Activated_At` set — did you
complete the activation task with `Task_State = Won`?) (2) Does the contact have an email?
(3) Is `Automation_Suppressed` on the Deal? (4) Is it a Partnership/unresolved-product
Deal? *(Note: `Marketing_Consent` does **not** gate sales/pipeline email — a blank consent
checkbox is never the reason — see §6/§11.)*

**"There are three Deals for one company — is that a bug?"**
No. A Deal is per product. Three products of interest = three Deals. Only same-product
duplicates get silenced as `(Duplicate)`.

**"The Deal Amount looks wrong / is 0."**
Amount is computed (§7). A `0` usually means: Lost; an open renewal with no renewal quote;
an early-stage Deal whose Account has **no Company Tier** (no benchmark — this raises a
review); or simply no priced quote yet. Check the Quote and any Manual Review.

**"I set the stage back a step and it jumped forward again."**
Stages don't regress by design. Work the actual activities; the stage follows.

**"Why did a Deal close as *Duplicate / Test Record*?"**
`processAccount` found two live Deals for the same product under one Account and kept the
older one. Expected cleanup.

**"A task keeps reopening with a `[code]` in the subject."**
That's a Manual Review. Fix the underlying field (§9), then complete it — don't just close
it, or it'll come back on the next run.

**"Can I just type the amount / stage / contract value in?"**
No — the automation owns those (§10) and will overwrite them. Change the *inputs* (log the
call, set the products, move the quote), not the computed outputs.

---

## Appendix A — field names (Zoho label ↔ API name)

This guide uses **API names** in `code font`. Below is the **label you see in Zoho** for
each. **Rule of thumb:** for most fields the Zoho label is simply the API name with
underscores replaced by spaces. The **Deal pipeline fields are the important exceptions** —
their labels and API names don't line up, and the two are easy to confuse.

### Deals — the exceptions (read these carefully)

| What you see in Zoho (label) | API name (this guide) | What it is |
| --- | --- | --- |
| **Opportunity Type** | `Stage` | The MQL/SQL/FTP/RTP bucket. |
| **Opportunity Stage** | `Opportunity_Stage` | The 8-step stage you work. |
| Opportunity State | `Opportunity_State` | Open / Lost. |
| Opportunity Status | `Opportunity_Status` | New / Working / Closed. |
| Amount | `Amount` | Computed deal value. |
| Company Tier | `Company_Tier` | 1 / 2 / 3. |
| Automation Suppressed | `Automation_Suppressed` | Per-Deal kill switch. |
| Contact Name | `Contact_Name` | Primary contact lookup. |

### Calls (verified live)

| Label in Zoho | API name |
| --- | --- |
| Call Task State | `Call_Task_State` |
| Call Task Lost Reasons | `Call_Task_Lost_Reasons` |
| Next Follow-Up Date | `Next_Follow_Up_Date` |
| Call Task Contract Products | `Call_Task_Contract_Products` |
| Call Task Contract Brands | `Call_Task_Contract_Brands` |
| Call Task Contract Date Start / End | `Call_Task_Contract_Date_Start` / `_Date_End` |
| Call Task Contract Frequency | `Call_Task_Contract_Frequency` |

### Meetings / Events (verified live)

| Label in Zoho | API name |
| --- | --- |
| Meeting Task State | `Meeting_Task_State` |
| Meeting Task Stage | `Meeting_Task_Stage` |
| Meeting Task Lost Reasons | `Meeting_Task_Lost_Reasons` |
| Meeting Task Contract Products | `Meeting_Task_Contract_Products` |

### Tasks (verified live)

| Label in Zoho | API name |
| --- | --- |
| Task State | `Task_State` |
| Task Status | `Task_Status` |
| Task Sequence Type | `Task_Sequence_Type` |
| Task Lost Reasons | `Task_Lost_Reasons` |
| Task Contract Products | `Task_Contract_Products` |
| Task Type | `Task_Type` |
| Blocks Sequence | `Blocks_Sequence` |

### Quotes & Contacts

| Label in Zoho | API name | Module |
| --- | --- | --- |
| Quote Stage | `Quote_Stage` | Quotes |
| Quote Product | `Quote_Product` | Quotes |
| Stage | `Stage` | Contacts (the 8-step stage) |
| Marketing Consent | `Marketing_Consent` | Contacts (checkbox) |
| Sequence State | `Sequence_State` | Contacts |

*Note: `Stage` means different things on different modules — on **Contacts** it's the
8-step stage; on **Deals** it's the Opportunity Type. Always check which module you're in.*

---

*This guide reflects the live `v6/` automation. For the deeper technical spec see
[docs/v6/zoho_v6_refactor_spec_pack/](v6/zoho_v6_refactor_spec_pack/) and
[docs/v6/FLOW_REFERENCE.md](v6/FLOW_REFERENCE.md).*
