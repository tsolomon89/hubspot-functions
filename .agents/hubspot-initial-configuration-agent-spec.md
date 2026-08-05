# HubSpot Initial Configuration and Foundation

## Specification for a browser-enabled AI coding agent

**Target developer page:** <https://app-eu1.hubspot.com/developer-overview/149041124>  
**Source system:** <https://github.com/tsolomon89/zoho-functions>  
**Target working repository:** `hubspot-functions`  
**HubSpot application name:** `Jurnii Commercial Automation`  
**HubSpot application UID:** `jurnii_commercial_automation`  
**Target platform version:** `2026.03`  
**Assignment scope:** authenticated portal audit, current-platform research, isolated app setup, configuration manifest, and backend foundation. This is not the full Zoho-to-HubSpot port or a production cutover.

## 1. Assignment

You are an AI coding agent with browser, terminal, filesystem, and GitHub access.

Establish the technical foundation for reproducing Jurnii's current Zoho commercial-operations system in HubSpot. Use the live HubSpot portal to discover the actual account, permissions, subscriptions, existing configuration, developer projects, and test-account options. Use current official HubSpot documentation to validate every platform-specific decision. Then create and verify the new HubSpot app and external-service foundation in an isolated developer test account.

Do not treat this as a generic CRM setup. The authoritative business system is the current `main` branch of `tsolomon89/zoho-functions`. Extract its portable invariants before configuring HubSpot. Do not translate Zoho-specific mechanics literally when HubSpot has a different object model.

The required result is a reproducible, source-controlled HubSpot foundation that another coding agent can continue without rediscovering the account, platform choices, schema plan, or safety boundaries.

## 2. Required operating mode

### 2.1 Browser use is mandatory

Use browser tools for all of the following:

1. Open the supplied developer page.
2. Hand control to the user for login or reauthentication.
3. Inspect the authenticated HubSpot developer and account surfaces.
4. Inspect developer projects, legacy apps, test accounts, installation state, permissions, subscriptions, pipelines, workflows, sequences, and quote capabilities where available.
5. Research the current HubSpot developer platform and API documentation.
6. Verify in the HubSpot UI that every uploaded or installed test configuration exists as expected.

Do not rely on remembered HubSpot behaviour. The live UI and current official documentation are part of the evidence for this assignment.

### 2.2 Login handoff

Begin by opening:

<https://app-eu1.hubspot.com/developer-overview/149041124>

If HubSpot presents a login, account-selection, SSO, CAPTCHA, consent, or multifactor-authentication screen:

1. Stop browser interaction.
2. Ask the user to take control of the browser and complete authentication.
3. Tell the user not to place a password, one-time code, recovery code, or access token in chat.
4. Resume only after the user confirms that authentication is complete and returns browser control.

The same rule applies if `hs account auth` opens a separate authorization flow. Use the official CLI authorization flow. Do not manufacture, intercept, or reuse browser credentials.

### 2.3 Evidence hierarchy

Use this precedence order:

1. The authenticated live HubSpot account for what is actually enabled and configured.
2. Current official HubSpot developer and knowledge-base documentation for supported behaviour.
3. The current `main` commit of `tsolomon89/zoho-functions` for Jurnii's business invariants.
4. Existing repository documentation, with current implementation outranking stale planning documents.
5. Inference, clearly marked as inference.

If sources conflict, record the conflict. Do not silently choose one.

### 2.4 Mutation boundary

This assignment authorizes:

- Read-only inspection of the supplied HubSpot account.
- Creation or reuse of a HubSpot developer test account.
- Local creation of the `hubspot-functions` project if no existing checkout is present.
- Upload of a new HubSpot developer project.
- Installation of the app into a developer test account.
- Test-only schema changes after a dry-run diff has been recorded.
- Local code, documentation, migrations, manifests, and automated tests.

This assignment does not authorize:

