# Next Sprint Specification: Universal Commercial Kernel and HubSpot Native Object Model

**Target repository:** `tsolomon89/hubspot-functions`  
**Reviewed commit:** `87b4f2a30d93371f33e0a322573fa574c8a31356`  
**Date:** 2026-08-05  
**Implementation target:** HubSpot developer test account only

## 1. Sprint directive

Replace the active Jurnii-specific business model with a business-neutral commercial kernel and map that kernel to HubSpot's native standard objects.

The system is not a Jurnii migration. Jurnii is one future organization configuration. The universal model is:

\[
\text{Organization}
\rightarrow
\text{Relationship Type}
\rightarrow
\text{MQL} \rightarrow \text{SQL} \rightarrow \text{FTP} \rightarrow \text{RTP}_1 \rightarrow \text{RTP}_2 \rightarrow \cdots
\]

- `Relationship Type` is the organization's commercial relationship category: B2B, B2C, Partnership, Reseller, Investor Relations, or another configured category.
- A Relationship Type is represented by CRM pipelines, but it is not a product or SKU.
- `MQL`, `SQL`, `FTP`, and `RTP` are universal Opportunity Types.
- Offerings are the particular products, services, rights, agreements, or propositions involved in the relationship.
- Qualification Goals are unordered predicates configured by Organization × Relationship Type × Opportunity Type.
- The universal minimum goals are fixed by the semantic meaning of each Opportunity Type.
- HubSpot is one persistence and interaction adapter. The commercial kernel must not import HubSpot types.

Do not port the Jurnii sequence engine, pricing matrix, Quote lifecycle, onboarding, renewal automation, or email content in this sprint.

## 2. Current repository position

The latest commit is mechanically healthier than the previous foundation:

| Gate | Verified result |
|---|---|
| TypeScript compilation | Passed locally at the reviewed commit |
| Tests | 25 passed across 7 files |
| Full dependency audit | 0 vulnerabilities |
| Node baseline | Node 22 in CI |
| PostgreSQL queue tables | Present |
| Polling worker and expired-lease reclaim | Present |
| HubSpot app validation | Not proven; CI skips it when no secret is exposed |
| Real database integration tests | Absent |
| Developer-account upload/install | Not proven |
| Production deployment | Absent |

The passing tests do not establish a working HubSpot system. `test/integration/worker.test.ts` is a pure-function Jurnii test. It does not start PostgreSQL, invoke the worker, emulate HubSpot, or test concurrency.

### 2.1 Immediate correctness defects

These must be corrected before adding the universal kernel:

1. **The generic webhook envelope and the worker disagree.**
   - The committed app subscribes using the current generic `object.*` webhook format.
   - Generic payloads identify the record type with `objectTypeId`; `subscriptionType` is `object.creation`, `object.propertyChange`, and similar.
   - The worker instead checks whether `subscriptionType` starts with `contact` or `company`, which will never identify a generic event.
   - The payload type expects `occurredAt`, while the current generic format supplies its event timestamp in the generic envelope documented by HubSpot. Normalize the actual received envelope before persistence and processing.
   - HubSpot states that `eventId` is not guaranteed to be unique. Do not use it as a global idempotency key by itself.

2. **A Contact webhook invents a Jurnii commercial intent.**
   - `processWebhookEventJob` injects `products: ['jurnii_360']` for every Contact.
   - Delete this behavior. Missing relationship or offering evidence must remain missing. The engine must never manufacture it.

3. **The active domain is still Jurnii.**
   - `Deal = Company × Product` is hard-coded.
   - Only B2B and Partnership pipelines exist.
   - Jurnii product keys are compiled into the domain.
   - Marketing Consent, Demo, Proposal, Onboarding, and Renewal are treated as universal Deal stages.
   - Decision Maker sequence activation is embedded in the first vertical slice.

4. **The schema tool still reports more capability than it has.**
   - It inspects only Contact, Company, and Deal properties plus Deal pipelines.
   - It does not inspect property groups or association labels.
   - It does not apply association labels or pipelines.
   - Readback verifies only properties.
   - The committed custom role labels are declared `HUBSPOT_DEFINED`; organization-created labels are `USER_DEFINED`, and their direction-specific IDs must be read from HubSpot.

5. **Unknown and unimplemented jobs can become false successes.**
   - `RECONCILE_RECORD` returns a log object without reconciling a record.
   - An unrecognized `job_type` can reach `COMPLETED` with a null result.
   - Unknown, unsupported, or malformed jobs must fail explicitly and eventually dead-letter.

