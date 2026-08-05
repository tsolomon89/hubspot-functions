# Workflow: Developing React UI Extensions (App Cards)

This workflow outlines how to construct interactive React CRM cards rendered on HubSpot record pages.

---

## Step-by-Step Execution Plan

### Step 1: Scaffold Extension Directory
Inside `src/app/extensions/`, create the JSON card configuration and React component:
```
src/app/extensions/
├── AccountSummaryCard.json
├── AccountSummaryCard.jsx
└── package.json
```

### Step 2: Configure Card Target & Placement (`AccountSummaryCard.json`)
```json
{
  "type": "crm-card",
  "data": {
    "title": "Account Summary",
    "location": "crm.record.tab",
    "objectTypes": ["CONTACT", "COMPANY", "DEAL"],
    "file": "AccountSummaryCard.jsx"
  }
}
```

### Step 3: Write Component Code using `@hubspot/ui-extensions`
Use native UI components (`Tile`, `Flex`, `Heading`, `Text`, `Button`, `Table`, `LoadingSpinner`, `Alert`).
Call backend serverless functions via `runServerlessFunction`.

### Step 4: Run Dev Mode & Test in Browser
Launch dev mode to preview updates in real-time:
```bash
hs project dev
```
Open a Contact, Company, or Deal record page in your Developer Test Account. Verify the app card renders on the specified tab/sidebar location.

### Step 5: Test Error States & Mobile Responsiveness
* Verify fallback UI (`LoadingSpinner`, `Alert`) on backend delay or API errors.
* Confirm layout scales properly within standard CRM card panels.
