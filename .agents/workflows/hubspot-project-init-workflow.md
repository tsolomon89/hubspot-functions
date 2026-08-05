# Workflow: Scaffolding a HubSpot Project

This workflow guides developers through initializing a new HubSpot Project using `@hubspot/cli`, configuring project metadata, setting up secrets, and verifying portal deployment.

---

## Prerequisites
* Node.js v20+ installed.
* `@hubspot/cli` installed (`npm install -g @hubspot/cli@latest`).
* Authenticated HubSpot Developer Portal account (`hs auth`).

---

## Step-by-Step Execution Plan

### Step 1: Verify Authentication & Target Portal
Execute the account check command to confirm the target portal:
```bash
hs account list
```
If necessary, switch to your target portal:
```bash
hs account switch --account=<portal-name>
```

### Step 2: Create Project Scaffold
Run the interactive project creation wizard in the workspace:
```bash
hs project create
```
* Select the **App** template.
* Target Platform Version: **2026.03** or higher.
* Name your project folder (e.g., `my-hubspot-app`).

### Step 3: Configure Project Metadata
Inspect `hsproject.json` and ensure platform versioning and source folder settings are correct:
```json
{
  "name": "my-hubspot-app",
  "platformVersion": "2026.03",
  "srcDir": "src"
}
```

### Step 4: Install Dependencies across extensions and functions
From the root of the created project, install all component dependencies:
```bash
hs project install-deps
```

### Step 5: Configure Application Secrets
Set required project secrets in the HubSpot cloud environment:
```bash
hs project secret add PRIVATE_APP_TOKEN
hs project secret add THIRD_PARTY_API_KEY
```

### Step 6: Initial Upload & Local Dev Validation
Start local watch mode:
```bash
hs project dev
```
Verify that local files sync seamlessly without build errors.
