# Developer Test Account Runbook

**Target App:** `Jurnii Commercial Automation` (`jurnii_commercial_automation`)  
**Target Platform Version:** `2026.03`  

---

## 1. Prerequisites

- Node.js LTS (v20+) installed.
- Global HubSpot CLI installed: `npm install -g @hubspot/cli@latest`.
- Authenticated Developer Account context (`hs auth`).

---

## 2. Step-by-Step Test Account Setup

### Step 1: Create Developer Test Account
1. Log in to your [HubSpot Developer Portal](https://app-eu1.hubspot.com/developer-overview/149041124).
2. Under **Test Accounts**, click **Create developer test account**.
3. Name the test account (e.g. `Jurnii Dev Test Account - Sandbox`).
4. Select subscription features to simulate (Sales Hub Professional/Enterprise, Revenue Hub Quotes).

### Step 2: Authenticate Test Account in CLI
```bash
hs auth
```
- Select Personal Access Key or web authentication.
- Assign the account alias: `jurnii-test-account`.

### Step 3: Verify Connected Accounts
```bash
hs account list
```
Ensure `jurnii-test-account` is listed and active.

---

## 3. Project Upload & App Installation

### Step 1: Validate Project Structure
From the root of `hubspot-functions`:
```bash
# Verify hsproject.json platformVersion is 2026.03
cat hsproject.json
```

### Step 2: Upload Project to Test Account
```bash
hs project upload --account=jurnii-test-account
```

### Step 3: Install App into Test Account
1. Open the Developer Portal UI -> **Apps** -> **Jurnii Commercial Automation**.
2. Click **Install App** and select `jurnii-test-account`.
3. Approve requested scopes (`crm.objects.contacts.read`, `crm.objects.contacts.write`, `crm.objects.companies.read`, `crm.objects.companies.write`, `crm.objects.deals.read`, `crm.objects.deals.write`, `automation`, `orders.read_write`).

---

## 4. Least-Privilege API Readback Check

Verify installation using `curl` or HTTP client against the test account access token:
```bash
curl -H "Authorization: Bearer <TEST_ACCOUNT_STATIC_TOKEN>" \
  "https://api.hubspot.com/crm/v3/objects/companies?limit=1"
```
Expect HTTP `200 OK` with JSON results.

---

## 5. Security & Cleanup

- Store access token in `.env` (`HUBSPOT_ACCESS_TOKEN=<token>`).
- Ensure `.env` is listed in `.gitignore`.
- NEVER post token values in commits, logs, or chat.
