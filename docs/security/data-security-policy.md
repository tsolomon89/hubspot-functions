# Data Security & Repository Containment Policy

**Effective Date:** 2026-08-05  
**Scope:** `hubspot-functions` and related repositories  

---

## 1. Zero Production Data Policy

- **No Real Customer Data:** Real CRM exports, contact emails, names, phone numbers, or pipeline data must NEVER be committed to version control.
- **Synthetic Fixtures Only:** All automated tests, integration tests, and local fixtures must use synthetic mock data (e.g. `user@example.com`, `Globex Corp`, `SKU-360-FIXED`).
- **Strict Exclusions:** `.gitignore` enforces top-level and recursive exclusions on `*.csv`, `.env`, credentials, and export directories.

---

## 2. Remote Repository & History Containment Runbook

Because history rewriting (`git filter-repo`) and changing repository visibility affect remote GitHub state:

1. **Repository Visibility:** Change both `hubspot-functions` and `zoho-functions` repositories from **Public** to **Private** on GitHub.
2. **History Purge (if needed):**
   ```bash
   # Remove all CSV files from git history using git filter-repo
   git filter-repo --invert-paths --path-glob '*.csv'
   git push origin main --force
   ```
3. **Credential Audit:** Audit historical commits for any third-party tokens, API keys, or secrets. If any key was ever committed historically, rotate it immediately in the vendor dashboard.
