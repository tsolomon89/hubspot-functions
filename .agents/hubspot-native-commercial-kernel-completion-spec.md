# Completion Implementation Specification: HubSpot-Native Universal Commercial Kernel

**Target repository:** `tsolomon89/hubspot-functions`  
**Baseline commit:** `aa007a719f7d8fdcd8def057a0571dc2c9f7ae08`  
**Baseline URL:** https://github.com/tsolomon89/hubspot-functions/commit/aa007a719f7d8fdcd8def057a0571dc2c9f7ae08  
**Baseline date:** 2026-08-05  
**Execution target:** an isolated HubSpot developer test account only  
**Instruction type:** implement the work, verify it, and report evidence. Do not return only a revised plan.

## 1. Directive

Continue from the current repository state and finish the HubSpot-native Universal Commercial Kernel.

The active architecture is now correct:

```text
HubSpot workflow
  -> bundled HubSpot custom code action
  -> fresh HubSpot CRM snapshot
  -> pure commercial-kernel evaluation
  -> HubSpot CRM mutation
  -> authoritative readback verification
```

HubSpot is the sole durable commercial system of record. Preserve that boundary.

Do not add or restore PostgreSQL, Vercel, an API server, webhooks requiring an external endpoint, a queue, a worker, polling, a transition ledger, a dead-letter store, or any other external persistence or runtime. Do not create a custom CRM object.

The target lifecycle remains:

\[
\text{Organization}
\rightarrow
\text{Relationship Type}
\rightarrow
\text{MQL}\rightarrow\text{SQL}\rightarrow\text{FTP}\rightarrow\text{RTP}_1\rightarrow\text{RTP}_2\rightarrow\cdots
\]

The accepted object model is:

| Commercial concept | HubSpot representation |
|---|---|
| Person subject | Contact |
| Business/entity subject | Company |
| MQL and SQL qualification | One Lead per commercial relationship |
| FTP or RTP transaction opportunity | One Deal per transaction cycle |
| Reusable offering | Product |
| Offering instantiated on a transaction | Line Item |
| Qualification evidence | Native activities and configured native objects |
| Human-friendly progress summary | Contact/Company lifecycle stage, as an optional derived projection |

MQL, SQL, FTP, and RTP are universal Opportunity Types. Stronger requirements, including explicit consent, demographic data, firmographic data, lead source, meeting outcomes, or other evidence, belong to the Organization's configuration. They are not universal kernel requirements.

This specification supersedes every part of `.agents/hubspot-universal-commercial-kernel-next-sprint-spec.md` that requires an external service, webhook receiver, PostgreSQL, a queue, a worker, or database migrations. Preserve the ontology and native-object decisions from that document, not its obsolete runtime design.

## 2. What exists at the baseline

The repository already contains real implementation work:

- A pure TypeScript commercial kernel.
- YAML Organization configurations compiled into the runtime bundle.
- A HubSpot snapshot loader and mutation adapter.
- A single custom code action entry point.
- Deterministic Lead, FTP, and RTP opportunity keys.
- Unique HubSpot properties intended to prevent duplicate Leads and Deals.
- Suppression checks across the enrolled subject.
- Readback receipts for many mutations.
- Fake-CRM tests that exercise `Contact -> Lead -> FTP -> RTP1 -> RTP2` with replay safety.
- A schema manifest and schema reconciliation CLI.
- A committed CommonJS bundle for the HubSpot custom code editor.

That is a prototype, not a finished installation.

## 3. Known completion gaps

Treat the following as confirmed defects or missing deliverables. Verify them against the current tree before editing, then close them rather than merely documenting them.

### 3.1 Build, configuration, and documentation

1. GitHub CI fails before build and tests because `ajv-cli` is invoked with the unsupported `--parser yaml` option.
2. Configuration validation is shallow. The JSON Schema does not validate goal structure, supported predicates, predicate parameters, evidence scopes, stage mappings, or unknown properties.
3. `OrganizationConfigResolver` contains silent fallbacks to `b2b`, `org_global_corp`, and hard-coded B2B pipeline IDs outside the explicit portal installation mapping.
4. The B2C fixture is compiled under a different Organization and is not reachable as a relationship configuration for the recorded test installation.
5. The HubSpot schema manifest contains only B2B pipelines.
6. `.env.example` still advertises a server and PostgreSQL database that no longer exist.
7. Setup and production documents contradict each other about portal `149041124`, the canonical app UID, and whether the target is development or production.
8. `app-hsmeta.json` contains placeholder support URLs and its scope list has not been reconciled against the endpoints the runtime and schema tools actually call.
9. The checked-in capability audit contains assertions that are not backed by reproducible API evidence and still contains stale external-service or Zoho assumptions.
10. The runtime imports through a barrel that also exports the schema CLI, causing the custom-code bundle to include YAML parser code and other build-time-only dependencies.

### 3.2 Commercial and identity semantics

