# Supply Chain Sentinel 2.0 — Customer Data Handling & Privacy Policy

## 1. Overview & Data Processing Principles

Supply Chain Sentinel 2.0 is built on the principle of **data minimization** and **zero persistent credentials**. We collect and process only the minimal structural metadata required to analyze software dependency trees and CI/CD security postures.

---

## 2. Data Classification Matrix

| Data Element | Ingested? | In-Memory Processing | Persisted to Storage? | Retention Duration |
| :--- | :--- | :--- | :--- | :--- |
| **GitHub Tokens / PATs** | Optional (for rate limits) | Ephemeral in-flight memory only | **NEVER** (Zero-token guarantee) | Discarded immediately after request |
| **Package Manifests (`package.json`)** | Yes | Parsed for dependency ranges & scripts | Only if explicitly saved to workspace | 30 days max (or user deletion) |
| **Resolved Lockfiles (`package-lock.json`)** | Yes | Parsed for exact versions & integrity hashes | Only if explicitly saved to workspace | 30 days max (or user deletion) |
| **Workflow Definitions (`.github/workflows/*.yml`)** | Yes | Parsed into AST for action pinning & syntax | Only if explicitly saved to workspace | 30 days max (or user deletion) |
| **Source Code / Implementation Logic** | **NO** | Never read, downloaded, or processed | **NEVER** | Not applicable |
| **Security Finding Metadata** | Yes (generated) | Correlated with OSV vulnerability database | Stored with workspace scan history | 30 days max (or user deletion) |
| **User & Workspace IDs** | Yes | Verified against session context | Stored in workspace directory | Permanent until account deletion |
| **Audit Logs** | Yes | Generated on sensitive state changes | Append-only ledger | 90 days |

> [!IMPORTANT]
> **STORAGE ARCHITECTURE & DATABASE INTEGRATION (PHASE 6):**  
> Sentinel provides durable schema migrations targeting managed PostgreSQL (Supabase, Neon, AWS RDS) defined in `migrations/001_initial_schema.sql` covering `users`, `workspaces`, `workspace_members`, `scans`, and `audit_events`.
> When `DATABASE_URL` is set, data is stored durably with foreign key constraints, indexes, and active retention pruning.
> In test environments and unconfigured previews, Sentinel safely defaults to its in-memory repository with explicit `isDurable: false` warnings.

---

## 3. Zero-Token Persistence Guarantee

When a user provides a GitHub Personal Access Token (PAT) or OAuth token:
1. **No Database Persistence**: The token is never passed to any database, key-value store, or caching layer.
2. **No Log Exposure**: Standard structured logging and error reporting routines pass all outputs through `redactSecrets()`, masking any `ghp_`, `gho_`, or `Bearer` tokens with `[REDACTED_SECRET]`.
3. **No Browser Storage**: Tokens are not written to `localStorage`, `sessionStorage`, or unencrypted cookies.
4. **Transport Security**: Outbound GitHub API calls use TLS 1.3/1.2 with strict certificate verification.

---

## 4. Retention & Automatic Expiry

- **Default Lifecycle**: Every saved workspace scan record receives an immutable `retentionExpiresAt` timestamp calculated as `now() + 30 days`.
- **Automatic Pruning**: Queries to `/api/workspaces/scans` filter out expired records at read time. Periodic cleanup routines purge expired records from storage.
- **Custom Retention**: Enterprise workspaces can configure custom retention windows (from 7 days to 90 days).

---

## 5. Self-Serve Data Deletion

- **Scan Record Deletion**: Workspace administrators can delete individual scan records or clear entire workspace history via the workspace API (`DELETE /api/workspaces/scans?scanId=...`) or user interface.
- **Immediate Effect**: Upon confirmation, the scan record and associated findings are permanently removed from the data store.
- **Audit Verification**: Deletions generate a tamper-evident audit event record (`action: 'scan_deleted'`) recording the actor and timestamp for compliance assurance.

---

## 6. Incident Response & Security Contact

To report security vulnerabilities, suspected data exposure, or request full workspace deletion:
- **Email**: `security@sentinel.example` (or through the in-app feedback modal at `/trust`)
- **PGP Key**: Published upon request
- **Response SLA**: Initial triage within 24 business hours
