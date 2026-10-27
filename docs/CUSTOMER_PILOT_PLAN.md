# Supply Chain Sentinel 2.0 — Customer Pilot & Early Access Plan

## 1. Pilot Program Objective

The objective of the Supply Chain Sentinel 2.0 Pilot is to validate core product value with **5 to 10 early-stage tech startups** (Seed to Series A) and small DevSecOps teams over a **30-day evaluation period**.

**Core Hypothesis:**  
Engineering leads and startup CTOs will prioritize fixing software supply chain vulnerabilities when presented with:
1. Connected dependency graph context (direct vs transitive ancestry),
2. GitHub Actions CI/CD risk modeling (script injection, untrusted actions),
3. Clean separation of verified facts from speculative inferences, and
4. Reviewable, copy-pasteable remediation manifest diffs.

---

## 2. Customer Cohort Profile

| Attribute | Ideal Profile | Rationale |
| :--- | :--- | :--- |
| **Team Size** | 3 – 25 software engineers | High velocity, limited dedicated security staff, direct CTO involvement. |
| **Stack** | Node.js / TypeScript, npm / yarn, GitHub Actions | Matches Sentinel's deepest AST and lockfile analysis engines. |
| **Pain Point** | Tired of 500+ noisy Dependabot / Snyk alerts with no context on exploitability or transitive impact. | Seeking actionable, prioritized remediation without breaking builds. |

---

## 3. Pilot Onboarding Journey (Week 1 – Week 4)

```
[Day 1: Frictionless Onboarding]
   ├── Access Sentinel Workstation (No signup required for public scans)
   ├── Review Controlled Risky Demo to calibrate expectations
   └── Scan primary open-source repo or upload package-lock.json

[Day 2 - 7: First Baseline Scan & Remediation]
   ├── Review Posture Score & Evidence Classification
   ├── Inspect Transitive Attack Paths in Attack Graph
   ├── Apply surgical remediation diff to package.json
   └── Export CycloneDX SBOM for customer/investor compliance

[Day 8 - 21: CI/CD Workflow Hardening]
   ├── Run analysis across `.github/workflows/*.yml`
   ├── Pin GitHub Actions to immutable 40-character commit SHAs
   └── Eliminate `pull_request_target` untrusted script execution risks

[Day 22 - 30: Evaluation & Feedback Review]
   ├── Conduct 30-minute structured feedback interview
   ├── Review reported false positives via `/trust` feedback portal
   └── Review value metrics: resolved findings, saved triage hours
```

---

## 4. Key Pilot Success Metrics

| Metric | Target Goal | Measurement Method |
| :--- | :--- | :--- |
| **Time-to-First-Scan** | < 60 seconds | From opening `/analyze` to viewing findings graph. |
| **Actionable Remediations Applied** | ≥ 3 remediations / team | Diffs accepted and committed to pilot repos. |
| **False Positive Perception** | < 10% reported findings | Submissions via the `/trust` feedback channel. |
| **CTO Willingness-to-Recommend** | Net Promoter Score ≥ 50 | End-of-pilot structured interview. |

---

## 5. Cost & Infrastructure Boundaries for Startups

| Resource | Current MVP Tier | Pilot Budget / Constraints |
| :--- | :--- | :--- |
| **Hosting** | Vercel Serverless (Hobby/Pro) | 30s max duration per scan request. Large monorepos (>5,000 packages) are capped to prevent timeouts. |
| **GitHub API** | Anonymous (60 req/hr) / Authenticated (5,000 req/hr) | Advise pilot teams to supply an optional read-only GitHub PAT for repositories with >20 dependencies. |
| **Vulnerability Database** | OSV.dev Batch API | Free, public, highly reliable vulnerability feed queried via batch requests. |
| **Persistence** | In-Memory (Local Dev) / PostgreSQL (Upcoming) | 30-day retention with zero-token storage guarantee. |

---

## 6. Feedback & Interview Protocol

During the weekly check-ins, interview questions focus on:
1. *Did the distinction between Observed Facts, Inferred Risks, and Unknowns change how you prioritized your fixes?*
2. *Were the remediation diffs accurate enough to commit directly without causing dependency conflicts?*
3. *Did the GitHub Actions AST findings surface risks your team was previously unaware of?*
4. *What integration would make Sentinel indispensable to your daily deployment pipeline (e.g., GitHub PR bot, Slack alerts)?*