1. A singular `coa_relationship_key` and `coa_relationship_type` on a Contact or Company cannot be the authority for simultaneous B2B, B2C, Partnership, or other relationships.
2. Relationship identity is not deterministically namespaced by Organization, Relationship Type, and the resolved subject anchor.
3. Lead and Deal configuration resolution still depends on workflow input or B2B fallback instead of the enrolled opportunity record's persisted Organization and Relationship Type.
4. The code selects the first associated Contact or Company returned by HubSpot. It has no explicit primary-contact rule and does not safely handle multiple Contacts.
5. Association and activity pagination is not implemented.
6. Contact phone fields are not loaded, so a phone-only subject cannot satisfy the universal MQL communication-channel minimum.
7. A Company-plus-Contacts subject does not aggregate all configured, relationship-relevant communication and suppression evidence.

### 3.3 Kernel and evidence semantics

1. The configuration contract advertises a richer predicate DSL than the evaluator implements. `count`, `all`, `any`, and `not` are absent.
2. Unknown predicates silently evaluate false instead of failing configuration validation.
3. Planner timestamps use `new Date()` directly, making boundary behaviour non-deterministic in tests.
4. `mqlCompletedAt` is planned but never persisted.
5. SQL evidence is therefore scoped from Lead creation instead of the MQL-to-SQL boundary.
6. `coa_opportunity_type` on the Lead remains `MQL` after the Lead advances to SQL.
7. `coa_unsatisfied_goal_keys` and `coa_last_evaluated_at` exist in the manifest but are not written.
8. Evidence timestamps are compared as strings in some paths instead of parsed instants.
9. The B2B configuration names contract or order evidence that the loader does not actually inspect. The current runtime only proves a Deal was marked Closed Won. Configuration names must describe the evidence actually evaluated.

### 3.4 HubSpot mutation correctness

1. Initial Lead creation does not perform the same comprehensive readback verification used for successor Deals.
2. Updating offering keys on an existing Lead is not read back and verified.
3. HubSpot tokens are allowed to remain undefined until an API call fails. Runtime execution must fail fast with a clear, non-secret error.
4. Association type IDs are scattered as magic numbers instead of being resolved or verified through one association registry.
5. Successor Deal creation recovers the relationship key by splitting the successor key string, coupling persistence to an undocumented delimiter format.
6. The predecessor completion timestamp on a successor must come from the authoritative completed predecessor state, not merely the local time at which a later workflow action happened to run.
7. Manual-review Tasks are not replay-safe or concurrency-safe.
8. Lifecycle projection updates only one subject record in some Company-plus-Contact paths.
9. Readback verification has no bounded retry for normal HubSpot read-after-write propagation within the custom code action's runtime limit.

### 3.5 Native offering model

1. Products are not loaded or resolved.
2. Line Items are not created, loaded, associated, or verified.
3. `coa_offering_keys` is a comma-separated string and is not validated against HubSpot Products.
4. Offering references are not carried from the qualifying Lead into the FTP transaction.
5. Multiple offerings have not been proven to produce one Deal with multiple Line Items.
6. Line Item creation has no deterministic, replay-safe identity.
7. RTP offering carry-forward behaviour is not configured or implemented.

### 3.6 Deployment reality

1. No authenticated evidence proves that the project metadata validates and uploads.
2. No authenticated evidence proves schema `inspect -> plan -> apply -> readback -> empty second plan`.
3. No repository-controlled desired-state description or inspection command proves the required HubSpot workflows exist with the correct triggers, secret, inputs, outputs, code bundle, and re-enrollment settings.
4. The current workflow guide does not fully configure the private-app token secret or the actual custom-code input/output fields.
5. No live test records prove the lifecycle in a developer test account.

## 4. Non-negotiable invariants

These are acceptance rules, not suggestions.

1. HubSpot remains the only durable runtime state.
2. The commercial kernel must not import the HubSpot SDK, read environment variables, read files, or know HubSpot property names.
3. Active runtime code must not import or execute anything under `zoho/`.
4. No active code, configuration, or test may invent a relationship type, offering, consent, meeting outcome, role, transaction, or other qualification evidence.
5. Missing or unsupported configuration must fail closed with a typed blocker. It must never silently become B2B.
6. The explicit default Relationship Type in a verified portal installation may be used only when bootstrapping a subject. It is not a global fallback.
7. A Lead or Deal must resolve its configuration from its own persisted `organizationKey` and `relationshipType` projection.
8. One commercial relationship has one managed Lead spanning MQL and SQL.
9. One FTP or RTP cycle has one managed Deal.
10. Multiple Products in the same transaction produce multiple Line Items on one Deal, not one Deal per Product.
11. Products are catalog templates. The engine must not create placeholder Products to make SQL pass.
12. A Line Item belongs only to its own Deal parent. Do not reuse the same Line Item across Deals, Quotes, or other parents.
13. Universal minimum goals cannot be removed, replaced, or weakened by Organization configuration.
14. A Meeting or transaction outside the current opportunity window cannot satisfy the current opportunity.
15. A lost or disqualified opportunity cannot create a successor.
16. Replaying or concurrently executing the same state must not create a second Lead, Deal, Line Item, or Manual Review Task.
17. Every mutation must have an authoritative readback receipt. A `2xx` create or update response alone is not proof.
18. Do not close an open Deal merely to manufacture transaction evidence. The kernel reacts to configured evidence such as a human or another native HubSpot process marking the Deal Closed Won.
19. No production portal, production workflow, live sequence, or real customer record may be mutated.
20. Do not commit tokens, access keys, client secrets, workflow secret values, real customer data, or unredacted live exports. The repository is public.
21. Do not commit, push, open a pull request, or deploy to a standard/production account unless separately instructed. Developer-test installation and mutation are within this specification only after the account guard passes.

