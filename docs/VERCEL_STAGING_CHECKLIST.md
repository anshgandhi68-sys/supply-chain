# Supply Chain Sentinel 2.0 — Vercel Staging & Preview Deployment Checklist

## 1. Environment & Build Configuration Overview

- **Framework**: Next.js App Router (Next.js 16.x)
- **Node Runtime**: Node.js 20.x LTS
- **Build Command**: `npm run build`
- **Output Directory**: `.next`
- **Production Branch**: `main`
- **Production Branch**: `main`
- **Feature / Preview Branch**: `feat/durable-saas-infrastructure`
- **Maximum Function Duration**: 30 seconds (Vercel Serverless Function budget for hobby/pro)

---

## 2. Environment Variables Configuration

| Variable Name | Required Scope | Sensitive? | Purpose |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | All | No | `production` / `development` / `test` |
| `AUTH_PROVIDER` | Preview & Production | No | `clerk`, `managed`, or `local` |
| `DATABASE_URL` | Production / Staging | **YES** | Managed PostgreSQL connection string (Supabase / Neon / RDS) |
| `CLERK_SECRET_KEY` | Server-Side Only | **YES** | Clerk secret key for managed authentication |
| `CLERK_JWT_KEY` | Server-Side Only | **YES** | Clerk RS256 Public Key (PEM) for offline signature verification |
| `CLERK_ISSUER` | Server-Side Only | No | Expected JWT issuer (e.g., `https://clerk.<app>.accounts.dev`) |
| `CLERK_AUDIENCE` | Server-Side Only | No | Expected JWT audience or authorized party (`azp`) |
| `UPSTASH_REDIS_REST_URL`| Production / Staging | **YES** | Upstash Redis REST URL for distributed rate limiting |
| `UPSTASH_REDIS_REST_TOKEN`| Production / Staging | **YES** | Upstash Redis REST bearer token |
| `GITHUB_API_TOKEN` | Server-Side Only | **YES** | Optional platform-level fallback token for public repo scans |

> [!WARNING]  
> **CRITICAL SECURITY RULE**: Never prefix backend credentials, database URLs, or GitHub tokens with `NEXT_PUBLIC_`. All token-bearing environment variables must remain strictly server-side.

---

## 2.1 Database Migration Procedure (PostgreSQL)

Before enabling `DATABASE_URL` in production or staging:
1. **Apply Initial Schema Migration**:
   ```bash
   psql -d "$DATABASE_URL" -f migrations/001_initial_schema.sql
   ```
2. **Verify Created Tables & Indexes**:
   ```bash
   psql -d "$DATABASE_URL" -c "\dt"
   # Expected tables: users, workspaces, workspace_members, scans, audit_events
   ```
3. **Rollback Script (If Needed)**:
   ```bash
   psql -d "$DATABASE_URL" -f migrations/001_initial_schema_down.sql
   ```

---

## 3. Pre-Deployment Staging Checklist

Execute these checks on your feature branch prior to merging into production:

- [ ] **1. Clean Local Build**: Run `npm run build` locally. Confirm zero TypeScript errors and zero route compilation failures.
- [ ] **2. Automated Test Suite**: Run `npm test`. All unit, integration, and security regression tests must pass.
- [ ] **3. Dependency Vulnerability Audit**: Run `npm audit`. Confirm zero critical or high known vulnerabilities in direct dependencies.
- [ ] **4. Security Headers Active**:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- [ ] **5. Dynamic Route Caching Guard**:
  - All API routes (`/api/scan`, `/api/workspaces/*`, `/api/health`, `/api/export`) must export `export const dynamic = 'force-dynamic'`.
  - Sensitive API routes must emit `Cache-Control: no-store, no-cache, must-revalidate`.
- [ ] **6. In-Flight Concurrency & Rate Limiting**:
  - Anonymous callers restricted to 10 req/min, 2 concurrent scans.
  - Authenticated callers restricted to 60 req/min, 5 concurrent scans.
  - Responses return standard headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `x-request-id`).
- [ ] **7. Socket-Level SSRF Interception**:
  - Outbound requests to GitHub and OSV pass through `getSafeAgent()`.
  - Private IPv4/IPv6, cloud metadata (`169.254.169.254`), and loopback addresses are blocked at connection time.

---

## 4. Vercel Preview Deployment Steps (Non-Destructive)

To deploy a preview build without modifying production:

1. **Push Feature Branch**:
   ```bash
   git push origin feat/startup-mvp-foundation
   ```
2. **Inspect Preview Deployment on Vercel Dashboard**:
   - Vercel automatically creates a unique preview URL (e.g., `supply-chain-sentinel-git-feat-startup-mvp-*.vercel.app`).
   - Confirm the build log shows `✓ Compiled successfully in ~250ms`.
3. **Verify Health Endpoint**:
   - Access `https://<preview-domain>/api/health`.
   - Confirm HTTP 200 response with `status: "healthy"` and OSV latency metrics.
4. **Run Smoke Test Scan on Preview**:
   - Access `https://<preview-domain>/analyze`.
   - Run a controlled demo scan or a known small public repo (e.g., `expressjs/express`).
   - Verify that results render with observed facts and remediation diffs.
5. **Verify Customer Trust Page**:
   - Access `https://<preview-domain>/trust`.
   - Verify disclaimer, data policies, and feedback form.

---

## 5. Rollback & Incident Recovery Plan

If a deployment exhibits unexpected runtime errors or rate limit starvation:

1. **Instant Rollback via Vercel Dashboard**:
   - Navigate to **Project > Deployments**.
   - Locate the previous stable production deployment (Commit `e4bc61b`).
   - Click the three-dots menu `...` and select **Promote to Production**. Rollback takes effect globally within 15 seconds.
2. **Git Branch Revert (Alternative)**:
   ```bash
   git checkout main
   git revert HEAD
   git push origin main
   ```
3. **Emergency Disabling of GitHub Scans**:
   - If GitHub rate limits are completely exhausted, users can still perform local manifest scans via `/analyze` by pasting `package.json` and `package-lock.json` directly.