6. **The app is not connected to a runtime.**
   - Webhook and workflow-action URLs are placeholders.
   - Webhook subscriptions are inactive.
   - CI does not inject authenticated HubSpot configuration and silently skips validation.
   - No developer test account execution evidence is committed.

7. **The repository is still public.**
   - Do not add portal tokens, personal access keys, app secrets, customer fixtures, or live exports.
   - Changing repository visibility is an owner action, not implied by this sprint specification.

## 3. Canonical commercial ontology

### 3.1 Organization

The Organization owns the commercial configuration. In the current single-account deployment, the HubSpot portal is the Organization boundary. The kernel must nevertheless accept an explicit `organizationKey`; do not infer global configuration from process environment alone.

### 3.2 Commercial Subject

A Commercial Subject is the entity with which the Organization may form a relationship.

It may be:

- A person represented by a HubSpot Contact.
- A business or other entity represented by a HubSpot Company.
- A Company and one or more associated Contacts.

A Company is not mandatory. B2C must work with a Contact alone.

### 3.3 Relationship Type

A Relationship Type defines how a category of relationship is qualified. Examples include B2B, B2C, Partnership, Reseller, and Investor Relations.

All offerings within the same Relationship Type inherit the same qualification configuration unless the Organization deliberately defines another Relationship Type.

Changing a shoe SKU does not create a new B2C qualification model. Changing from a consumer purchase to a distributor relationship does.

### 3.4 Opportunity Types and irreducible goals

| Opportunity Type | Regime | Irreducible qualification |
|---|---|---|
| MQL | Lead qualification | The subject is identifiable and has at least one usable communication channel |
| SQL | Lead qualification | The intended offering or commercial proposition is known |
| FTP | Transaction processing | A first transaction in this relationship is complete |
| RTP | Transaction processing | A subsequent transaction after FTP or the preceding RTP is complete |

Explicit marketing consent is recommended data, but it is not in the universal MQL minimum. An Organization may make it an additional required goal for a Relationship Type.

An offering is not limited to a monetary SKU. It may be a service, entitlement, distribution agreement, data exchange, partnership proposition, or another reciprocal exchange.

### 3.5 Qualification semantics

For opportunity `o` in organization `z` and relationship type `r`:

\[
G(z,r,o)=G_{\min}(o)\cup G_{\text{configured}}(z,r,o)
\]

\[
\operatorname{Complete}(o)=\bigwedge_{g\in G(z,r,o)} g(\text{snapshot})
\]

Rules:

- Goals inside an Opportunity Type have no sequence.
- Universal minimum goals cannot be deleted or weakened by configuration.
- Additional goals may inspect fields, associations, activities, commercial instruments, and cardinality.
- Evidence must be scoped to the current relationship and, where relevant, to the current opportunity window. A meeting from an earlier relationship or transaction must not satisfy a later opportunity by accident.
- Completing an Opportunity Type activates the next Opportunity Type exactly once.
- Losing or disqualifying an opportunity does not activate a successor.
- Re-evaluating the same state produces no additional mutations.

## 4. HubSpot native-object decision

HubSpot already provides the required business objects. Do not create a custom CRM object in this sprint.

