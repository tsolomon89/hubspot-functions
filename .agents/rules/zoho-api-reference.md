# Zoho CRM Deluge Integration API Reference

This reference manual documents the official signatures, criteria structures, pagination limits, and linking behaviors for the Zoho CRM integration tasks used throughout this workspace.

---

## 1. Record Retrieval & Modifications

### `zoho.crm.getRecordById()`
Retrieves a specific record by its unique entity ID.
*   **Syntax**: `zoho.crm.getRecordById(<module_api_name>, <record_id>)`
*   **Response**: `Map` containing record attributes (or `null` if not found).
*   **Example**:
    ```deluge
    leadRecord = zoho.crm.getRecordById("Leads", leadId.toLong());
    ```

### `zoho.crm.updateRecord()`
Modifies fields on an existing record.
*   **Syntax**: `zoho.crm.updateRecord(<module_api_name>, <record_id>, <update_map>)`
*   **Response**: `Map` indicating success or API failure.
*   **Example**:
    ```deluge
    updateMap = Map();
    updateMap.put("Phone", phoneValue);
    response = zoho.crm.updateRecord("Contacts", contactId.toLong(), updateMap);
    ```

### `zoho.crm.createRecord()`
Creates a new record within the specified module.
*   **Syntax**: `zoho.crm.createRecord(<module_api_name>, <data_map>)`
*   **Response**: `Map` containing the newly created record ID.
*   **Example**:
    ```deluge
    newDeal = Map();
    newDeal.put("Deal_Name", "Acme Corporation - Deal");
    response = zoho.crm.createRecord("Deals", newDeal);
    ```

---

## 2. Searching & Relationship Navigation

### `zoho.crm.searchRecords()`
Queries records matching specific search criteria.
*   **Syntax**: `zoho.crm.searchRecords(<module_api_name>, <criteria>, <page>, <per_page>)`
*   **Criteria Rules**:
    *   Format: `"(<field_api_name>:equals:<value>)"`
    *   Maximum criteria in a single call: **10 criteria**.
    *   For encrypted fields, only `equals` is supported (behaves as `contains`).
*   **Limits & Pagination**:
    *   Maximum records returned per call: **200**.
    *   To retrieve more, increment the `page` argument in a loop.
*   **Example**:
    ```deluge
    results = zoho.crm.searchRecords("Contacts", "(Email:equals:" + email + ")", 1, 200);
    ```

### `zoho.crm.getRelatedRecords()`
Retrieves records linked via related lists.
*   **Syntax**: `zoho.crm.getRelatedRecords(<relation_api_name>, <parent_module_api_name>, <parent_record_id>, <page>, <per_page>, <query_value>)`
*   **Filtering**: Direct criteria filters are **not supported**. Pass an empty map `{"":""}` in the `query_value` position and filter the result list in Deluge using code loops.
*   **Example**:
    ```deluge
    relatedDeals = zoho.crm.getRelatedRecords("Deals", "Accounts", accountId.toLong());
    ```

---

## 3. Lead Conversion Task

### `zoho.crm.convertLead()`
Stops a Lead record and converts it into Contact, Account, and (optional) Deal records.
*   **Syntax**: `zoho.crm.convertLead(<lead_id>, <conversion_map>)`
*   **Conversion Map Keys**:
    *   `overwrite` (Boolean): Overwrite existing records if matched.
    *   `notify_lead_owner` (Boolean): Notify owner upon conversion.
    *   `Accounts` (String): ID of existing Account to merge into.
    *   `Contacts` (String): ID of existing Contact to merge into.
    *   `Deals` (Map): Details for Deal creation if not reusing an existing Deal.
*   **Response**: `Map` containing the converted IDs:
    ```json
    {
      "Contacts": "4102XXXXXXXXXXXXXXX",
      "Accounts": "4102XXXXXXXXXXXXXXX",
      "Deals": "4102XXXXXXXXXXXXXXX"
    }
    ```
*   **Example**:
    ```deluge
    conversionMap = Map();
    conversionMap.put("overwrite", false);
    if(existingAccountId != "")
    {
        conversionMap.put("Accounts", existingAccountId);
    }
    response = zoho.crm.convertLead(leadId, conversionMap);
    ```

---

## 4. Multi-Select Lookup (Linking Modules)

> [!IMPORTANT]
> **Multi-Select Lookups vs. Standard Picklists**
> In Zoho CRM, a Multi-Select Lookup field is backed by a **Linking Module** (a hidden junction table). You cannot associate records by updating a field on the main record directly. Instead, you must create an entry in the junction table.

### Establishing a Link via Deluge
1.  Identify the API name of the Linking Module (e.g. `Contacts_X_Products` or `Deals_X_Products`).
2.  Use `zoho.crm.createRecord` to insert an association entry:
    ```deluge
    linkMap = Map();
    linkMap.put("Deals", dealId);
    linkMap.put("Products", productId);
    response = zoho.crm.createRecord("Deals_X_Products", linkMap);
    ```

---

## 5. Deluge Helper Functions

### String Manipulation Utilities

*   **`trim()`**: Removes leading/trailing spaces.
    ```deluge
    cleaned = value.trim();
    ```
*   **`toLowerCase()`**: Standardizes text casing.
    ```deluge
    lower = value.toLowerCase();
    ```
*   **`replaceAll()`**: Substitutes matches of a pattern. Supports regex by default.
    ```deluge
    noPrefix = website.replaceAll("https://", "");
    ```
*   **`toList()`**: Splits a string into list elements.
    ```deluge
    itemList = commaSeparatedString.toList(",");
    ```
