# HubSpot-Native Commercial Operating Model Architecture

> **Authoritative Architectural Invariant:**
> This repository implements a universal commercial operating model inside HubSpot. HubSpot is the sole durable commercial system of record. Repository code is limited to schema installation, stateless commercial evaluation, HubSpot state reconstruction, HubSpot mutation, and workflow-action execution.

## 1. Invocation & Execution Model
```text
HubSpot Workflow Invocation -> Stateless Evaluation Function -> HubSpot Mutation & Readback Verification
```

Functions are 100% stateless. Every invocation reconstructs the commercial snapshot directly from HubSpot CRM API, evaluates qualification goals through the pure commercial kernel, applies real CRM mutations, and returns synchronous execution receipts.

No PostgreSQL, external database, job queue, polling worker, dead-letter table, or transition ledger exists in the active architecture.

---

## 2. Native CRM Object Mapping

| HubSpot Standard Object | Commercial Responsibility |
|---|---|
| `Contact` & `Company` | Commercial Subject identity |
| `Lead` | MQL and SQL qualification regime (single native Lead) |
| `Deal` | One FTP or RTP transaction opportunity |
| `Product` | Reusable offering catalog |
| `Line Item` | Offering instance and commercial terms within a transaction |
| `Calls`, `Meetings`, `Tasks`, `Emails` | Qualification evidence |
| `Lifecycle stage` | Derived summary projection on Contact / Company |