- Installing the app into the production HubSpot account.
- Creating, editing, enabling, or deleting production properties, pipelines, workflows, sequences, association labels, products, quotes, or records.
- Migrating or backfilling production data.
- Enrolling real contacts in sequences or sending emails.
- Creating a public or Marketplace listing.
- Creating a remote GitHub repository, committing, pushing, opening a pull request, or merging unless separately authorized.
- Deleting or rotating an existing app, project, token, secret, workflow, pipeline, field, or record.
- Purchasing or changing HubSpot subscriptions or seats.

If only a production account is available and no isolated developer test account can be created or used, stop after the audit and report the blocker.

## 3. Business invariants to preserve

Read at least the following files from the current `main` commit before creating the parity matrix:

- `README.md`
- `docs/v6/FINAL_CANONICAL_FIELD_MATRIX.md`
- `docs/v6/FLOW_REFERENCE.md`
- `docs/v6/SINGLE_FIELD_AUTOMATION_AUDIT.md`
- `docs/v6/PHASE3_A_E_R_LIFECYCLE_SCOPE.md`
- `v6/processLead.deluge`
- `v6/processContact.deluge`
- `v6/processAccount.deluge`
- `v6/processDeal.deluge`
- The Task, Call, Meeting, Quote, and email-event handlers under `v6/activity/`
- `_util_applyQuoteLifecycle.deluge` and the other commercial `_util_*.deluge` helpers used by `processDeal`

Record the exact source commit SHA. Do not cite a floating branch as the only source reference.

The HubSpot implementation must preserve these invariants:

1. A durable commercial Deal is `Company × Product`, with one canonical Deal per product key under a Company.
2. A Contact owns outreach and sequence state. The Deal owns commercial state.
3. Only business outcomes advance lifecycle. Creating or editing context is not itself a win.
4. Tasks, Calls, and Meetings each expose one primary human command field. Context and commercial evidence are not additional lifecycle commands.
5. Activity loss is local. It does not automatically close a Deal.
6. Deal stage never regresses.
7. Ambiguity produces a deterministic Manual Review task. Automation does not guess.
8. Human activation is required before outreach begins.
9. Repeated events, retries, webhook replays, and reconciliations must be idempotent.
10. A Quote is the commercial transaction and pricing authority. Product interest is not valuation authority.
11. Quote lifecycle drives Acquisition, Expansion, and Renewal transitions.
12. Deals never persist as Won. `Closed Won` belongs to the Quote; a Deal remains Open or becomes Lost.
13. The B2B and future Partnership pipelines are distinct. Do not apply B2B automation to Partnership records.
14. Account, Deal, Contact, Quote, and activity authority must be explicit. No field may have two competing writers.
15. No synchronous HubSpot workflow action is the system of record for a long-running commercial reconciliation. It submits work to the external service.

One repository warning must be preserved in the audit: `PHASE3_A_E_R_LIFECYCLE_SCOPE.md` describes the lifecycle as scoping-only, while the current repository contains `_util_applyQuoteLifecycle.deluge`. Inspect the implementation and current README before deciding the actual deployed intent.

## 4. HubSpot translation constraints

Do not model a HubSpot Lead as a Zoho staging Lead. HubSpot Leads require an associated Contact. Therefore:

- Intake creates or resolves the canonical Contact immediately.
- An optional HubSpot Lead can then wrap that Contact for Sales Workspace use.
- The portable invariant is "resolve the canonical Contact," not "convert the Lead."

Use this target mapping as the starting hypothesis and verify it against the live account and current APIs:

| Zoho concept | HubSpot target |
| --- | --- |
| Lead intake | Contact upsert, then optional associated Lead |
| Account | Company |
| Contact | Contact |
| `Account × Product` Deal | Deal with unique `jurnii_deal_key` |
| Account identity key | Company property `jurnii_company_key` |
| Products | Product library |
| Product Quote | Current supported Quote object plus a dedicated line item |
| Contact Roles | Labeled Deal-to-Contact associations |
| Tasks, Calls, Events | Tasks, Calls, Meetings |
| Fine commercial stage | Deal pipeline stage and Contact custom stage |
| MQL, SQL, FTP, RTP | Derived Deal property, not four pipelines |
| Manual Review | Idempotent HubSpot Task with a canonical review code |
| Automation log | PostgreSQL execution and transition ledger |

