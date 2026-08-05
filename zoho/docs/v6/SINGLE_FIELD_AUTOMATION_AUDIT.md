# v6 Single-Field Automation Audit

This audit defines the single-field invariant for v6 activity automation.

Single-field means the rep advances the activity lifecycle with exactly one primary
command field. Product, quote, contract, stage, sequence, and relationship fields are
context or evidence; they are not lifecycle commands.

## Command Surfaces

| Use case | User command | Optional context | Automation-derived fields |
| --- | --- | --- | --- |
| Ordinary Task success | `Task_State = Won` | `Task_Type`, commercial evidence, relationship fields | `Task_Status = Closed`, native `Status = Completed`, downstream Contact/Deal/Quote/sequence writes |
| Ordinary Task loss | `Task_State = Lost` | `Task_Lost_Reasons` required | `Task_Status = Closed`, native `Status = Completed`, local loss routing |
| Ordinary Task unresolved | `Task_State = Open` | Task context/evidence | `Task_Status = New` or `Working`; no terminal transition |
| Activation Task | `Task_Sequence_Type = Email/Call/Manual` | `Task_Sequence_Stage` | Route execution, `Task_State = Won`, `Task_Status = Closed`, native `Status = Completed` |
| Call success | `Call_Task_State = Won` | Call stage, attempt, Product/contract evidence | `Call_Task_Status = Closed`, native activity close, next sequence action |
| Call loss | `Call_Task_State = Lost` | `Call_Task_Lost_Reasons` required | `Call_Task_Status = Closed`, local loss routing |
| Call reschedule | `Call_Task_State = Open` | `Next_Follow_Up_Date` | Replacement/scheduled Call; no new State or Status value |
| Meeting success | `Meeting_Task_State = Won` | `Meeting_Task_Stage`, Product/contract evidence | `Meeting_Task_Status = Closed`, downstream routing or Quote evidence processing |
| Meeting loss | `Meeting_Task_State = Lost` | `Meeting_Task_Lost_Reasons` required | `Meeting_Task_Status = Closed`, local loss routing |
| Meeting booking/reschedule | `Meeting_Task_State = Open` or blank | native `Start_DateTime` | reminder/context mirrors and first-booking progression |

## Non-Command Evidence

These fields may be required for commercial work, but they never replace the lifecycle
command:

| Module | Evidence fields |
| --- | --- |
| Tasks | `Task_Contract_Products`, `Task_Contract_Brands`, `Task_Contract_Date_Start`, `Task_Contract_Date_End`, `Task_Contract_Frequency` |
| Calls | `Call_Task_Contract_Products`, `Call_Task_Contract_Brands`, `Call_Task_Contract_Date_Start`, `Call_Task_Contract_Date_End`, `Call_Task_Contract_Frequency` |
| Events | `Meeting_Task_Contract_Products`, `Meeting_Task_Contract_Brands`, `Meeting_Task_Contract_Date_Start`, `Meeting_Task_Contract_Date_End`, `Meeting_Task_Contract_Frequency` |
| Quotes | `Quote_Stage`, `Quote_Product`, `Quoted_Items`, `Contract_Date_Start`, `Contract_Date_End`, `Quote_Applied_Activity_Keys` |

If commercial validation fails after a user sets an activity State to `Won`, automation must
not leave the activity falsely closed. The handler must reopen or retain it as `Open` /
`Working`, create Manual Review, and log the validation failure.

## Retired Command Paths

The following fields are legacy or duplicate lifecycle surfaces and must not control v6
activity routing:

| Module | Retired field | Current target |
| --- | --- | --- |
| Tasks | `Task_Outcome` | Remove from code/workflow/layouts, then delete after dependency audit |
| Calls | `Call_Outcome` | Remove from workflows/layouts, then delete after dependency audit |
| Events | `Meeting_Outcome`, `Meeting_Status` | Remove from workflows/layouts, then delete after dependency audit |
| Deals | `Demo_Outcome`, `Demo_Status`, `Commercial_Outcome` | Retire after Event/Quote-driven replacement behavior is deployed and verified |

Native activity fields such as `Tasks.Status` are automation-owned. They may be retained for
Zoho mechanics, but they must not be exposed as an additional user command.

## Current Repository State

- `handleTaskCompletion` uses `Task_Sequence_Type` for activation and `Task_State` for ordinary Task routing.
- `handleCallOutcome` uses `Call_Task_State`; `Next_Follow_Up_Date` is scheduling context only.
- `handleMeetingEvent` uses `Meeting_Task_State`; `Meeting_Task_Stage` is context for demo/commercial/renewal behavior.
- `routeContactSequence` owns Contact stage/sequence transitions and must not treat Activity Lost as automatic Deal Lost.
- `processDeal` and Quote handlers own Product, Quote, Amount, and contract ledger propagation.

Live workflow, layout, validation, and deletion status is not proven in this repository. See
`PRE_CHANGE_FIELD_AUTHORITY_AUDIT.md` for live-access blockers and the safe deletion sequence.
