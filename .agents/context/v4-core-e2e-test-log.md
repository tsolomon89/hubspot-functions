# v4 CRM Graph E2E Test Log

* **Org mode:** Production (Test data only)
* **Session prefix:** `V4_E2E_20260608_1200`

---

## Test 1 — Single Lead conversion

* **Records involved:**
  * Lead: `991103000000964057`
  * Account: `991103000000930050`
  * Contact: `991103000000955037`
  * Deal: `991103000000923020`
  * Call: `991103000000909020`
* **Action performed:** Lead created with website, phone, stage = `Marketing Qualification`, job title = `Head of Marketing`, product interest = `["Jurnii Cortex"]`. Converted via workflow.
* **Expected Result:** Lead converts, Contact role is `Decision Maker`, Deal is linked, `Deal.Stage1 = Marketing Qualification`, `Deal.Stage = MQL`, `Deal.State = Open`, `Deal.Status = New`, Deal has `Jurnii Cortex` product attached, `Deal.Amount = 16000`, Call `Marketing Qualification Call 1` is created and linked.
* **Observed Result:** 
  * Lead converted successfully.
  * Account and Contact created, linked correctly.
  * Deal created and linked.
  * `Contact_Role1` stamped as `Decision Maker`.
  * `Deal.Stage1 = Marketing Qualification`, `Deal.Stage = MQL`, `Deal.State = Open`, `Deal.Status = New`.
  * Contact linked in `Contact_Roles` with role `Decision Maker`.
  * Product `Jurnii Cortex` successfully mapped and attached to Deal.
  * `Deal.Amount = 16000` (Correct).
  * Call `Marketing Qualification Call 1` successfully created and linked.
* **Status:** PASS

## Test 2 — Second Lead for the same Account

* **Records involved:**
  * Lead 2: `991103000000894047` (Converted)
  * Account: `991103000000930050`
  * Contact 2: `991103000000911022`
  * Deal: `991103000000923020`
* **Action performed:** Second Lead created for same company/website, ready for conversion. Converted via workflow.
* **Expected Result:** Maps to the same canonical Account. Creates a second Contact. Connects the second Contact to the same Deal via Contact_Roles. Resolves and attaches the second product (`Jurnii UX` - 12000) to the Deal. Recalculates the total `Deal.Amount` as `16000 + 12000 = 28000`.
* **Observed Result:**
  * Maps to the same canonical Account.
  * Created Contact 2 `991103000000911022`.
  * Multi-select lookup `Products_Linked` on Contacts was successfully updated to link `Jurnii UX`.
  * The Deal has both `Jurnii Cortex` and `Jurnii UX` attached in its related list.
  * `Deal.Amount` is recalculated and set to `28000` (Correct).
* **Status:** PASS

## Test 3 — Idempotency

* **Records involved:**
  * Account: `991103000000930050`
  * Contact 1: `991103000000955037`
  * Contact 2: `991103000000911022`
  * Deal: `991103000000923020`
* **Action performed:** No-op update performed on the canonical Account (updating its Description) and Deal (updating Description) to trigger `processAccount` and `processDeal` recomputations.
* **Expected Result:** No duplicate deals or contacts are created. Existing Deal `Stage1` (Demo Confirmation), `Stage` (SQL), and `Amount` (28000) remain completely intact and unaltered.
* **Observed Result:**
  * No duplicate Deals or Contacts created.
  * Deal Amount remained exactly `28000`.
  * Deal Stage1/Stage remained `Demo Confirmation` / `SQL` respectively.
* **Status:** PASS

## Test 4 — Stage to Opportunity mapping

* **Records involved:**
  * Contact 1: `991103000000955037`
  * Deal: `991103000000923020`
* **Action performed:** Updated Contact 1's stage to `Proposal Preparation` (rank 5).
* **Expected Result:** Deal `Stage1` advances to `Proposal Preparation`, and Deal `Stage` (Opportunity) maps to `FTP`.
* **Observed Result:**
  * Deal `Stage1` successfully advanced to `Proposal Preparation`.
  * Deal `Stage` successfully mapped to `FTP`.
