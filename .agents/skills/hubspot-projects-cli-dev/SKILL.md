---
name: hubspot-projects-cli-dev
description: Comprehensive guide for developing with HubSpot Projects, @hubspot/cli, hubspot.config.yml, project scaffolding, secret management, dependency locking, and developer test accounts.
---

# Skill: HubSpot Projects & CLI Development

This skill provides best practices, commands, and project structures for building apps on the **HubSpot Projects (Platform Version 2026.03+)** ecosystem using `@hubspot/cli`.

---

## 1. Environment & Setup Requirements

### Prerequisites
*   **Node.js**: LTS version (v20+ recommended).
*   **HubSpot CLI**: `@hubspot/cli` installed globally or as a project dependency.
*   **HubSpot Account**: Developer Portal with access to Developer Test Accounts or sandbox portals.

### Installing & Authenticating CLI
```bash
npm install -g @hubspot/cli@latest
hs auth
```
*   `hs auth` guides you through personal access key (PAK) authentication.
*   Check active portal context:
```bash
hs account list
hs account switch --account=<portal-name-or-id>
```

---

## 2. Project Architecture (`hubspot.config.yml` & `hsproject.json`)

HubSpot Projects unify UI extensions, serverless functions, and app components under a single repository structure.

### Standard Folder Layout
```
my-hubspot-project/
├── hsproject.json
├── hubspot.config.yml
├── src/
│   ├── app/
│   │   ├── app.functions/
│   │   │   ├── serverless.json
│   │   │   ├── package.json
│   │   │   └── myEndpoint.js
│   │   └── extensions/
│   │       ├── CardExtension.json
│   │       ├── CardExtension.jsx
│   │       └── package.json
│   └── assets/
└── package.json
```

### `hsproject.json` Template
```json
{
  "name": "my-hubspot-project",
  "platformVersion": "2026.03",
  "srcDir": "src"
}
```

---

## 3. Scaffolding & Project Lifecycle Commands

| Action | CLI Command | Description |
| :--- | :--- | :--- |
| **Create Project** | `hs project create` | Interactive project creation with app templates |
| **Install Dependencies** | `hs project install-deps` | Installs dependencies across all app extensions & functions |
| **Dev Mode** | `hs project dev` | Starts local watch server with real-time feedback |
| **Upload / Build** | `hs project upload` | Uploads project files to target portal |
| **Deploy** | `hs project deploy` | Prompts deployment of project build to production |
| **List Projects** | `hs project list` | Displays active projects in connected portal |

---

## 4. Secret & Environment Management

Never hardcode access keys, tokens, or third-party credentials. Use HubSpot Project Secrets.

### Secret Commands
```bash
# Add or update a secret in target portal
hs project secret add MY_THIRD_PARTY_API_KEY

# List active project secrets
hs project secret list

# Delete a secret
hs project secret delete MY_THIRD_PARTY_API_KEY
```

### Referencing Secrets in Serverless Functions
Secrets are exposed at runtime via environment variables in Node.js:
```javascript
const apiKey = process.env.MY_THIRD_PARTY_API_KEY;
```

---

## 5. Dependency Management & Build Stability

*   Always commit `package-lock.json` files for `app.functions/` and `extensions/`.
*   Run `npm install` inside subfolders before running `hs project upload` or `hs project deploy`.
*   Use `hs project install-deps` at root to batch-install sub-package dependencies.

---

## 6. Multi-Portal Strategy & Developer Test Accounts

1.  Create a **Developer Test Account** from your HubSpot Developer Portal.
2.  Authenticate test portal in CLI: `hs auth` -> Assign name `test-portal`.
3.  Deploy and test features safely:
    ```bash
    hs project upload --account=test-portal
    ```
4.  Once verified, deploy to production portal:
    ```bash
    hs project deploy --account=prod-portal
    ```
