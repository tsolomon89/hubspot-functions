# HubSpot Native Object Mapping

| Universal Kernel Concept | Native HubSpot Standard Object | Role & Usage |
|---|---|---|
| Commercial Subject (Person) | `Contact` | Person subject and communication channels |
| Commercial Subject (Entity) | `Company` | Business/entity subject |
| MQL $\rightarrow$ SQL Qualification | `Lead` | Native qualification record (Sales Hub Pro/Enterprise) |
| FTP / RTP Transaction Opportunity | `Deal` | One transaction opportunity |
| Process Category | `Lead Pipeline` & `Deal Pipeline` | Paired qualification and transaction process |
| Offering Catalog | `Product` | Reusable offering template (`SKU`) |
| Offering Instance | `Line Item` | Attached to Deal (supports multi-offering per Deal) |
| Evidence | `Meeting`, `Call`, `Task`, `Email` | Qualification activity proof |
| Derived Status | `Contact/Company Lifecycle Stage` | Derived forward-moving summary projection |

---

## Association Definitions & Categories

- **Contact to Company:** Primary Association (`HUBSPOT_DEFINED`, Type ID `1`).
- **Contact to Deal:** Standard Association (`HUBSPOT_DEFINED`, Type ID `4`).
- **Deal to Company:** Primary Association (`HUBSPOT_DEFINED`, Type ID `5`).
- **Line Item to Deal:** Association (`HUBSPOT_DEFINED`, Type ID `20`).
- **Task to Contact:** Association (`HUBSPOT_DEFINED`, Type ID `204`).
- **Task to Deal:** Association (`HUBSPOT_DEFINED`, Type ID `216`).
