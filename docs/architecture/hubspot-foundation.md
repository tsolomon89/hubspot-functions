# HubSpot Foundation Architecture

## App Identity & Scope
- **App UID:** `commercial_operations_automation`
- **Display Name:** `Commercial Operations Automation`
- **HubSpot Portal:** `149041124` (Developer Account)
- **Target Commercial Model:** Universal Commercial Kernel ($MQL \rightarrow SQL \rightarrow FTP \rightarrow RTP_1 \rightarrow RTP_2 \rightarrow \dots$)

---

## Native CRM Object Mapping
- **`Contact`:** Person Subject & Communication Channel facts.
- **`Company`:** Entity Subject & Business facts.
- **`Lead`:** Native Qualification Object ($MQL \rightarrow SQL$).
- **`Deal`:** Native Transaction Object ($FTP \rightarrow RTP$).
- **`Product` & `Line Item`:** Commercial Offerings attached to Deals.