## 5. Required execution order

Do not skip gates. Do not stop after an intermediate gate and call the implementation complete.

### Phase 0: Establish the real account boundary

1. Inspect the current branch, status, HEAD, project metadata, local HubSpot CLI configuration, and available authenticated accounts.
2. Determine whether portal `149041124` is:
   - the development/project-owning account,
   - an actual developer test account used for CRM execution, or
   - a standard/production account.
3. Do not trust the committed labels. Verify account identity and role from HubSpot.
4. Reuse an existing isolated developer test account if one exists. Otherwise create one only if the authenticated tooling permits this developer-test action.
5. Record the project-owning account separately from the CRM execution/test account. `portal-installations.yaml` must map the portal ID that will appear in the workflow action's `event.origin.portalId`.
6. Add an `accountRole: developer-test` guard and the expected execution portal ID to the installation configuration and every mutating schema/test command.
7. If the authenticated account cannot be proven to be a developer test account, do not mutate it. Finish all local work and report the exact blocker.

Gate: there is one verified execution portal ID classified as `developer-test`, and every later mutation command refuses any other portal.

HubSpot's current account guidance distinguishes developer test accounts from the account used to own projects. Use the official account and configurable-test-account documentation when verifying this boundary:

- https://developers.hubspot.com/docs/getting-started/account-types
- https://developers.hubspot.com/docs/developer-tooling/local-development/configurable-test-accounts

### Phase 1: Repair CI and remove runtime drift

1. Replace the broken `ajv-cli --parser yaml` command with a repository script that:
   - parses YAML with the pinned YAML library,
   - validates the resulting object with a pinned JSON Schema validator,
   - reports every configuration error with filename and object path,
   - exits non-zero on any error,
   - rejects duplicate `organizationKey + relationshipType` keys.
2. Add an explicit `config:validate` script and make configuration validation run before config compilation and bundling.
3. Make `compile-configs.ts` refuse to generate output from invalid configuration.
4. Make generated `embedded-configs.ts` and the custom-code bundle reproducible. CI must regenerate them and fail if the committed artifacts differ.
5. Replace default-suite tests that intentionally contact HubSpot with invalid credentials. Ordinary CI must be fully offline and deterministic. Authenticated tests belong in a separately gated job.
6. Keep ordinary CI uncredentialed. It must run dependency installation, audit, strict config validation, TypeScript checks, unit/contract tests, bundle generation, bundle contract tests, and project metadata validation that can genuinely run without account credentials.
7. Pin the HubSpot CLI version used by CI. Do not install `latest` on every run.
8. Add a separate manual authenticated workflow protected by a `hubspot-development` environment. It may inspect and validate the developer test account. Schema application and test-record mutation must require explicit workflow inputs and the account-role guard.
9. Remove obsolete server and database variables from `.env.example`.
10. Import runtime modules directly instead of through the domain barrel that exports build-time schema tooling. The runtime bundle must not contain the YAML parser, filesystem access, schema CLI, or unused server code.
11. Verify the bundle loads as CommonJS and exposes `main` without relative runtime imports.
12. Match the bundle target to the Node runtime currently offered by HubSpot's custom code action editor. Record that runtime in the workflow desired state.

Gate: ordinary CI is green from a clean checkout, generated artifacts are reproducible, and the custom-code bundle contains only runtime dependencies.

HubSpot currently documents a 20-second execution limit, 128 MB memory limit, the supported `@hubspot/api-client` major version, and retry behaviour for API-client `429`/`5xx` failures. Design and test within those limits:

- https://developers.hubspot.com/docs/api-reference/legacy/automation/workflow-actions/custom-code-actions

### Phase 2: Make Organization configuration authoritative

1. Redesign `portal-installations.yaml` so each installation records:
   - execution portal ID,
   - account role,
   - Organization key,
   - allowed Relationship Types,
   - an optional explicit default Relationship Type for subject bootstrap,
   - the expected config version or accepted version range.
