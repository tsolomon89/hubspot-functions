# v6 Activation Gate Test Plan

Verifies the sequence-email invariant:

```
No automated sequence email may be sent until the contact's activation Task
has been explicitly completed with a valid Task Sequence Type.
```

and its corollary:

```
one intended email  <->  one Email Sent audit Task  <->  one sequence transition
```

These are live MCP-driven tests: the gate spans Deluge, Zoho field state and workflow
rules, so it cannot be exercised off-platform. The Quote-naming contract IS unit
testable and lives in `tests/test_quote_subject.py` — run that first, it is free.

## Preconditions

- `Contacts.Sequence_Activated_At` (datetime) EXISTS, with api_name EXACTLY
  `Sequence_Activated_At`. **The gate fails closed**: with the field absent (or named
  differently) every send is blocked org-wide, so create and verify it before publishing.
- **No active Zoho Cadence on Contacts.** THIS GATE CANNOT COVER CADENCES. Both gates
  live in Deluge; a native Cadence sends via Zoho's own engine, so it bypasses the
  activation check, the SendKey idempotency AND the `Email Sent` audit Task — it would
  break the invariant silently and invisibly. As of 2026-07-15 the org has 26 email
  notifications with `feature_type: "cadences"` on Contacts ("Welcome Email 1..26",
  created 2026-06-28/29) and `getCadenceModuleActionsCount(Contacts) = 1`. The API
  exposes no cadence-listing endpoint: **verify by hand in Setup -> Automation ->
  Cadences that none is active on Contacts.** If one is active, it must be paused or
  brought under `sendSequencedEmail` before this gate can be claimed to hold.
- Republished: `routeContactSequence`, `sendSequencedEmail`, `processDeal`,
  `handleTaskCompletion`, `_util_applyQuoteLifecycle`, `_util_buildQuoteSubject` (new).
- WF008 (Tasks create_or_edit -> handleTaskCompletion) active. No workflow rule change
  is required by this fix.
- Seed Contacts use Gmail plus-addressing (`t.l.c.solomon+<runkey>@gmail.com`) so a
  real delivery is observable and attributable to the run.
- Record every created ID; delete all synthetic records afterwards.

## Evidence sources per test

| Signal | Where to read it |
| --- | --- |
| Email actually sent | Gmail inbox for the plus-address + Zoho message_id in the audit Task Description |
| Send blocked | automation log `blocked_not_activated`, and a `Manual Review` Task whose Description starts `[send_blocked_not_activated]` |
| Dispatch gated | automation log `dispatch_gate` = `activation_not_established` |
| Activation recorded | `Contacts.Sequence_Activated_At` non-blank + log `activation_stamped` |
| Audit invariant | exactly one `Task_Type = Email Sent` Task per SendKey |

## Negative tests — nothing may send before activation

| ID | Scenario | Action | Expected |
| --- | --- | --- | --- |
| AG-N1 | Contact creation | Create a Decision-Maker Contact with a Product Deal | Activation Task created. `Sequence_Activated_At` blank. **0 emails**, 0 `Email Sent` Tasks |
| AG-N2 | Activation Task creation | Observe the Task from AG-N1 | Creating it sends nothing. **0 emails** |
| AG-N3 | Unrelated Contact edit | Edit e.g. `Phone` / `Title`, save | WF001b0 refires processContact. **0 emails**, no duplicate activation Task |
| AG-N4 | Activation without a route | Set `Task_State = Won`, leave `Task_Sequence_Type` blank | Task reopened + `[activation_no_route]` Manual Review. `Sequence_Activated_At` still blank. **0 emails** |
| AG-N5 | Direct `routeContactSequence` before activation | Invoke `routeContactSequence(contact, deal, "resume", "{}")` | log `dispatch_gate` = `activation_not_established`. No Call/Task/email dispatched. `Sequence_State` stays `Not Activated` |
| AG-N6 | Direct `sendSequencedEmail` before activation | Invoke `sendSequencedEmail(contact, deal, "Marketing Consent", 1, "opener", "")` | Returns `""`. **0 emails**, no audit Task. `[send_blocked_not_activated]` Manual Review naming contact, step `marketing-consent:1:initial`, missing condition, caller hint |
| AG-N7 | **The reported defect** — commercial:signed bypass | Un-activated Contact at Stage `Commercial Agreement`; drive its Quotes to Confirmed so processDeal's term gate routes `commercial:signed` | Stage still advances to Onboarding (structural). **0 emails**, NO `onboarding:0:signed-confirmation` audit Task. `blocked_not_activated` logged |
| AG-N8 | Quote creation cannot bypass | Create/confirm a Quote on an un-activated Contact's Deal | WF020 -> handleQuoteStageChange -> processDeal reconciles. **0 emails** |
| AG-N9 | Deal update cannot bypass | Edit the Deal to refire processDeal | **0 emails** |
| AG-N10 | Import cannot bypass | Import a Lead with contract evidence at RTP (the AG-N7 shape, via import) | Deals/Quotes/Stage reconcile. **0 emails**. This is the exact production failure — Contact 991103000002491263 |
| AG-N11 | Onboarding change cannot bypass | Complete an `Onboarding Setup` Task on an un-activated Contact | `Sequence_State` handling runs. **0 emails** |
| AG-N12 | Repair/manual-review completion cannot bypass | Complete a `Manual Review` / `Data Repair` Task (routes `resume`) | `resume` is gated. **0 emails** |
| AG-N13 | Scheduled send cannot bypass | Let a `ScheduledSend` wake-up Task come due for an un-activated Contact | `sendScheduledEmailFromTask` delegates; send blocked. Wake-up Task NOT turned into an audit record. `Sequence_State` NOT advanced to Complete |
| AG-N14 | Demo reminder cannot bypass | Invoke `sendDemoReminder` for an un-activated Contact | **0 emails**, blocked + Manual Review |

