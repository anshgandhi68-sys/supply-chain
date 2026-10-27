# Supply Chain Sentinel 2.0 — Scan Execution Reliability & Queue Architecture

## 1. Executive Summary & Runtime Budget Analysis

Supply Chain Sentinel 2.0 processes software supply chain risk evaluations across dependency lockfiles and GitHub Actions workflow ASTs.

### Synchronous Vercel Serverless Function Budgets
- **Vercel Hobby Tier**: 15 seconds maximum duration.
- **Vercel Pro Tier**: 30 seconds maximum duration (configurable up to 300s with Fluid Compute).
- **Node.js Memory Limit**: 1024 MB (default).

### Measured Workload Performance
| Workload Profile | Package / Node Count | Average Duration | Fits Synchronous Budget? |
| :--- | :--- | :--- | :--- |
| **Small / Standard Repo** (e.g., Express, Fastify) | 50 – 250 dependencies | 450ms – 1,200ms | **YES** (Safely within 15s limit) |
| **Medium Application** (e.g., Next.js SaaS) | 250 – 1,500 dependencies | 1,200ms – 4,500ms | **YES** (Safely within 15s limit) |
| **Large Monorepo** (e.g., Turborepo, 5+ workspaces) | 1,500 – 5,000 dependencies | 4,500ms – 12,000ms | **YES** (Fits Pro 30s budget) |
| **Massive Enterprise Monorepo** (>10 workspaces) | > 5,000 dependencies | > 25,000ms | **RISK OF TIMEOUT** |

---

## 2. Active Defensive Boundaries (Synchronous Execution)

To prevent resource starvation and serverless function timeouts, Sentinel enforces strict static bounds:
1. **Max Manifest Size**: 5 MB (`readJsonBodyWithLimit`).
2. **Max Outbound Stream Size**: 10 MB buffer limit in `safeGitHubFetch`.
3. **Max Graph Traversal Depth**: 5,000 nodes; cyclic dependencies detected and terminated via visited set.
4. **OSV Batch Sizing**: Batched into chunks of 500 packages per request with 3-second timeout.
5. **Abort Controller Deadlines**: Remote fetches abort after 10,000ms.

---

## 3. Asynchronous Queue & Background Worker Architecture (Private Beta Phase)

When repositories exceed 5,000 dependencies or when users scan entire GitHub organizations, synchronous HTTP requests must be offloaded to a durable queue.

```
[Client / Browser]
       │
  (POST /api/scan)
       ▼
[Sentinel API Route] ── (Payload Size & Auth Check)
       │
  (Enqueues Job with Idempotency Key)
       ▼
[Upstash QStash / Inngest Queue]
       │
  (Dispatches with 10-minute deadline)
       ▼
[Serverless Background Worker / Next.js Background Function]
       ├── [State: FETCHING_MANIFESTS] (safeGitHubFetch with socket DNS guard)
       ├── [State: PARSING_AST] (Lockfile v1/v2/v3 + Workflow AST)
       ├── [State: QUERYING_OSV] (Batch vulnerability lookup)
       ├── [State: EVALUATING_DIFFS] (Remediation diff generation)
       └── [State: COMPLETED] (Persists report to durable PostgreSQL)
```

---

## 4. Job State Machine & Idempotency

### Scan Lifecycle States
- `PENDING`: Request received and validated.
- `QUEUED`: Enqueued in background message queue.
- `PROCESSING`: Worker actively analyzing dependency graph.
- `COMPLETED`: Scan successfully stored in PostgreSQL with finding counts.
- `FAILED`: Unrecoverable error (e.g., repository deleted, malformed input).
- `TIMEOUT`: Execution exceeded 10-minute maximum worker deadline.

### Idempotency Key Formula
$$\text{IdempotencyKey} = \text{SHA-256}(\text{workspaceId} + \text{repository} + \text{commitSha})$$
If a scan with the identical key is already `PROCESSING` or `COMPLETED` within the last 15 minutes, the existing scan result is returned immediately without re-executing analysis.

---

## 5. Cost & Operational Overhead Analysis

| Provider | Free Tier Quota | Estimated Cost Beyond Free Tier | Evaluation |
| :--- | :--- | :--- | :--- |
| **Upstash QStash** | 500 messages / day | $1.00 per 100,000 messages | **Recommended**: Serverless REST queue, zero infrastructure to manage. |
| **Inngest** | 50,000 steps / month | $20.00 / month | Alternative: Native workflow orchestration with visual debugging. |
| **AWS SQS + Lambda** | 1,000,000 requests / month | Fractions of a cent | High setup complexity, requires dedicated AWS IAM roles. |

### Decision
For the Private Beta:
- Maintain synchronous execution for standard repositories (<2,500 packages).
- Add Upstash QStash webhook endpoint (`/api/jobs/scan`) when onboarding enterprise pilot customers with massive monorepos.