2. Make the developer-test Organization contain both executable B2B and B2C Relationship Type configurations. Examples may remain generic, but both paths must be resolvable in the test portal without substituting another Organization.
3. Expand the commercial-model JSON Schema. Use `additionalProperties: false` wherever practical. Validate:
   - Organization and Relationship Type identity,
   - subject-resolution strategy,
   - Lead and Deal pipeline/stage mappings,
   - explicit Deal-stage probabilities,
   - the complete recursive goal DSL,
   - supported predicates and their parameters,
   - evidence scopes,
   - activity/outcome mappings,
   - Product offering-key mapping,
   - RTP offering carry-forward policy,
   - feature flags.
4. Reject unknown predicates, unknown evidence scopes, duplicate goal keys, attempts to reuse a universal goal key, missing stage mappings, and missing open-stage probabilities at build time.
5. Remove adapter and resolver fallbacks to `org_default`, B2B, or hard-coded pipeline IDs.
6. For Lead and Deal enrollment, load minimal routing properties first, then resolve the exact Organization configuration from the opportunity record.
7. For Contact or Company bootstrap, require either:
   - an explicit Relationship Type supplied by the workflow definition, or
   - the verified installation's explicit default.
8. Define deterministic relationship identity from Organization, Relationship Type, and the configured subject anchor. Do not infer it from a singular subject-global relationship field.
9. Implement this through one pure `deriveRelationshipKey(organizationKey, relationshipType, subjectAnchor)` contract. Treat the returned key as opaque everywhere else.
10. Add and persist `coa_organization_key` on managed Leads and Deals. Persist `coa_relationship_type` and the derived `coa_relationship_key` with it so an enrolled opportunity can resolve its configuration without guessing.
11. Treat Contact/Company relationship fields, if retained for operator convenience, as bootstrap hints or derived projections. The managed Lead and Deal records are authoritative for relationship-specific state.
12. Prove that the same Contact or Company can hold two simultaneous Relationship Types with different relationship keys, Leads, and pipeline mappings.

Gate: B2B and B2C resolve under the same verified developer-test Organization, no unsupported portal or relationship can fall back to B2B, and parallel relationships do not overwrite each other.

### Phase 3: Complete the pure kernel

1. Keep the kernel free of HubSpot concepts.
2. Enforce both parts of the universal MQL minimum: the subject reference must be identifiable and at least one configured communication channel must be usable.
3. Implement and test the full declared predicate set for this sprint:
   - `anyCommunicationChannel`,
   - `property` with the supported comparison operators,
   - `associationExists`,
   - `activityExists`,
   - `offeringKnown`,
   - `transactionExists`,
   - `count`,
   - recursive `all`, `any`, and `not`.
4. Validate predicates before runtime. An evaluator default branch must never silently convert an unknown predicate into a normal `PENDING` result.
5. Inject a clock into transition planning. Pure tests must use fixed timestamps.
6. Add explicit transition details for all engine-owned evaluation fields:
   - current Opportunity Type,
   - qualification state,
   - satisfied or unsatisfied goal keys as required by the schema,
   - last evaluated timestamp,
   - config version,
   - MQL completion timestamp when entering SQL.
7. When a Lead is at SQL, define its opportunity `openedAt` as the persisted MQL completion boundary. Do not use Lead creation time.
8. If an existing SQL Lead lacks a trustworthy MQL completion boundary, fail closed with a typed manual-review/configuration result. Do not silently broaden the evidence window.
9. Parse timestamps to instants before comparison. Define and test the exact inclusive boundary rule.
10. Derive FTP/RTP successor intents from explicit relationship data carried in the snapshot and intent. Never recover semantic fields by splitting an opaque key.
11. Keep lifecycle-stage projection optional and configuration-controlled. It is a summary, not the opportunity ledger.
12. Rename example goals so they describe evidence the adapter actually reads. Do not call a Closed Won Deal a signed contract or Order unless the adapter proves a signed contract or Order exists.

Gate: deterministic kernel tests prove all Opportunity Types, all supported predicates, boundary semantics, lost/disqualified terminal behaviour, and goal-order independence.

### Phase 4: Complete snapshot reconstruction and mutation verification

1. Fail fast before the first CRM call if the required workflow secret is missing. Tests may inject a fake client without a secret.
2. Normalize the official custom-code event shape, including numeric or string record IDs and canonical object types.
3. Load all configured communication fields, including email and phone channels used by the MQL minimum.
4. Paginate every association and activity query that may return more than one page.
5. Replace "first associated record" behaviour with an explicit subject-resolution rule:
   - use a configured/verified primary association when present,
   - accept the sole associated Contact when exactly one exists,
   - when multiple Contacts exist without an authoritative primary and the choice matters, return `MANUAL_REVIEW` instead of guessing.
6. Scope activity evidence to Contacts actually participating in the managed relationship or Lead. Do not let an unrelated Company Contact's Meeting qualify the Lead.
7. Read and normalize the portal's actual Meeting outcome values. Do not map every non-`COMPLETED` value to `HELD`.
8. Persist and read back MQL completion and predecessor completion boundaries.
9. Use an authoritative HubSpot completion timestamp for a closed predecessor. Do not use local successor-creation time when a native closure timestamp is available.
10. Centralize association definitions. For HubSpot-defined default associations, either resolve them from the API or verify named constants against the account. Resolve user-defined labels dynamically in both directions. No unexplained association numbers may remain inline.
11. Apply and verify every engine-owned evaluation property on pending and satisfied evaluations.
12. Add comprehensive readback to:
   - initial Lead creation,
   - existing Lead offering updates,
   - Lead stage and Opportunity Type changes,
   - Deal creation and updates,
   - lifecycle projections,
   - associations,
   - Line Items,
   - Manual Review Tasks.