HubSpot describes Contacts and Companies as foundational objects; Leads as sales-qualification records; Deals as transaction records; Products as reusable offering templates; and Line Items as the instantiated offerings attached to transactions and commercial instruments. HubSpot also supplies activity, commerce, fulfillment, and service objects. See [HubSpot's object model](https://knowledge.hubspot.com/records/understand-objects).

### 4.1 Authoritative mapping

| HubSpot object or feature | Kernel role | Sprint decision |
|---|---|---|
| Contact | Person subject and communication channels | Use natively |
| Company | Business/entity subject | Use natively; optional for B2C |
| Lifecycle stage on Contact/Company | Human-friendly roll-up of furthest commercial progress | Derived projection only; never the opportunity ledger |
| Lead | MQL → SQL qualification record | Preferred native projection when Sales Hub Professional/Enterprise is available |
| Deal | One FTP or RTP transaction opportunity | Use natively |
| Deal pipeline | Transaction process for one Relationship Type | Pair with the corresponding Lead pipeline |
| Product | Organization's reusable offering catalog | Use natively |
| Line Item | Offering instance on a Deal, Quote, Order, Invoice, or Subscription | Use natively; supports multiple offerings per Deal |
| Call, Meeting, Task, Email, Communication, Note | Qualification evidence and human work | Use natively |
| Cart | B2C product-interest and checkout-intent evidence | Optional evidence provider |
| Quote | Formal offer, approval, acceptance, or signature evidence | Optional; not universal |
| Order | Confirmed purchase or request and fulfillment state | Preferred B2C transaction evidence where present |
| Invoice and Payment | Billing and monetary transaction evidence | Optional evidence providers |
| Subscription | Recurring commercial state and payment evidence | Optional evidence provider |
| Ticket and Conversation | Service/support state and communications | Optional RTP or service-quality evidence; not an Opportunity object |
| Service, Project, Appointment, Course, Listing | Domain-specific fulfillment records | Optional configured evidence; activate only when the Organization needs them |
| Marketing Event and Campaign | Marketing-source and engagement evidence | Optional evidence; not the MQL opportunity itself |
| Custom Object | Independent domain entity unsupported by native objects | Not required now; Enterprise-only escape hatch |

Leads require Sales Hub Professional or Enterprise. Creating current Revenue Hub quotes requires Revenue Hub Professional or Enterprise. Custom objects require Enterprise. The capability inspector must report these as portal capabilities and the schema planner must block unsupported plans rather than silently substituting an object.

### 4.2 Physical projection versus universal ontology

The kernel owns one logical relationship lifecycle. HubSpot may represent that lifecycle with more than one native record:

1. One Lead record carries the qualification regime from MQL to SQL.
2. Completing MQL moves that Lead into SQL.
3. Completing SQL closes the Lead as Qualified and creates one FTP Deal.
4. Completing the FTP Deal closes it Won and creates one RTP Deal with cycle index `1`.
5. Completing `RTP_n` closes it Won and creates `RTP_{n+1}`.

This is a HubSpot projection choice, not a change to the universal sequence. It uses Leads for what HubSpot defines as qualification and Deals for what HubSpot defines as transactions.

If the target portal does not have the Lead object, the capability report must return `LEAD_OBJECT_UNAVAILABLE`. Do not create a custom object automatically. Define a `deal_only` projection interface for a later fallback, but do not claim it is implemented in this sprint.

### 4.3 Relationship Type to pipeline mapping

HubSpot pipelines are object-specific. One conceptual Relationship Type therefore maps to a pair of native pipelines:

```yaml
relationshipType: b2b
hubspot:
  leadPipelineId: <read or created ID>
  dealPipelineId: <read or created ID>
```

The Lead pipeline represents the universal qualification types, not individual goals:

- MQL
- SQL
- Qualified
- Disqualified

The Deal pipeline represents the transaction opportunity state, not an ordered checklist of qualification goals:

- Open
- Closed Won
- Closed Lost

HubSpot requires explicit probabilities for Deal stages and recommends both Won and Lost stages. The Organization configuration must supply the probability for every open stage. Do not invent probabilities. See [HubSpot pipeline requirements](https://developers.hubspot.com/docs/api-reference/latest/crm/pipelines/guide).

### 4.4 Lifecycle stage projection

HubSpot's Contact/Company Lifecycle stage is a single forward-moving summary. It is not sufficient as the opportunity record because it cannot preserve multiple relationship types or successive RTP cycles. Use it only as a derived convenience:

| Kernel event | Suggested HubSpot lifecycle projection |
|---|---|
| Subject created but MQL incomplete | Lead |
| MQL complete | Marketing Qualified Lead |
| SQL complete | Sales Qualified Lead |
| FTP Deal opened | Opportunity |
| FTP complete | Customer |
| RTP complete | Customer remains Customer |

The account's automatic lifecycle-stage settings must be audited before enabling this projection. HubSpot lifecycle stages otherwise move forward through several native automations and can conflict with the kernel. See [HubSpot lifecycle stages](https://knowledge.hubspot.com/records/use-lifecycle-stages).

## 5. Sprint goal and non-goals

### 5.1 Sprint goal

Prove, in a developer test account, that the generic engine can:

1. Resolve a Contact-only or Company-plus-Contact subject.
2. Select an Organization-defined Relationship Type.
3. Create or reconcile the native Lead for that relationship.
4. Evaluate unordered MQL and SQL goals.
5. Move the Lead from MQL to SQL only when MQL is complete.
6. Mark the Lead Qualified and create exactly one FTP Deal only when SQL is complete.
7. Attach one or more native Line Items to the FTP Deal without creating one Deal per product.
8. Evaluate configured transaction evidence for FTP and RTP in dry-run mode.
9. Demonstrate deterministic successor planning and replay safety for the full MQL → SQL → FTP → RTP chain.

Live FTP/RTP closing may be enabled in the developer test account only after the planner and replay tests pass. It is not a prerequisite for merging the kernel if the required commerce entitlement or test fixture is unavailable; in that case, the dry-run result and explicit capability blocker are required.

### 5.2 Non-goals

- Production installation or production CRM mutation.
- Multi-account OAuth distribution.
- Jurnii pricing, product keys, Quote matrix, Acquisition/Expansion/Renewal rules, onboarding, or sequences.
- Outbound email or sequence enrollment.
- Custom objects.
- A configuration UI.
- Forecast probabilities derived without observed data.
- Migrating Zoho records into HubSpot.

## 6. Required implementation architecture

### 6.1 Pure commercial kernel

Create `packages/commercial-kernel/`. It must contain no HubSpot SDK imports, HubSpot property names, PostgreSQL calls, or environment reads.

Minimum exported types:

```ts
export type OpportunityType = 'MQL' | 'SQL' | 'FTP' | 'RTP';
export type OpportunityState = 'OPEN' | 'WON' | 'LOST';
export type QualificationState = 'PENDING' | 'SATISFIED' | 'BLOCKED' | 'MANUAL_REVIEW';

export type CommercialSubjectRef =
  | { kind: 'CONTACT'; key: string }
  | { kind: 'COMPANY'; key: string; contactKeys?: string[] };

export interface OpportunitySnapshot {
  organizationKey: string;
  relationshipKey: string;
  relationshipType: string;
  opportunityKey: string;
  opportunityType: OpportunityType;
  cycleIndex: number;
  openedAt: string;
  predecessorOpportunityKey?: string;
  subject: CommercialSubjectRef;
  facts: Record<string, unknown>;
  evidence: EvidenceRecord[];
}

export interface EvaluationResult {
  qualificationState: QualificationState;
  satisfiedGoalKeys: string[];
  unsatisfiedGoalKeys: string[];
  evidenceRefsByGoal: Record<string, string[]>;
  evaluatedConfigVersion: string;
}
```

Required pure operations:

- `validateCommercialModel(config)`
- `injectUniversalGoals(config)`
- `evaluateOpportunity(snapshot, config)`
- `planTransition(snapshot, evaluation, config)`
- `deriveSuccessorKey(predecessor, successorType, cycleIndex)`
- `projectLifecycleStage(completedState)`

The planner returns declarative intents. It does not call HubSpot:

```ts
type TransitionIntent =
  | { kind: 'UPDATE_OPPORTUNITY'; ... }
  | { kind: 'CREATE_SUCCESSOR'; ... }
  | { kind: 'PROJECT_LIFECYCLE_STAGE'; ... }
  | { kind: 'CREATE_MANUAL_REVIEW'; ... }
  | { kind: 'NOOP'; reason: string };
```

### 6.2 Qualification Goal DSL

Add a versioned, JSON-schema-validated configuration format. Do not execute arbitrary code from configuration.

Supported predicates for this sprint:

- `anyCommunicationChannel`: at least one configured address is non-empty and usable.
- `property`: `present`, `equals`, `in`, `notEquals`, `greaterThan`, `lessThan`.
- `associationExists`: an associated native object exists, optionally with property filters.
- `activityExists`: an associated activity of a configured type has a configured outcome.
- `offeringKnown`: at least one offering reference, Product, Line Item, Cart Item, or configured proposition field exists.
- `transactionExists`: qualifying Quote, Order, Invoice, Payment, Subscription event, or another configured transaction instrument exists.
- `count`: qualifying evidence count meets a threshold.
- `all`, `any`, and `not`: logical composition.

Every evidence predicate must declare a scope:

- `relationship`: evidence may come from the full relationship history.
- `opportunity`: evidence must occur at or after `openedAt`.
- `sincePredecessorCompletion`: required for RTP transaction proof.

### 6.3 Organization configuration

Create:

- `config/organizations/example-b2b.yaml`
- `config/organizations/example-b2c.yaml`
- `config/schema/commercial-model.schema.json`

The examples are executable fixtures, not production defaults.

The B2B example must add an SQL goal requiring a completed positive Meeting in addition to the universal `offeringKnown` goal.

The B2C example must satisfy SQL through a Cart or equivalent offering-interest record without requiring a salesperson or Meeting.

Configuration must contain:

- Organization key and version.
- Relationship Type key and label.
- HubSpot Lead and Deal pipeline mappings.
- Explicit Deal-stage probabilities.
- Additional goals per Opportunity Type.
- Evidence-to-HubSpot object/property mappings.
- Transaction evidence priority.
- Optional lifecycle-stage projection mapping.
- Feature flags, including `automationSuppressed` and `dryRunTransactions`.

### 6.4 HubSpot adapter

Replace the business methods in `packages/hubspot-client/` with an adapter boundary under `packages/hubspot-adapter/`.

Required interfaces:

- `inspectCapabilities(portalId)`
- `loadSubjectSnapshot(subjectRef)`
- `loadOpportunitySnapshot(objectType, objectId)`
- `loadAssociatedEvidence(relationshipKey, opportunityWindow)`
- `applyTransitionIntents(intents, transitionKey)`
- `resolvePipelineMapping(relationshipType)`
- `resolveAssociationType(fromObjectType, toObjectType, label?)`

Rules:

- Resolve association labels through HubSpot's association schema API. Never hard-code custom association IDs. Custom labels are `USER_DEFINED` and direction-specific. See [HubSpot association labels](https://developers.hubspot.com/docs/api-reference/latest/crm/associations/associations-schema/guide).
- Use Product `SKU` or a configured unique Product property as the offering key. Do not compile offering names into TypeScript.
- Line Items, not Products, hold transaction-specific quantity, pricing, discount, billing frequency, and other mutable commercial terms.
- A Deal may contain multiple Line Items.
- Association failures are errors unless the API explicitly reports an already-existing association.
- Read-after-write must verify every transition before recording success.
- Rate limits and retryable HubSpot failures must return a retry classification to the worker.

### 6.5 CRM property manifest

Rewrite `config/hubspot-schema.yaml`. Remove `company_key`, `deal_key`, `product_key`, the hard-coded B2B stages, Jurnii assumptions, and universal Decision Maker/End User/Influencer labels.

Use the `coa_` namespace for app-owned properties.

Minimum Lead and Deal properties:

| Property | Type | Authority |
|---|---|---|
| `coa_opportunity_key` | Unique single-line text | Engine |
| `coa_relationship_key` | Single-line text | Engine |
| `coa_relationship_type` | Enumeration or text validated against configuration | Engine |
| `coa_opportunity_type` | MQL, SQL, FTP, RTP | Engine-derived |
| `coa_cycle_index` | Number | Engine |
| `coa_predecessor_opportunity_key` | Single-line text | Engine |
| `coa_qualification_state` | PENDING, SATISFIED, BLOCKED, MANUAL_REVIEW | Engine-derived |
| `coa_unsatisfied_goal_keys` | Multi-line text | Engine-derived |
| `coa_last_evaluated_at` | Datetime | Engine-derived |
| `coa_config_version` | Single-line text | Engine-derived |
| `coa_managed` | Boolean | Engine |
| `coa_automation_suppressed` | Boolean | Human/engine kill switch |

Do not duplicate native `pipeline`, stage, amount, close date, owner, Product SKU, Line Item, or activity fields with custom app fields.

### 6.6 Capability inspection and schema reconciliation

The schema tool must implement real `inspect → plan → apply → readback` for:

- Portal/account identity and region.
- Available standard objects and required entitlements.
- Property groups.
- Properties on Contacts, Companies, Leads, Deals, Products, Line Items, and configured evidence objects.
- Lead and Deal pipelines and stages.
- Association labels in both directions.
- App scopes required for the selected configuration.
- Existing lifecycle-stage automation settings where accessible; otherwise emit a manual audit requirement.

`apply` rules:

- Developer test account only.
- Require an explicit `--account-role developer-test` and expected portal ID.
- Print and persist the plan before mutation.
- Refuse deletion or type changes.
- Refuse production-like accounts.
- Fail on any unimplemented diff category.
- Read back every category.
- A second plan must be empty.

No command may report `applied: true` if it skipped a category or swallowed an error.

## 7. Ingress and worker corrections

### 7.1 Generic webhook normalization

Create `packages/hubspot-adapter/webhook-normalizer.ts`.

Normalize each current HubSpot webhook into:

```ts
interface NormalizedHubSpotEvent {
  portalId: string;
  appId: string;
  subscriptionId: string;
  eventId: string;
  eventType: 'CREATED' | 'PROPERTY_CHANGED' | 'DELETED' | 'MERGED' | 'RESTORED' | 'ASSOCIATION_CHANGED';
  objectTypeId: string;
  objectId: string;
  occurredAt: number;
  propertyName?: string;
  propertyValue?: unknown;
  sourceId?: string;
  attemptNumber: number;
  rawPayloadHash: string;
}
```

Derive a stable inbox key from the portal, app, subscription, object type, object ID, event type, event identifier, timestamp, and raw payload hash. Do not rely on `eventId` alone.

Preserve the raw request bytes and raw event object. Reject payloads that cannot be normalized. Do not acknowledge successful processing when persistence fails.

HubSpot's generic webhook format supports standard CRM objects and activities, including Leads, Line Items, Orders, Quotes, Calls, Meetings, Tasks, and custom objects for private apps. It also states that generic subscriptions are currently beta and user-defined association labels are not supported in association-change webhooks. Account for those limits explicitly. See [HubSpot generic webhook subscriptions](https://developers.hubspot.com/docs/apps/legacy-apps/public-apps/create-generic-webhook-subscriptions).

### 7.2 Reconciliation command

Webhooks do not contain the full commercial state. Every supported event must enqueue a typed reconciliation command that identifies the affected logical boundary:

```ts
type ReconcileCommand =
  | { kind: 'RECONCILE_SUBJECT'; subjectObjectType: string; subjectObjectId: string }
  | { kind: 'RECONCILE_OPPORTUNITY'; opportunityObjectType: 'lead' | 'deal'; opportunityObjectId: string }
  | { kind: 'RECONCILE_ASSOCIATED_EVIDENCE'; evidenceObjectType: string; evidenceObjectId: string };
```

The worker loads a fresh CRM snapshot. It must not treat webhook `propertyValue` as the complete record.

### 7.3 Queue behavior

- Unknown job type: throw `UNSUPPORTED_JOB_TYPE` and dead-letter after configured retries.
- Unsupported object type: park with explicit `UNSUPPORTED_OBJECT_TYPE`; never complete silently.
- Missing relationship configuration: `MANUAL_REVIEW` or explicit configuration blocker; never default to B2B.
- Missing offering: SQL stays pending; never create a placeholder Product.
- Missing secret or token: fail service startup, including non-production execution, except tests that inject explicit fakes.
- Retry scheduling must use a stored `next_attempt_at` with exponential backoff and jitter, not a fixed one-minute age check.
- Job completion, transition-key commit, inbox processing state, and execution log must be transactionally consistent.
- A dead-letter row must be unique per job.

### 7.4 Transition idempotency

Use a unique transition key such as:

```text
complete::<organizationKey>::<opportunityKey>::<opportunityType>::<cycleIndex>::<configVersion>
```

Successor creation and transition-key insertion must behave atomically from the application's perspective:

1. Reserve or insert the transition key.
2. Search by the deterministic successor `coa_opportunity_key`.
3. Create only if absent.
4. On conflict, re-read and verify the existing record.
5. Record the HubSpot object ID and completed transition.

Do not use Task subject text as an idempotency key.

## 8. Database migration

Add `db/migrations/002_universal_commercial_kernel.sql`.

Minimum additions:

- `organization_installations`: portal ID, organization key, config version, account role, capability snapshot.
- `commercial_relationship_projection`: relationship key, subject references, relationship type, active Lead/Deal IDs, latest completed Opportunity Type.
- `opportunity_projection`: opportunity key, CRM object type, CRM object ID, type, cycle, predecessor key, opened/completed timestamps.
- `qualification_evaluations`: opportunity key, config version, result, evidence references, evaluated timestamp.
- `hubspot_jobs.next_attempt_at` and `hubspot_jobs.error_class`.
- A uniqueness constraint preventing multiple active successor mappings for the same predecessor transition.
- A uniqueness constraint preventing duplicate dead-letter rows for one job.

These tables are an audit, mapping, and durability layer. HubSpot records plus versioned Organization configuration remain the business-facing source. Do not create a parallel hidden CRM in PostgreSQL.

## 9. Required file-level changes

### Delete or replace

- Delete `packages/domain/deal-engine.ts` after its generic replacement is used.
- Delete `packages/domain/activation-gate.ts` from the universal kernel. Sequence activation is an optional organization workflow, not a universal invariant.
- Replace `packages/domain/identity.ts` with subject identity that supports Contact-only, Company-only where communicable, and Company-plus-Contacts.
- Replace `test/integration/worker.test.ts`; move any remaining pure tests to `test/unit/`.
- Rewrite `config/hubspot-schema.yaml`.
- Rewrite `docs/architecture/zoho-hubspot-parity-matrix.md` as a Jurnii reference profile or move it under `docs/reference/`. It must no longer define the target architecture.

### Add

- `packages/commercial-kernel/`
- `packages/hubspot-adapter/`
- `config/schema/commercial-model.schema.json`
- `config/organizations/example-b2b.yaml`
- `config/organizations/example-b2c.yaml`
- `db/migrations/002_universal_commercial_kernel.sql`
- `test/contract/commercial-kernel/`
- `test/integration/postgres/`
- `test/integration/hubspot-adapter/`
- `test/e2e/developer-account/`
- `docs/architecture/commercial-kernel.md`
- `docs/architecture/hubspot-native-object-map.md`
- `docs/audits/hubspot-capability-audit.json`

### Active-code naming rule

After this sprint, no active TypeScript, schema manifest, runtime fixture, or acceptance test may contain:

- `jurnii_360`, `jurnii_ux`, `jurnii_cortex`
- `Company × Product Deal`
- hard-coded `b2b_pipeline` or `partnership_pipeline`
- Jurnii-specific pricing or Quote transition codes

The inherited `zoho/` material may remain as read-only reference during this sprint, but no active package may import or execute it.

## 10. Execution order

### Phase 0: Stop false behavior

1. Remove the invented `jurnii_360` Contact path.
2. Make unknown jobs fail.
3. Add current generic webhook fixtures and prove normalization.
4. Make missing runtime secrets fail startup.
5. Split unauthenticated CI from authenticated developer-account validation; neither may silently skip a declared gate.

Completion gate: a generic Contact event is persisted, normalized, queued, and either reconciled through an explicit configuration or parked with an explicit configuration blocker. It is never marked complete through a no-op.

### Phase 1: Capability inventory

1. Authenticate only to the developer test account.
2. Inspect standard objects, schemas, pipelines, association labels, and scopes.
3. Record which conditional objects are actually available: Leads, Quotes, Orders, Carts, Payments, Invoices, Subscriptions, Projects, Services, and others.
4. Produce `hubspot-capability-audit.json` from API evidence.
5. Do not mutate schema in this phase.

Completion gate: the adapter can state exactly which native projection and evidence providers the account supports.

### Phase 2: Universal kernel

1. Implement the types, configuration validator, universal-goal injection, evaluator, and transition planner.
2. Add B2B and B2C executable configurations.
3. Prove that goal order cannot affect results.
4. Prove that an Organization cannot remove the universal minimum goal.

Completion gate: all four Opportunity Types evaluate deterministically with no HubSpot imports.

### Phase 3: HubSpot projection

1. Implement the Lead/Deal split adapter.
2. Map one Relationship Type to paired Lead and Deal pipelines.
3. Use native Products and Line Items for offerings.
4. Implement snapshot loading for configured activity and transaction evidence.
5. Implement lifecycle-stage projection as an optional derived write.

Completion gate: contract tests prove the adapter preserves kernel semantics without Jurnii assumptions.

### Phase 4: Schema reconcile in developer account

1. Generate a plan from the capability audit and Organization fixtures.
2. Apply only generic properties and configured pipelines to the developer test account.
3. Read back every category.
4. Re-plan and prove the second plan is empty.

Completion gate: no custom object, no production mutation, no skipped schema category, and no invented association ID.

### Phase 5: Vertical slice

Run the acceptance scenarios below in the developer test account. Capture IDs, before/after snapshots, transition keys, and replay results with personal data redacted.

## 11. Mandatory acceptance scenarios

### 11.1 MQL minimum

1. Contact with no usable email, phone, messaging identifier, or configured communication address remains MQL `PENDING`.
2. Adding one usable channel satisfies the universal MQL goal.
3. Explicit consent is absent and MQL still completes in the baseline configuration.
4. In a configuration that requires explicit consent, the same subject remains pending until consent is true.

### 11.2 B2B SQL

1. MQL completion moves the B2B Lead to SQL.
2. A known offering without the configured positive Meeting outcome leaves SQL pending.
3. An unrelated or pre-opportunity Meeting does not satisfy the goal.
4. A correctly associated, in-window Meeting with the configured positive outcome satisfies SQL.
5. SQL completion qualifies the Lead and creates exactly one FTP Deal.

### 11.3 B2C SQL

1. Contact-only B2C works without a Company.
2. No salesperson, call, demo, or Meeting is required.
3. A Cart or configured offering-interest record with at least one offering satisfies SQL.
4. The engine creates exactly one FTP Deal containing the relevant Line Item or Items.

### 11.4 Multiple offerings

1. Two offerings in the same relationship create one FTP Deal with two Line Items.
2. They do not create two Deals solely because there are two Products.
3. If the offerings truly require different qualification processes, the configuration must identify different Relationship Types.

### 11.5 Parallel relationship types

One Contact or Company may simultaneously have B2B and Partnership relationships. The records must have different `coa_relationship_key` values and use their configured pipeline pairs without overwriting one another.

### 11.6 FTP and RTP planning

1. No completed transaction leaves FTP pending.
2. Configured first-transaction evidence satisfies FTP and plans one RTP successor.
3. The same transaction cannot satisfy `RTP_1`.
4. A later transaction after FTP completion satisfies `RTP_1` and plans `RTP_2`.
5. Each later RTP requires new evidence after the preceding completion boundary.

### 11.7 Replay and concurrency

For every transition:

- Deliver the same webhook at least three times.
- Deliver property and association events out of order.
- Run two workers concurrently.
- Reclaim a deliberately expired lease.
- Verify one transition key, one successor record, one mapping, and no duplicate Line Items or Manual Review Tasks.

### 11.8 Failure semantics

- HubSpot `429` and transient `5xx`: retry with `next_attempt_at` and backoff.
- HubSpot validation error: non-retryable dead letter with redacted evidence.
- Missing configuration: explicit blocker, not a default relationship.
- Unsupported object: explicit parked/dead-letter state.
- Database unavailable: ingress returns non-2xx so HubSpot retries.
- Read-after-write mismatch: job fails and retries; it is not marked complete.

## 12. CI and evidence requirements

### 12.1 Ordinary CI

Required on every pull request:

- Node 22.
- `npm ci`.
- Full `npm audit`, not an inaccurately labeled partial audit.
- TypeScript build.
- Unit and contract tests.
- PostgreSQL integration tests against an ephemeral PostgreSQL service.
- Migration apply from an empty database and migration re-run safety.
- Static validation of HubSpot metadata and Organization configuration schemas.
- A check that active code/config/tests contain no forbidden Jurnii identifiers.

### 12.2 Authenticated developer-account validation

Create a separate, manually triggered workflow protected by a `hubspot-development` environment:

- Inject the HubSpot credential explicitly.
- Target the recorded developer test portal ID.
- Run `hs project validate` without a skip branch.
- Run schema inspect and plan.
- Require a separate explicit input before schema apply.
- Upload/install only when separately authorized.
- Publish redacted validation and readback artifacts.

### 12.3 Required sprint evidence

The implementation is not complete without:

- Current capability audit.
- Commercial-model schema and both example configurations.
- Kernel contract-test report.
- PostgreSQL integration-test report.
- HubSpot metadata validation evidence.
- Schema plan, apply, readback, and empty second plan from the developer test account.
- Redacted B2B and B2C end-to-end logs.
- Replay/concurrency evidence.
- An explicit list of unimplemented conditional evidence providers.

## 13. Definition of done

The sprint is complete only when all of the following are true:

1. Active runtime code contains no Jurnii product, pipeline, pricing, or sequence assumptions.
2. Organization, Relationship Type, Opportunity Type, Offering, and Qualification Goal are distinct types.
3. MQL, SQL, FTP, and RTP universal minimums are enforced and cannot be removed by configuration.
4. B2B and B2C use different configured evidence while preserving the same Opportunity Types.
5. Contacts and Companies remain subjects; Products and Line Items remain offerings; Leads and Deals remain opportunity projections.
6. No custom object has been created.
7. Generic `object.*` webhooks normalize and reconcile by `objectTypeId`.
8. No webhook invents relationship type, product interest, role, or qualification evidence.
9. Unknown jobs cannot be marked completed.
10. The schema tool reconciles every supported category and produces an empty second plan.
11. PostgreSQL integration tests use a real database.
12. Replay and concurrent workers cannot duplicate successors or transitions.
13. The preferred Lead/Deal projection is proven in the developer test account, or the exact entitlement blocker is recorded.
14. No production portal, production workflow, real sequence, or live customer record has been mutated.

## 14. Handoff boundary after this sprint

Only after this sprint should the next implementation choose and build optional business capabilities:

- Activity outcome libraries and role-specific workflows.
- Outreach and human activation.
- Commercial-instrument strategies: simple Order, Deal close, Quote, Invoice/Payment, Subscription, or non-monetary Agreement.
- Jurnii's Quote-driven multi-product and pricing profile.
- Onboarding and fulfillment objects.
- Forecast calibration.
- Multi-tenant OAuth distribution.

The next sharp question after this sprint is not how to recreate the Zoho functions. It is which optional commercial-instrument strategy each Organization assigns to each Relationship Type while preserving the same MQL → SQL → FTP → RTP kernel.
