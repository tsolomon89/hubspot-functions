# Terminal & Command Execution Rules

This document outlines the environment and command-line execution rules for this workspace, specifically tailored for Windows PowerShell and the project's cloud services.

## OS & Shell Constraints

> [!WARNING]
> **PowerShell Syntax Incompatibility**
> Windows PowerShell does **not** support the `&&` operator for chaining commands. Always use semicolons `;` or run commands sequentially.

### Incorrect (Fails in PowerShell):
```powershell
npm run build && npm run test
```

### Correct (Succeeds in PowerShell):
```powershell
npm run build; npm run test
```

---

## Infrastructure & Tooling Matrix

The developer environment is integrated with Vercel, Google Cloud Platform (GCP), and Neon. Use the following command rules for these integrations:

### 1. Vercel Hosting & CLI
*   Deployments and staging reviews should use the official Vercel CLI.
*   Standard commands:
    *   `vercel dev` - Run Vercel locally.
    *   `vercel link` - Bind the project to Vercel.
    *   `vercel deploy` - Deploy a preview build.

### 2. Neon Database CLI
*   This project leverages Neon Serverless Postgres.
*   Use the Neon CLI for database branches and connection management:
    *   `neon auth` - Check authentication.
    *   `neon branches list` - View active database branches.
    *   `neon connection-string` - Get current connection credentials.

### 3. GCP Authentication & SDK
*   GCP handles auth and supporting microservices.
*   Utilize `gcloud` CLI tools when configuring accounts or validating authentication credentials.
