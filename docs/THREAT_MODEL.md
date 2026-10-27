# Supply Chain Sentinel 2.0 — Threat Model

## 1. Scope & System Overview

Supply Chain Sentinel 2.0 ingests software manifests (`package.json`, `package-lock.json`) and CI/CD workflow definitions (`.github/workflows/*.yml`) from public and private GitHub repositories or direct user uploads, compares packages against public vulnerability feeds (OSV), and renders risk graphs and remediation reports.

This threat model uses the **STRIDE** methodology (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege) evaluated against the **OWASP ASVS 5.0.0** and **OWASP API Security Top 10** standards.

---

## 2. Trust Boundaries & Data Flow Architecture

```
[Untrusted Client / Browser]
        │
   (HTTPS / TLS)
        ▼
[Edge / Vercel Ingress] ── Rate Limiter & Concurrency Governor (Sliding Window)
        │
[Sentinel API / Next.js Serverless Execution]
   ├── [Request Validation] (Content-Length, 5MB body limits, JSON parsing)
   ├── [Auth & Workspace Guard] (RBAC, Tenant Isolation, Anti-IDOR)
   ├── [Outbound Fetch Hardening] (SSRF Defense, DNS Rebinding Guard, IP Pinning)
   │        │
   │        ├─── (TLS + Socket Interception) ──► [GitHub Public / API]
   │        └─── (HTTPS) ──────────────────────► [OSV.dev Batch Vulnerability API]
   │
   └── [Audit Ledger & Telemetry] (Zero Token Persistence, In-Memory Redaction)
```

---

## 3. Threat Analysis (STRIDE)

### A. Spoofing (Identity & Authenticity)
- **Threat**: Attacker accesses or modifies another workspace's scan history by guessing or forging a workspace ID or scan ID.
- **Countermeasure**: Server-side tenant verification via `requireWorkspaceAccess(workspaceId, userId, requiredRole)`. Client-supplied IDs are never trusted without validating membership. In local development mode, access defaults safely to viewer privileges.
- **Threat**: Attacker spoofs upstream GitHub repository metadata or branch references.
- **Countermeasure**: Verification of repository full name format (`owner/repo`), commit SHA length validation (40 hex characters), and strict TLS hostname verification for all GitHub API calls.

### B. Tampering (Integrity)
- **Threat**: Malicious actor tampers with advisory data or submits malformed ASTs to corrupt server state.
- **Countermeasure**: All manifest parsing (`package.json`, `package-lock.json`, workflow YAML) is performed with strict syntax validation, AST depth limits, and cyclic reference guards. Schemas are validated prior to graph construction.

### C. Repudiation (Accountability)
- **Threat**: Disputed deletions or modifications of scan records and security posture data.
- **Countermeasure**: Structured audit logging (`logAuditEvent`) recording `actorId`, `workspaceId`, `action`, `resourceId`, and timestamp for every state change (scan save, scan deletion, role check).

### D. Information Disclosure (Confidentiality)
- **Threat**: Accidental leak of GitHub Personal Access Tokens (PATs) or private repository metadata via error messages, logs, or exports.
- **Countermeasure**:
  1. **Zero-Token Storage**: Tokens are used strictly in-flight and never stored in databases, browser storage, or URLs.
  2. **Automated Secret Redaction**: All strings entering reports, logs, or exports pass through `redactSecrets()`, stripping Bearer tokens, GitHub PATs (`ghp_*`), AWS keys, and private keys.
  3. **Strict Headers**: `Cache-Control: no-store, max-age=0` on sensitive routes prevents caching in shared proxies or CDN caches.

### E. Denial of Service (Availability & Resource Exhaustion)
- **Threat**: High-concurrency or recursive payload attacks exhausting serverless CPU/memory budget.
- **Countermeasures**:
  1. **Payload Size Guard**: Max 5 MB JSON payload via `readJsonBodyWithLimit`.
  2. **Sliding Window Rate Limiter**: 10 req/min for anonymous IP; 60 req/min for authenticated workspaces.
  3. **Concurrency Limiter**: Max 2 parallel scans per anonymous IP; max 5 per workspace.
  4. **Upstream Streaming Limits**: 10 MB maximum remote response buffer via `fetchSafeGitHub()`.
  5. **Graph Traversal Limits**: Max 5,000 nodes and depth limits preventing recursive prototype pollution.