* **Status:** PASS

## Test 5 — Furthest open Contact

* **Records involved:**
  * Contact 1 (Stage = `Proposal Preparation` / rank 5): `991103000000955037`
  * Contact 2 (Stage = `Marketing Qualification` / rank 1): `991103000000911022`
  * Deal: `991103000000923020`
* **Action performed:** Checked Deal primary Contact lookup.
* **Expected Result:** Since Contact 1 is open and furthest along (rank 5 vs Contact 2's rank 1), the Deal's primary Contact lookup (`Contact_Name`) must switch to Contact 1.
* **Observed Result:**
  * Deal's primary Contact lookup `Contact_Name` successfully updated to Contact 1 (`991103000000955037`).
* **Status:** PASS

## Test 6 — Contact_Roles completeness

* **Records involved:**
  * Contact 1: `991103000000955037`
  * Contact 2: `991103000000911022`
  * Deal: `991103000000923020`
* **Action performed:** Checked Deal's related `Contact_Roles` list.
* **Expected Result:** Both Contact 1 and Contact 2 must be associated with the Deal, with roles correctly derived from their Job Titles (Decision Maker and End User).
* **Observed Result:**
  * Both Contact 1 (role: `Decision Maker`) and Contact 2 (role: `End User`) are linked in the `Contact_Roles` list.
* **Status:** PASS

## Test 7 — Product mapping and Amount

* **Records involved:**
  * Contact 1: `991103000000955037`
  * Contact 2: `991103000000911022`
  * Deal: `991103000000923020`
* **Action performed:** Linked product `Jurnii 360` (price: 10000) to Contact 2, so the Account's contacts aggregate `Jurnii Cortex` (16000), `Jurnii UX` (12000), and `Jurnii 360` (10000). Checked Deal related products list and total Amount.
* **Expected Result:** All three products must be linked to the Deal, and the Deal's Amount must equal their sum `16000 + 12000 + 10000 = 38000`.
* **Observed Result:**
  * Products `Jurnii Cortex`, `Jurnii UX`, and `Jurnii 360` are all linked to the Deal.
  * Deal `Amount` is exactly `38000` (Correct).
* **Status:** PASS

## Test 8 — Account deduplication

* **Records involved:**
  * Lead 3: `991103000000915024` (Converted)
  * Account: `991103000000930050`
  * Contact 3: `991103000000930053`
* **Action performed:** Converted a third Lead with variations in Company name ("V4_E2E_20260608_1200_T8_Co") but the same website domain.
* **Expected Result:** Converted Contact maps to the existing canonical Account, rather than creating a duplicate.
* **Observed Result:**
  * Contact 3 successfully mapped to the existing canonical Account `991103000000930050`.
  * No duplicate Account was created.
* **Status:** PASS

## Test 9 — Duplicate Deal handling

* **Records involved:**
  * Account: `991103000000930050`
  * Deal 2 (Duplicate): `991103000000953014`
* **Action performed:** Created a second active Deal under the same Account, leaving `Deal_Key` blank to simulate manual entry.
* **Expected Result:** Deluge script identifies the duplicate Deal, appends `(Duplicate)` to the name, and silences it by setting `State = Lost` and `Status = Closed`.
* **Observed Result:**
  * Deal name successfully updated to `V4_E2E_20260608_1200_T9_Deal (Duplicate)`.
  * `State` was set to `Lost` and `Status` to `Closed`.
* **Status:** PASS

## Test 10 — Direct Contact, Account and Deal CRUD convergence

* **Records involved:**
  * Account: `991103000000930050`
  * Deal 1 (Canonical): `991103000000923020`
* **Action performed:** Updated the canonical Deal's `State` to `Lost` and `Status` to `Closed`. Verified Account rollup.
* **Expected Result:** The Account rolls up the aggregate State to `Lost` and Status to `Closed`.
* **Observed Result:**
  * Account `991103000000930050` `State` set to `Lost` and `Status` set to `Closed` (Correct).
* **Status:** PASS