Treat Quote architecture as unresolved until the portal entitlement audit and current documentation establish whether the account uses current Revenue Hub CPQ, a supported Quote API, or only legacy quote capabilities. Do not default to a legacy Quotes API because a legacy guide happens to be easier to find.

## 5. Phase A: authenticated portal audit

Complete this phase read-only.

### 5.1 Confirm account identity

Record:

- Account name.
- Account ID.
- Region and portal hostname.
- Whether account `149041124` is a standard account, developer account, or another account type.
- Whether this is the intended Jurnii account.
- The signed-in user's relevant permissions, including Super Admin, developer access, Marketplace access, and any developer seat.

If the account identity is not unambiguous, stop and ask the user to select the correct account.

### 5.2 Inspect developer state

Inspect and record:

- Existing Projects.
- Existing Legacy apps.
- Existing private or public apps that may already represent this system.
- Existing developer test accounts and their subscription simulations.
- Whether a configurable developer test account can be created.
- Any existing app named similarly to `Jurnii Commercial Automation`.
- Any existing project or component UID equal or similar to `jurnii_commercial_automation`.

Do not create a duplicate project or app. If an apparent predecessor exists, inspect it and stop before mutation until identity is resolved.

### 5.3 Inspect product entitlements

Establish the actual HubSpot edition, hubs, and assigned seats relevant to:

- Contact-, Company-, Deal-, Call-, Task-, Meeting-, and Quote-based workflows.
- Sequences and sequence API access.
- Current Revenue Hub quoting and CPQ.
- Custom properties and unique-value properties.
- Custom association labels and limits.
- Products and line items.
- Webhooks and custom workflow actions.
- Developer test-account feature simulation.

Record whether each parity requirement is available, unavailable, or still unproven. Do not infer entitlement from navigation visibility alone.

### 5.4 Inspect existing CRM configuration

Record the existing target configuration without editing it:

- Deal pipelines and internal stage IDs.
- Contact and Company lifecycle properties.
- Existing products and product identifiers.
- Existing association labels.
- Existing custom properties that collide with proposed `jurnii_*` internal names.
- Existing workflows and sequences that could react to the same records.
- Existing quote implementation.
- Existing integration or app tokens relevant to the proposed system.

Never reveal token values. It is sufficient to record that a credential exists, its owning app, its visible scope summary, and its last-rotation metadata when available.

Write the result to `docs/audits/hubspot-portal-audit.md`.

## 6. Phase B: mandatory current-platform research

Use browser tools to research the current official HubSpot documentation. Begin with the official documentation index at:

<https://developers.hubspot.com/docs/llms.txt>

At minimum, research and record:

1. Current developer-platform version and migration status.
2. HubSpot CLI installation, authentication, project creation, upload, build, deploy, and local-development commands.
3. Private distribution with static authentication versus private OAuth distribution.
4. Installation limits for static apps and developer test accounts.
5. Exact scope names required by every planned endpoint.
6. Webhook subscription configuration, delivery semantics, retry behaviour, event identifiers, limits, and supported object/property subscriptions.
7. HubSpot request-signature v3 validation.
8. Custom workflow action configuration, supported object types, request contract, retry behaviour, publication state, and execution limits.
9. CRM object APIs for Contacts, Companies, Deals, Calls, Tasks, Meetings, Products, Line Items, Quotes, Owners, and optional Leads.
10. Properties API, unique-value properties, immutable characteristics, option updates, and per-object limits.
11. Pipeline API and constraints on Deal stages, internal IDs, probabilities, and closed-state metadata.
12. Association schema and association-label APIs, including cardinality limits.
13. Current Quote and CPQ APIs, associations, line-item ownership rules, and subscription requirements.
14. Workflows, Sequences, and their subscription or seat requirements.
15. API rate limits, batch limits, paging, archived-record behaviour, and retry headers.
16. EU data residency or regional considerations relevant to the portal, app callbacks, and API endpoints.
17. Secure token handling and rotation guidance.