13. Add bounded readback retry with backoff that remains safely inside HubSpot's custom-code runtime limit.
14. Preserve and rethrow original HubSpot `429` and transient `5xx` errors so HubSpot can apply its documented retry behaviour. Convert permanent validation/configuration failures into typed non-success results or manual-review outcomes rather than pretending they succeeded.
15. Make Manual Review Tasks deterministic and duplicate-safe. Prefer a unique app-owned Task property if the developer-test account supports it. If not, implement and document the strongest account-supported idempotency mechanism and prove it under concurrent fake executions.
16. For Company-plus-Contacts, project lifecycle stage to the configured target set. Do not leave the participating Contact and Company in contradictory states without an explicit policy.
17. Redact tokens, authorization headers, emails, phone numbers, and request bodies from errors and logs.

Gate: adapter contract tests fail any unverified receipt, initial Lead creation is fully verified, phone-only MQL works, evidence is relationship-scoped, and replay/concurrency cannot duplicate managed records.

### Phase 5: Implement native Products and Line Items

1. Define an `OfferingRef` in the kernel without HubSpot fields. Map it in the HubSpot adapter to Product records.
2. Configure the Organization's Product offering key. Prefer Product SKU or another explicitly configured unique Product property.
3. Add the Product read capability and scope actually required by the Product endpoint. Derive the complete scope list from an endpoint-to-scope inventory and official documentation. Do not invent scope names.
4. Normalize and deduplicate explicit offering input before persisting it on the Lead.
5. Resolve each offering key to exactly one existing Product:
   - zero matches: SQL remains pending or becomes a typed configuration/manual-review blocker,
   - more than one match: configuration/data-integrity blocker,
   - one match: valid offering evidence.
6. Do not create a Product automatically.
7. It is acceptable to retain offering references on the Lead because a qualifying Lead needs to know the intended offering before a Deal exists. Once a Deal exists, native Line Items are authoritative for transaction offerings.
8. On SQL completion, create exactly one FTP Deal, then create one Line Item per offering and associate each Line Item only with that Deal.
9. Create Line Items from existing Products using the Product reference property required by the pinned HubSpot API version. Supply quantity and other transaction-specific terms only from explicit configured or workflow input. Do not invent price, quantity, discount, currency, or billing frequency.
10. Add a deterministic unique Line Item key, for example a function of Deal opportunity key plus normalized offering key. Use it to search, create-once, re-read, and verify under replay and concurrency.
11. Never modify or delete unmanaged human-created Line Items.
12. Define RTP offering behaviour in Organization configuration. It must be explicit, such as:
    - `carryForward`: create new Line Items on the new RTP Deal from the predecessor's configured offering set, or
    - `emptyUntilKnown`: create the RTP Deal without offerings until new offering evidence is supplied.
13. Never reuse a predecessor Deal's Line Item record on a successor Deal.
14. Load Deal Line Items into transaction snapshots and derive offering evidence from them.
15. Read back Product identity, Line Item identity, parent association, quantity, and every app-owned property before marking the transition verified.

Gate: one Lead with two valid offering references produces one FTP Deal with two distinct, verified Line Items; three replays and two concurrent executions still leave one Deal and two Line Items.

HubSpot documents Products as reusable catalog objects and Line Items as transaction-specific instances. It also states that a Line Item should have one parent object:

- https://developers.hubspot.com/docs/api-reference/legacy/crm/objects/products/guide
- https://developers.hubspot.com/docs/api-reference/legacy/crm/objects/line-items/guide

### Phase 6: Finish schema, app, and workflow installation

#### 6.1 Schema reconciler

1. Rework `inspect -> plan -> apply -> readback` so it compares every category independently. Remove the shortcut that treats the presence of any `coa_` property as proof that all other categories exist.
2. Inspect every object used by the active runtime, including Contacts, Companies, Leads, Deals, Line Items, and Tasks when Task idempotency requires a custom property. Inspect Products read-only for offering-key capability.
3. Inspect property groups, properties, Lead pipelines, Deal pipelines, stages, probabilities, and required association definitions.
4. Add both B2B and B2C Lead/Deal pipeline pairs to the manifest for the developer-test Organization.
5. Never treat an existing property with the wrong type, field type, uniqueness, options, or group as a create. Report a typed conflict and stop.
6. Do not swallow `403`, entitlement errors, or inspection failures and convert them to an empty schema.
7. Do not invent default Deal probabilities during apply. All probabilities must come from validated Organization configuration.
8. Refuse deletion, destructive type changes, or mutation of unmanaged pipelines.
9. Require the expected developer-test portal ID and account role on every apply.
10. Persist a redacted plan artifact before mutation, apply it, read back all categories, and prove that the second plan is empty.
11. `applied: true` is forbidden if any category was skipped, conflicted, swallowed, or remained different on readback.