## Positive tests — activation works, exactly once

| ID | Scenario | Action | Expected |
| --- | --- | --- | --- |
| AG-P1 | Email activation sends exactly one | On the AG-N1 Task set `Task_Sequence_Type = Email`, `Task_State = Won` | `Sequence_Activated_At` stamped; `activation_stamped` logged. **Exactly 1** email (`marketing-consent:1:initial`) received at the plus-address. **Exactly 1** `Email Sent` audit Task. **One** sequence transition: `Sequence_State = Running`, `Sequence_Type = Email`, Call 1 created |
| AG-P2 | Call activation sends none | Fresh Contact; `Task_Sequence_Type = Call`, `Task_State = Won` | Activated + stamped. Call-first: **0 emails** (correct — Call route has no opener). Exactly 1 Call |
| AG-P3 | Manual activation | `Task_Sequence_Type = Manual`, `Task_State = Won` | Stamped (activation happened). `Sequence_State = Stopped`, `Status = Working`. **0 emails** |
| AG-P4 | Post-activation cadence flows | From AG-P1, drive the cadence forward | Emails send normally; each = 1 audit Task = 1 transition |
| AG-P5 | Signed confirmation AFTER activation | Activated Contact, drive Quotes Confirmed -> `commercial:signed` | **Exactly 1** `onboarding:0:signed-confirmation` email + 1 audit Task with `Task_Sequence_Stage = Onboarding` |
| AG-P6 | Already-activated Contacts continue | Any Contact with `Sequence_Activated_At` set | Behaves exactly as before this change |

## Idempotency / duplication tests

| ID | Scenario | Action | Expected |
| --- | --- | --- | --- |
| AG-I1 | Repeated workflow execution | Re-save the activated Contact / Deal several times | No duplicate emails. SendKey idempotency holds. Audit Tasks stay at 1 per key |
| AG-I2 | Re-completing the activation Task | Set the completed activation Task back to Won | `activation_already_processed` guard. `Sequence_Activated_At` NOT re-stamped (stamp is set-once). No second opener |
| AG-I3 | Repeated blocked attempts | Trigger AG-N6 three times | 3 log lines, but **one** Manual Review Task — `createAuxTask` dedups on the `[send_blocked_not_activated]` issue code. Still 0 emails |
| AG-I4 | Blocked then activated | Run AG-N6, then activate properly | The opener now sends exactly once. The earlier block did not consume the SendKey |

## Regression guards (things the gate must NOT break)

| ID | Scenario | Expected |
| --- | --- | --- |
| AG-R1 | Structural reconciliation on un-activated Contacts | Stage advance, Product linking, Quote upsert, Deal Amount, contract ledger and Account rollup all still run |
| AG-R2 | `Status = Working` rollup | An un-activated imported Contact at Onboarding is still `Status = Working`, so its Deal/Account still roll up via `anyContactWorking` (the `wouldRun` path) |
| AG-R3 | Stopped Contacts | Unchanged: structural reconciliation runs, dispatch suppressed |

## Data repair (run once, after publishing)

Contact `991103000002491263` (Simon Herchel) is the live casualty: `Sequence_State = Running`
with `Sequence_Type` null and zero activation Tasks — a state the state machine cannot
produce legitimately. It already received `onboarding:0:signed-confirmation`.

```
select id, Full_Name, Stage, Sequence_State, Sequence_Type
from Contacts
where Sequence_State = 'Running' and Sequence_Type is null
```

Expected after the fix: this query returns rows only for Contacts corrupted before the
fix. Reset each to `Sequence_State = Not Activated`, `Sequence_Stage = None`,
`Sequence_Step = None`, leaving `Sequence_Activated_At` blank, so the Contact re-enters
through a proper activation Task.

The reset is REQUIRED, not cosmetic: `processContact` only creates an activation Task
when `Sequence_State == "Not Activated"`. A Contact left on the corrupt `Running` value
would get no activation Task (so nothing can activate it) while the gate blocks its
sends — permanently stuck. Resetting it lets `processContact` issue the activation Task
that unblocks it.

## Expected blast radius on publish (intended, not a regression)

Every `Not Activated` Contact stops receiving automated email until a rep completes its
activation Task. That IS the invariant. Before this fix those Contacts dispatched freely
— only `Stopped` was suppressed — which is the defect.

This is safe to publish because the unblock path already exists: 50+ open
`Sequence Activation` Tasks are already queued across Demo Booking / Proposal
Preparation / Commercial Agreement / Renewal (verified 2026-07-15). Reps action those
Tasks as normal and their sequences start. Nothing is silently lost.

**No backfill is required for legitimate Contacts**: at the time of the fix, zero
Contacts in the org had a non-null `Sequence_Type`, so no live activated sequence
exists to grandfather. Re-verify with the query above before publishing — if it ever
returns Contacts that WERE legitimately activated, backfill
`Sequence_Activated_At` for them first or the gate will silence their sequences.
