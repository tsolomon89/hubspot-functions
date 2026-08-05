# Legacy Zoho-to-HubSpot Reference Matrix (Historical Profile)

> [!NOTE]
> This document is retained for historical reference only. The active target architecture is governed by the Universal Commercial Kernel (`docs/architecture/commercial-kernel.md`).

| Legacy Zoho Feature | Universal Kernel Equivalent | HubSpot Standard Native Mapping |
|---|---|---|
| Company x Product Deal | `Opportunity` (MQL/SQL/FTP/RTP) | `Lead` for qualification, `Deal` + `Line Items` for transaction |
| Deluge Stage Order | Qualification Goal Predicates | Unordered `GoalDefinition` predicates evaluated deterministically |
| Deluge Activity Actions | Activity Evidence | Native `Meeting`, `Call`, `Task` evidence records |
