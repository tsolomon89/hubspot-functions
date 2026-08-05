# Commercial Kernel Architecture & Universal Ontology

## 1. Domain Ontology

The Universal Commercial Kernel decouples relationship qualification logic from CRM persistence adapters.

$$
\text{Organization} \rightarrow \text{Relationship Type} \rightarrow \text{MQL} \rightarrow \text{SQL} \rightarrow \text{FTP} \rightarrow \text{RTP}_1 \rightarrow \text{RTP}_2 \rightarrow \cdots
$$

- **Organization (`organizationKey`):** The boundary owning commercial qualification rules and configuration.
- **Relationship Type (`relationshipType`):** Categorizes commercial relationships (B2B, B2C, Partnership, Reseller, Investor Relations).
- **Commercial Subject (`subject`):** The entity in the relationship. May be Contact-only (B2C), Company-only, or Company-plus-Contacts (B2B).
- **Opportunity Types:**
  - `MQL`: Identifiable subject with at least one usable communication channel.
  - `SQL`: Intended commercial offering or proposition is known.
  - `FTP`: First transaction in relationship complete.
  - `RTP`: Subsequent transaction after FTP or preceding RTP complete.

---

## 2. Decoupled Architecture

- **`packages/commercial-kernel/`:** Pure domain logic with zero external SDK or database dependencies.
- **`packages/hubspot-adapter/`:** HubSpot native object projection (Contact, Company, Lead, Deal, Product, Line Item).
- **`config/organizations/`:** Executable YAML organization configurations validated against `commercial-model.schema.json`.