Use official HubSpot developer documentation and HubSpot knowledge-base documentation as primary sources. Community posts, blogs, and third-party tutorials may be used only to locate an official source or to document an unresolved gap. Never use them as the sole authority for a configuration mutation.

Write `docs/research/hubspot-platform-research.md` with this table:

| Claim or decision | Live account evidence | Official source URL | Last updated or accessed | Consequence for implementation |
| --- | --- | --- | --- | --- |

Every material platform assumption must appear in that table.

## 7. Phase C: architecture decision and local project initialization

### 7.1 Required architecture decision

Unless the portal audit disproves a premise, use:

- Distribution: `private`.
- Authentication: `static`.
- Platform version: `2026.03`.
- Installation target during this assignment: developer test account only.
- App responsibility: permissions, webhooks, workflow-action definitions, and future UI extensions.
- External TypeScript service responsibility: durable event receipt, state-machine execution, HubSpot API calls, idempotency, retries, dead letters, and structured logs.
- PostgreSQL responsibility: webhook inbox, job state, transition keys, execution history, schema-apply history, and dead letters.

Static authentication is correct only while the app serves one standard HubSpot account. If the live requirement is installation across multiple independent production accounts, stop and replace this decision with a private OAuth design before the first upload.

Write `docs/decisions/ADR-0001-hubspot-app-and-auth.md` with the evidence and rejected alternatives.

### 7.2 Repository handling

Search GitHub and the local workspace for an existing `hubspot-functions` repository before creating anything.

- If the repository exists, inspect its status, default branch, current architecture, and uncommitted work before editing.
- If no repository exists, create only a local `hubspot-functions` working directory. Do not create the remote repository without separate authorization.
- Do not modify `zoho-functions`. It is a read-only source system for this assignment.
- Do not place TypeScript or HubSpot project files inside `zoho-functions`.

Use this initial structure, adapting only where the current HubSpot CLI requires a different generated layout:

```text
hubspot-functions/
  hsproject.json
  src/
    app/
      app-hsmeta.json
      webhooks/
      workflow-actions/
  services/
    api/
    worker/
  packages/
    domain/
    hubspot-client/
    observability/
  db/
    migrations/
  config/
    hubspot-schema.yaml
  docs/
    audits/
    research/
    architecture/
    decisions/
    setup/
  test/
    fixtures/
    integration/
```

Initialize the project using the current official HubSpot CLI workflow. Install the current CLI release supported by the documentation, not a pinned historical version copied from an old example.

For the first project template, include only:

- Webhooks.
- Custom Workflow Action.

Do not add an app card, settings UI, custom object, or HubSpot serverless function without an identified first-version requirement.

### 7.3 Immutable identifiers

Use:

- Project and repository working name: `hubspot-functions`.
- App display name: `Jurnii Commercial Automation`.
- App UID: `jurnii_commercial_automation`.

Feature UIDs must be stable, descriptive, and globally unique within the project. Record them in the architecture document. Verify that none collide with an existing project before the first upload. After the first successful upload, do not rename a UID.

## 8. Phase D: app configuration

Configure `app-hsmeta.json` from current schema documentation, with these semantic requirements:

- `distribution` is `private`.
- `auth.type` is `static`.
- No OAuth redirect URLs are present.
- Required scopes contain only the scopes proven necessary for the test foundation.
- Optional and conditionally required scopes are empty unless a documented use exists.
- UIDs are stable.
- Support contact fields use verified Jurnii values. Do not invent an email address, phone number, documentation URL, or support URL. If the schema requires a missing value, stop and request it.