#### 6.2 App metadata and authentication

1. Select one canonical app asset UID. If no deployed app exists, retain the current manifest UID `commercial_operations_automation_app`. If HubSpot reports an already-deployed immutable UID, use that value and update every document consistently.
2. Remove the stale `jurnii_commercial_automation` and conflicting UID references from active setup documents.
3. Replace placeholder support and documentation metadata with valid values permitted by the current HubSpot project schema, or omit optional placeholders.
4. Build an endpoint-to-scope matrix covering every runtime and schema call. Reconcile `requiredScopes`, conditional scopes, and the workflow private-app/static token from that matrix and live authorization results.
5. Do not add supposed Meeting or Task scopes merely by name. Use the exact scopes listed for the endpoints in the current official documentation and prove the token can perform the required developer-test calls.
6. Document exactly how the app/static token is installed in the developer test account and added to each custom code action as the `PRIVATE_APP_ACCESS_TOKEN` secret.
7. If scopes change, reinstall the app in the developer test account before claiming the new scopes are active.

The current HubSpot scopes documentation requires scope selection to follow the endpoint being called:

- https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/scopes

#### 6.3 Workflow desired state and verification

1. Add repository-controlled desired-state files for workflow coverage. They must record, for every required workflow:
   - name and object type,
   - Relationship Type routing rule,
   - enrollment and re-enrollment triggers,
   - suppression conditions,
   - custom-code runtime,
   - exact bundle hash,
   - selected secret name,
   - input variables and their source properties or constants,
   - output variable names and types,
   - enabled/disabled state.
2. Add a read-only workflow inspection/verification command using HubSpot's current workflow APIs where available. It must compare live workflows with desired state and report actionable differences.
3. Use the Workflows v4 API to create or update workflows only if the current beta API supports the exact custom-code action, code, secret, inputs, outputs, and enrollment semantics required here. Do not treat an unrelated built-in or external custom workflow action as equivalent.
4. If HubSpot still requires the in-app custom-code editor for any part of this setup, perform that step through the authenticated developer-test UI when tooling permits, then verify it through API/readback. Otherwise produce an exact operator checklist and mark installation blocked, not complete.
5. Do not create an app-based custom workflow action that calls an external `actionUrl`. That would violate the HubSpot-native runtime boundary.
6. The workflow coverage must include every state-changing input, not merely the four record types. At minimum it must ensure reconciliation occurs for:
   - Contact/Company subject bootstrap and communication/consent/suppression changes,
   - explicit B2B and B2C subject routing,
   - Lead offering and stage changes,
   - completed Meeting evidence relevant to an SQL Lead,
   - Deal stage changes,
   - Line Item changes where they affect evaluation.
7. Do not rely on a Contact email or lifecycle-stage change to notice a later completed Meeting.
8. Configure re-enrollment deliberately so future FTP/RTP cycles and later evidence changes can invoke the action, while deterministic keys keep execution idempotent.
9. Install workflows disabled first. Test each custom-code action against dedicated fixture records, inspect outputs/logs, then enable only in the developer test account.

The Workflows v4 API is currently documented as beta, while in-portal custom code actions have their own code, secret, input, and output configuration. Verify current capabilities instead of assuming the API can provision every custom-code detail:

- https://developers.hubspot.com/docs/api-reference/legacy/automation/workflows/guide
- https://developers.hubspot.com/docs/api-reference/legacy/automation/workflows/action-enrollment-reference
- https://developers.hubspot.com/docs/api-reference/legacy/automation/workflow-actions/custom-code-actions

Gate: project metadata validates, the app is installed in the verified developer test account, schema readback is exact with an empty second plan, and live workflows match the committed desired state or the remaining in-portal step is reported as an explicit blocker.

### Phase 7: Run the authenticated vertical slices

Use only synthetic records in the verified developer test account. Give every fixture a unique run marker such as `COA_E2E_<timestamp>`. Use reserved test domains and no real customer data. Preserve the fixture IDs in the local/redacted evidence report until review; do not delete records as part of this task.

#### Scenario A: B2B lifecycle

