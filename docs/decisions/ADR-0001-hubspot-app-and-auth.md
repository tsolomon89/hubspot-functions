# ADR-0001: Commercial Operations Automation App & Auth Architecture

- **Status:** Accepted
- **App UID:** `commercial_operations_automation`
- **Portal Context:** Portal `149041124` (Developer Account)

## Context & Decision
We adopt the Universal Commercial Kernel ($MQL \rightarrow SQL \rightarrow FTP \rightarrow RTP$) mapped cleanly to standard native HubSpot standard objects (`Contact`, `Company`, `Lead`, `Deal`, `Product`, `Line Item`).
All custom CRM properties use the `coa_` namespace.