Create a scope matrix before upload:

| Scope | Endpoint or feature requiring it | Read or write | Required now or later | Live entitlement proven | Official source |
| --- | --- | --- | --- | --- | --- |

Do not request broad scopes for hypothetical future features. It is acceptable to add scopes in a later build and reinstall the app.

### 8.1 Webhook configuration

Create the webhook feature as configuration-as-code. Subscribe only to events required by the first implemented processor. Do not subscribe broadly to every property on every object.

The receiver must:

- Preserve the exact raw request body required for signature validation.
- Validate HubSpot signature v3 and reject stale request timestamps according to current documentation.
- Return the documented acknowledgement promptly after durable receipt.
- Store every delivery before processing.
- Deduplicate replayed deliveries.
- Queue processing outside the request-response path.
- Log object type, object ID, subscription type, occurrence time, event identifier, correlation ID, and processing result without logging secrets or unnecessary CRM data.

Do not activate a subscription until a reachable HTTPS endpoint and passing signature tests exist.

### 8.2 Custom workflow action

Create one minimal action definition for handing a record to the external reconciler. Use a stable UID such as `jurnii_reconcile_record` unless it collides with an existing component.

The action must:

- Accept the enrolled record ID and the smallest documented context needed to identify object type and trigger reason.
- Submit a durable job to the external service.
- Avoid containing the commercial state machine.
- Be configured with `isPublished: false` during this assignment.
- Be enabled only after a reachable HTTPS endpoint, request validation, durable job creation, and idempotency tests pass.

If HubSpot webhooks fully cover a trigger, prefer a webhook. Use a workflow action only where an administrator must explicitly place the app inside a HubSpot workflow or pass workflow context not provided by the event.

## 9. Phase E: developer test account and secure installation

Create or reuse an isolated developer test account that simulates the required HubSpot subscriptions. Do not use the production CRM as the test target.

Upload the project with the official CLI. Use the browser to verify:

- The project exists.
- The latest build succeeded.
- The app component and feature components have the expected UIDs.
- Distribution is private.
- Authentication is static.
- Requested scopes match the scope matrix.
- The webhook and workflow-action features match the source files.

Install the app into the developer test account only.

Before revealing a static access token, prepare an approved secret destination. The token must never appear in chat, terminal history, source code, screenshots, logs, test fixtures, or committed files. Store it under a non-versioned local secret mechanism or an approved deployment secret store. Ensure `.env*` and local HubSpot credential files are excluded from version control where appropriate.

If browser or terminal tooling cannot transfer the token without exposing it in logs, do not reveal it. Ask the user to save it directly into the prepared secret destination.

After installation, perform a least-privilege, read-only API check against the developer test account. Record only the endpoint, HTTP status, account identifier, and redacted result summary.

## 10. Phase F: schema manifest and test-only provisioning

The HubSpot portal is not the configuration source of truth. Create `config/hubspot-schema.yaml` as the desired-state manifest for:

- Property groups.
- Custom properties and options.
- Unique-value properties.
- Deal pipelines and stages.
- Association labels and limits.
- Required Products or product-key policy.
- Workflow/action dependencies.
- Webhook subscriptions.

Build a schema tool with three modes:

1. `inspect`: read the target account and normalize its current configuration.
2. `plan`: compare current configuration with the manifest and produce a deterministic diff without mutation.
3. `apply`: make only the planned changes, then read them back and verify them.

Every operation must be idempotent. A second `plan` after a successful `apply` must produce no changes.

Never delete an existing field, option, pipeline, stage, or association definition in the first version. If an internal name exists with an incompatible type, uniqueness constraint, option set, or semantic meaning, stop and report the conflict.

### 10.1 Baseline identity schema

The first test-only apply may create only the schema elements that have no unresolved platform or business dependency:

