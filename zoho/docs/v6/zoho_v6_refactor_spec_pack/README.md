# Zoho v6 Refactor Spec Pack

This pack defines the target refactor from the current v6 Account-level Deal model to the new Product Deal model.

## Target model

```text
Account = company container
Deal = Account × Product
Quote = contract / proposed contract
```

Core invariant:

```text
No Product Deal may exist without at least one Quote.
```

## Documents

1. `00_decision_log.md` — settled decisions and final answers.
2. `01_target_commercial_ontology.md` — object model and lifecycle meaning.
3. `02_field_schema_and_crud_ownership.md` — field groups, ownership, and cleanup.
4. `03_import_and_conversion_rules.md` — one-row-per-contact CSV conversion behavior.
5. `04_quote_lifecycle_rules.md` — Acquisition / Expansion / Renewal behavior.
6. `05_pipeline_and_automation_rules.md` — pipeline, activation, sequence, and activity rules.
7. `06_v6_refactor_requirements.md` — module-by-module implementation requirements.
8. `07_e2e_test_plan.md` — required end-to-end tests.
9. `08_coding_agent_prompt.md` — prompt to give the coding agent.

## Non-goals

- Do not introduce a separate Contract module.
- Do not use the Invoices module yet.
- Do not build legacy migration logic; existing Zoho data will be cleared before fresh import.