1. Create a Company and participating Contact with no usable communication channel.
2. Verify the B2B Lead remains MQL `PENDING` and records the unsatisfied communication goal.
3. Add a usable communication channel while explicit consent is absent. Because the B2B Organization configuration requires consent, verify MQL remains pending.
4. Add consent. Verify the same Lead moves to SQL, changes `coa_opportunity_type` to `SQL`, and persists the MQL completion boundary.
5. Add two valid Product offering references. Verify SQL remains pending without the configured completed Meeting.
6. Prove that a Meeting before the MQL completion boundary does not qualify SQL.
7. Add a correctly associated completed Meeting after the boundary. Verify the Lead becomes Qualified and one FTP Deal is created.
8. Verify the FTP Deal has exactly two managed Line Items, one for each Product.
9. Replay the Contact, Company, and Lead paths at least three times. Verify there is still one Lead, one FTP Deal, and two Line Items.
10. Mark the FTP Deal Closed Won through the normal developer-test CRM path. Verify exactly one `RTP::1` Deal is created with the authoritative predecessor boundary.
11. Mark `RTP::1` Closed Won. Verify exactly one `RTP::2` Deal is created.
12. Replay both won Deals. Verify no additional successor or Line Item is created.

#### Scenario B: B2C lifecycle

1. Create a Contact with no Company.
2. Route it explicitly through the B2C configuration.
3. Verify the universal MQL minimum can complete without explicit consent because the B2C fixture does not add that requirement.
4. Supply configured offering-interest evidence using a supported Cart provider if the developer test account exposes it. If Cart is unavailable, use the explicitly configured proposition/interest property and record the Cart capability blocker.
5. Verify no salesperson, Call, or Meeting is required by the B2C SQL configuration.
6. Verify one Lead qualifies and one FTP Deal with the configured Line Items is created.
7. Replay the path and verify no duplicate records.

#### Scenario C: Parallel relationships

1. Use one synthetic Contact in two explicitly configured Relationship Types.
2. Verify two distinct relationship keys and two managed Leads.
3. Verify each Lead uses its configured Lead pipeline and goals.
4. Qualify both and verify their Deals use different configured Deal pipelines without overwriting either relationship.

#### Scenario D: Suppression and ambiguity

1. Suppress the participating Contact and verify no Lead is created or advanced.
2. Suppress the Company and verify the Company-plus-Contact B2B relationship is blocked.
3. Create multiple Company Contacts without an authoritative primary where the configuration requires one. Verify manual review instead of arbitrary first-record selection.
4. Re-run manual review concurrently and verify one Task.

#### Scenario E: Failure and receipt semantics

1. Fake HubSpot `429` and transient `5xx` responses and prove the original retryable error is rethrown.
2. Fake a permanent validation error and prove it is not reported as verified success.
3. Fake a readback mismatch and prove the action performs bounded readback retry, then fails if the mismatch persists.
4. Run two fake action executions concurrently for Lead, Deal, Line Item, and Task creation. Verify deterministic uniqueness and conflict re-read.
5. Where the developer-test UI permits, trigger closely spaced duplicate enrollments and verify the same live invariants.

Gate: redacted evidence proves B2B, B2C, parallel relationship isolation, suppression, replay safety, and FTP/RTP succession in the actual developer test account.

## 6. Required test coverage

The default test suite must include the following without live network access:

### Kernel tests

- Universal MQL, SQL, FTP, and RTP minimum injection.
- Organization goals add to rather than replace universal goals.
- Goal order independence.
- Every supported predicate and recursive logical composition.
- Unknown predicate/config rejection.
- Opportunity and predecessor evidence windows, including exact boundary timestamps.
- Deterministic planner output with an injected clock.
- Lost and disqualified terminal behaviour.

### Configuration tests

- Full JSON Schema validation for every committed YAML configuration.
- Duplicate Organization/Relationship Type rejection.
- No silent default configuration.
- Portal role and portal ID guards.
- B2B and B2C config compilation under the developer-test Organization.
- Pipeline/stage/probability completeness.

### Adapter tests

- Contact-only, Company-only where supported, and Company-plus-Contacts snapshots.
- Phone-only MQL.
- Association/activity pagination.
- Primary Contact resolution and ambiguity.
- Relationship-scoped Meeting evidence.
- Initial Lead readback and existing Lead update readback.
- Lead Opportunity Type and MQL completion persistence.
- Evaluation metadata persistence.
- Product resolution and zero/multiple-match blockers.
- One Deal with multiple Line Items.
- RTP carry-forward and empty-until-known policies.
- Idempotent Manual Review Task creation.
- Verified associations and lifecycle projection targets.
- Redaction of secrets and personal data.

### Action and lifecycle tests

- Official custom-code event payload shape.
- Missing-secret failure before CRM access.
- Contact, Company, Lead, and Deal enrollment.
- Completed-Meeting-triggered reconciliation coverage.
- Stateful `Contact -> Lead -> FTP -> RTP1 -> RTP2` execution.
- Triple replay after every transition.
- Concurrent create conflict and re-read for every managed record type.
- `429`, `5xx`, permanent error, and readback mismatch semantics.

### Schema and bundle tests

- Category-by-category schema diff.
- Wrong-type/uniqueness/options conflicts fail closed.
- Both Lead and Deal pipeline pairs.
- Empty second plan.
- Account guard refuses any non-developer-test portal.
- Bundle reproducibility.
- CommonJS `main` export.
- No runtime YAML/filesystem/schema-CLI code in the bundle.
- No PostgreSQL, queue, server, external endpoint, or Vercel dependency in active architecture.