- Company unique text property `jurnii_company_key`.
- Deal unique text property `jurnii_deal_key`.
- Deal text property `jurnii_product_key`.
- Deal enumeration properties for opportunity type, state, and status, after their exact options are fixed from the parity matrix.
- Deal boolean property for automation suppression.
- Deal-to-Contact association labels for Decision Maker, End User, and Influencer, after the live association audit confirms no collision.

Use stable lowercase internal names and user-facing labels prefixed or grouped consistently for Jurnii. Verify through the current Properties and Associations APIs that the relevant object supports each definition.

Do not provision the remaining Contact sequence fields, activity command fields, Deal pipeline, Quote fields, or quote lifecycle fields until their exact HubSpot representation is documented in `docs/architecture/zoho-hubspot-parity-matrix.md`.

### 10.2 Deal pipeline

The target B2B progression is:

1. Marketing Consent
2. Demo Booking
3. Demo Confirmation
4. Demo Hosted
5. Proposal Preparation
6. Commercial Agreement
7. Onboarding
8. Renewal

Do not invent Deal probabilities, closed-state flags, internal IDs, or forecasting categories. Research current HubSpot requirements, compare them with any existing target pipeline, and record the proposed exact values. If a required business value remains undefined, leave the pipeline in the manifest as planned rather than applying it.

Define a future Partnership pipeline in the architecture only. Do not activate Partnership automation during this assignment.

## 11. Phase G: external service foundation

Scaffold the external TypeScript service and PostgreSQL persistence needed before any domain port.

### 11.1 Required endpoints

- `POST /webhooks/hubspot`
- `POST /workflow-actions/reconcile`
- `GET /health`
- `GET /ready`

The two ingress endpoints must share request validation, correlation, durable receipt, and redaction policies but retain distinct payload schemas.

### 11.2 Required persistence

Create migrations for at least:

- `hubspot_event_inbox`
- `hubspot_jobs`
- `hubspot_transition_keys`
- `hubspot_execution_log`
- `hubspot_dead_letters`
- `hubspot_schema_runs`

Use immutable raw-event storage or a documented redacted envelope. Define unique constraints that make duplicate delivery and transition replay harmless. Do not use a log line as the idempotency mechanism.

### 11.3 Required code boundaries

- `domain`: platform-neutral commercial invariants and transition contracts.
- `hubspot-client`: API adapters, paging, batches, rate-limit handling, and typed object access.
- `api`: signature validation and ingress only.
- `worker`: durable processing and retry orchestration.
- `schema`: inspect, plan, apply, and readback verification.

No business transition may be implemented directly in an HTTP controller.

### 11.4 Required tests

Add automated tests proving:

- A valid HubSpot v3 signature is accepted.
- An invalid signature is rejected.
- A stale request timestamp is rejected.
- The raw body is not changed before validation.
- The same webhook delivery stored twice produces one processable event.
- The same transition key cannot be applied twice.
- The ingress acknowledges only after durable receipt.
- Failed processing moves through retry state and ultimately to a dead letter without losing the event.
- Logs redact access tokens, client secrets, authorization headers, email addresses where unnecessary, and raw CRM payload fields not required for diagnosis.
- `schema plan` is deterministic.
- A second schema plan after test apply is empty.

Use synthetic fixtures. Do not copy production contact or company data into the repository.

## 12. Required deliverables

Produce or update:

1. `docs/audits/hubspot-portal-audit.md`
2. `docs/research/hubspot-platform-research.md`
3. `docs/architecture/zoho-hubspot-parity-matrix.md`
4. `docs/architecture/hubspot-foundation.md`
5. `docs/decisions/ADR-0001-hubspot-app-and-auth.md`
6. `docs/setup/developer-test-account-runbook.md`
7. `docs/setup/production-install-checklist.md`
8. `config/hubspot-schema.yaml`
9. HubSpot project configuration for platform `2026.03`
10. External API and worker foundation
11. PostgreSQL migrations
12. Unit and integration tests
13. `.env.example` containing variable names only, never values