### F. Elevation of Privilege (Authorization)
- **Threat**: Viewer-role member deletes scan reports or alters workspace settings.
- **Countermeasure**: Role hierarchy (`viewer` < `analyst` < `admin` < `owner`). Saving scans requires `analyst` (level 2); deleting scans requires `admin` (level 3).

---

## 4. SSRF & DNS Rebinding Threat Matrix

| Attack Vector | Attacker Payload | Sentinel Defense Mechanism |
| :--- | :--- | :--- |
| **AWS / GCP Cloud Metadata** | `http://169.254.169.254/latest/meta-data/` | Hostname whitelist (`github.com`, `api.github.com`, `raw.githubusercontent.com`) + IP classification check blocking `169.254.0.0/16`. |
| **Loopback / Internal LAN** | `http://127.0.0.1:8080` or `http://[::1]` | Pre-flight DNS validation rejects loopback, RFC 1918, RFC 4193, and link-local ranges. |
| **DNS Rebinding (TOCTOU)** | Dual-record DNS or low-TTL DNS switching to private IP between resolution and connection | Socket-level lookup hook (`undici.Agent({ connect: { lookup } })`) intercepts the real socket connect address at transport time. |
| **Redirect to Internal Host** | HTTP 302 redirecting from GitHub to `http://10.0.0.1` | Manual redirect handling with per-hop SSRF validation (`fetchSafeGitHub` validates every redirect target). |
| **Decimal / Hex IP Encodings** | `http://2130706433` (`127.0.0.1`) | `isPrivateOrBlockedIp()` validates raw integer bitmask and octal representations. |

---

## 5. Distributed Infrastructure & Managed Auth Threat Matrix (Phase 6)

| Threat Vector | Attack Scenario | Countermeasure & Defensive Control |
| :--- | :--- | :--- |
| **JWT Algorithm Confusion / 'alg: none'** | Attacker crafts JWT with `"alg": "none"` or swaps RS256 public key as HMAC secret | `verifyManagedAuthToken()` enforces strict algorithm whitelist (`HS256`, `RS256`), rejects `none`, and prevents key type confusion. |
| **JWT Signature Timing Attack** | Attacker measures cryptographic byte-comparison latency to forge HMAC signatures | Constant-time comparison using `crypto.timingSafeEqual` over fixed-length buffer digests. |
| **Rate Limit IP Spoofing** | Attacker sends forged `X-Forwarded-For: 1.2.3.4` headers to bypass rate limits | `getClientIdentifier()` prioritizes immutable edge header `X-Real-IP`; only verified auth sessions receive elevated quotas. |
| **Upstash Redis Denial-of-Service** | Redis cluster experiences network partitions or outages | Rate limiter fails secure: 1500ms timeout with automatic fallback to local in-memory sliding window (never fails open). |
| **SQL Injection (CWE-89)** | Malicious repository names or workspace IDs with SQL escape sequences | Parameterized queries with strict input sanitization; never concatenates raw inputs into SQL strings. |
| **Cross-Tenant IDOR (CWE-639)** | User attempts to access scan records belonging to another workspace | Mandatory server-side workspace membership verification on every query; scans and audits foreign-keyed to `workspace_id`. |
| **Database Table Owner RLS Bypass** | Application DB role possesses table ownership, bypassing default PostgreSQL RLS | Migrations execute `FORCE ROW LEVEL SECURITY` on all tenant tables (`workspaces`, `workspace_members`, `scans`, `audit_events`). |
| **Clerk Token Claim Tampering** | Attacker presents valid token with forged `org_id` or `org_role` claims | Clerk tokens are verified with RS256 public key; signature covers all claims; audience and issuer must match trusted domain. |
| **Distributed Rate Limiting Inconsistency** | Serverless cold instances experience Redis network failure | Local fallback ensures each instance enforces local sliding-window quota (10 req/min); limits are safe (never unlimited) even if cross-instance synchronization is degraded. |

---

## 6. Verification and Regression Testing Summary (Phase 6.1)
All countermeasures in Section 5 and Section 6 are validated in automated regression suites:
- `src/tests/phase6-durable-infrastructure.test.ts` (12 tests)
- `src/tests/phase6-1-live-staging-verification.test.ts` (14 tests)
- `src/tests/phase5-startup-mvp.test.ts` (19 tests)
- `src/tests/adversarial-security.test.ts` (18 tests)