## 7. Required repository deliverables

Use the current structure where it remains coherent. At minimum, add or update the following categories.

### Code and configuration

- `.github/workflows/ci.yml`
- A separate manual authenticated developer-test validation workflow
- `package.json` and lockfile
- `.env.example`
- `config/portal-installations.yaml`
- `config/schema/commercial-model.schema.json`
- Developer-test B2B and B2C Organization configurations
- `config/hubspot-schema.yaml`
- Workflow desired-state configuration
- Strict config validation/generation scripts
- `packages/commercial-kernel/*`
- `packages/domain/config-resolver.ts`
- `packages/hubspot-adapter/*`
- `src/custom-code-actions/reconcile-record.ts`
- Rebuilt `packages/domain/embedded-configs.ts`
- Rebuilt `dist/hubspot-custom-code/reconcile-record.js`

### Tests

- Strict configuration tests
- Complete kernel DSL tests
- Snapshot and adapter contract tests
- Product and Line Item tests
- Replay and concurrency tests
- Workflow desired-state tests
- Schema conflict and account-guard tests
- Gated authenticated developer-test scripts/tests

### Documentation and evidence

- One authoritative HubSpot-native architecture document
- Correct developer-test setup and token/secret runbook
- Correct workflow installation and verification runbook
- Correct production pre-cutover checklist that contains no production portal ID unless independently verified
- Endpoint-to-scope matrix
- Reproducible capability audit generated from live inspection
- Redacted schema plan/apply/readback/empty-plan evidence
- Redacted workflow verification evidence
- Redacted B2B, B2C, parallel, suppression, replay, and FTP/RTP test report
- Explicit list of conditional evidence providers that remain unimplemented

Remove or clearly mark stale documents that describe PostgreSQL, a worker, an external webhook/action URL, or Zoho as the active architecture. The `zoho/` directory may remain as historical reference, but active architecture documents must not treat it as executable target behaviour.

## 8. Definition of done

Do not describe the work as complete unless every item below is true.

1. Ordinary GitHub CI is green and reaches build and tests.
2. Configuration validation is strict and recursive.
3. The runtime contains no external database, server, queue, polling worker, or externally hosted callback.
4. The custom-code bundle is reproducible, loadable, and contains no build-time schema tooling.
5. One canonical project/app identity and one verified developer-test execution portal are documented consistently.
6. Every mutating command refuses a non-developer-test portal.
7. App scopes match the actual endpoint inventory and are active in the developer test install.
8. The schema reconciler reads, plans, applies, reads back, and produces an empty second plan without skipped categories.
9. B2B and B2C Lead and Deal pipeline pairs exist in the developer test account.
10. Required workflows exist, contain the exact bundle and secret/input/output configuration, cover evidence changes, and are enabled only in the developer test account.
11. A Contact-only B2C subject works without a Company or Meeting.
12. A Company-plus-Contact B2B subject uses an authoritative participating Contact rule.
13. Phone-only communication can satisfy the universal MQL minimum.
14. Consent is configuration-owned, not universal.
15. The Lead persists its current Opportunity Type, evaluation metadata, and MQL completion boundary.
16. Pre-boundary Meeting evidence cannot satisfy SQL.
17. Products resolve from existing native Product records.
18. One transaction with two offerings creates one Deal with two Line Items.
19. Offerings reach the FTP Deal and RTP behaviour follows explicit configuration.
20. FTP Closed Won creates exactly one RTP1; RTP1 Closed Won creates exactly one RTP2.
21. Three replays and concurrent execution create no duplicate Lead, Deal, Line Item, or Manual Review Task.
22. Every mutation has a verified readback receipt or causes the action to fail.
23. Synthetic live B2B, B2C, parallel relationship, suppression, and lifecycle evidence is recorded in the repository in redacted form.
24. No production account or real customer record was mutated.
25. Documentation describes the system that actually exists, including any honest entitlement or in-portal provisioning blocker.

If an entitlement or HubSpot API/UI limitation prevents one item, do not implement a false substitute and do not mark the project finished. Complete everything else, capture the exact response or limitation, identify the smallest human action required, and report the corresponding Definition-of-Done item as blocked.

## 9. Final response required from the coding agent

Return a concise implementation report containing:

1. Baseline and final commit/working-tree state.
2. Architectural result.
3. Files changed, grouped by kernel, adapter, schema, workflows, CI, tests, and docs.
4. Local commands run and exact results.
5. Verified developer-test account identity and guard result.
6. App/project validation, upload, install, and active-scope evidence.
7. Schema first plan, apply, readback, and second-plan result.
8. Workflow IDs, object types, enabled state, bundle hash, and verification result.
9. A scenario table for B2B, B2C, parallel relationships, suppression, replay, concurrency, FTP, RTP1, and RTP2.
10. Any blocked Definition-of-Done item with the exact external blocker and required next action.

Do not use passing fake tests as evidence that the live installation works. Do not report planned, dry-run, skipped, or manually assumed work as completed.