The parity matrix must identify, for every portable field or behaviour:

| Concept | Zoho authority | HubSpot representation | Human writable | Automation writable | Trigger | Idempotency key | Entitlement | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |

Use statuses `proven`, `planned`, `blocked`, or `not portable`.

## 13. Stop conditions

Stop and ask for user direction if:

- The authenticated account is not clearly the intended Jurnii account.
- An existing project or app appears to be the same system.
- The user lacks the permissions required for the next step.
- No developer test account can be used.
- HubSpot requires a paid entitlement or seat that is not present.
- The live requirement is multi-account installation, invalidating static authentication.
- A required app schema value would need to be invented.
- A proposed internal property name collides with an incompatible live definition.
- A static token or client secret cannot be stored without being exposed.
- An official current document contradicts a material assumption in this specification.
- The only way forward would mutate production.

Do not treat these as implementation failures. Record the exact blocker, the evidence, and the smallest user decision or account change required.

## 14. Definition of done

This assignment is complete only when:

- The supplied developer page has been opened and the authenticated account has been audited.
- The account identity, permissions, entitlements, and existing app state are documented.
- Current official HubSpot research is linked to every material platform decision.
- The source Zoho commit and portable invariants are documented.
- A non-duplicative local `hubspot-functions` project exists on platform `2026.03`.
- The app is configured as private/static with least-privilege scopes.
- The project builds and uploads successfully.
- The app is installed only in a developer test account.
- Secrets remain outside chat, logs, source, fixtures, and version control.
- The external ingress, worker, persistence, schema tooling, and tests exist.
- Any test schema apply is read back and a second plan is empty.
- The workflow action remains unpublished.
- No production record, schema, workflow, sequence, pipeline, quote, or app installation has been changed.
- All tests pass, or every failure is explained with evidence and a precise blocker.

## 15. Final report format

Return a concise execution report with:

1. **Account verified:** account name, ID, region, and test account used.
2. **Entitlement result:** available, unavailable, and unproven capabilities.
3. **Research corrections:** anything in the starting assumptions changed by current documentation or live UI.
4. **Project created or reused:** local path, platform version, app UID, build/deploy result.
5. **Configuration applied:** exact test-only objects created or changed.
6. **Security result:** where secrets were stored, without values.
7. **Verification:** tests, API checks, readback, and idempotent second plan.
8. **Production impact:** explicitly state that none occurred.
9. **Open blockers and decisions:** only unresolved items that prevent the next implementation phase.
10. **Recommended next task:** the smallest coherent implementation slice, normally Contact and Company identity resolution followed by `Company × Product` Deal upsert.

Do not report success based only on local files. Verify the uploaded project and developer test installation through the authenticated HubSpot browser session.

## 16. Authoritative starting references

These are starting points, not substitutes for current browser research:

- [HubSpot developer platform overview](https://developers.hubspot.com/docs/apps/developer-platform/overview)
- [Create a new app with the HubSpot CLI](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/create-an-app)
- [App configuration](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/app-configuration)
- [Authentication overview](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/overview)
- [Manage apps in HubSpot](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/manage-apps-in-hubspot)
- [Validate HubSpot requests](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/request-validation)
- [Define a custom workflow action](https://developers.hubspot.com/docs/apps/developer-platform/add-features/custom-workflow-actions)
- [CRM Properties API](https://developers.hubspot.com/docs/api-reference/legacy/crm/properties/guide)
- [Association schema and labels](https://developers.hubspot.com/docs/api-reference/latest/crm/associations/associations-schema/guide)
- [Current CRM object APIs](https://developers.hubspot.com/docs/api-reference/latest/crm/using-object-apis)
- [Current developer-platform migration guidance](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/migrate-an-app/overview)
- [Jurnii Zoho automation repository](https://github.com/tsolomon89/zoho-functions)
