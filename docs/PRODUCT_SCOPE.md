# Supply Chain Sentinel 2.0 — Product Scope & Specifications

## 1. Executive Summary & Core Promise

**Supply Chain Sentinel 2.0** is an evidence-backed software supply-chain security investigation platform designed specifically for startup CTOs, small engineering teams, and DevSecOps practitioners.

> **Core Promise:**  
> *"Investigate software supply-chain risks with evidence-backed findings, connected dependency and CI/CD context, and prioritized remediation."*

Sentinel moves beyond noisy flat vulnerability lists by correlating declared and resolved package dependencies with GitHub Actions CI/CD workflows, modeling potential attack paths, and cleanly separating observed facts from inferred risks.

---

## 2. Target Customer & User Personas

| Persona | Primary Needs | How Sentinel Solves It |
| :--- | :--- | :--- |
| **Startup CTO / VP Eng** | Clear posture overview, compliance readiness, risk prioritization before product launches. | Executive posture score, exposure metrics, zero-token privacy guarantee, and exportable CycloneDX SBOMs. |
| **Small Engineering Team** | Actionable fix instructions without breaking production dependencies. | Remediation Studio providing minimal-impact semver diffs, lockfile reconciliation, and PR-ready snippets. |
| **DevSecOps / AppSec Engineer** | Distinguishing actual exploitable paths from phantom alerts; CI workflow hardening. | Attack graph visualization, unpinned CI action detection, script injection analysis, and explicit Unknowns classification. |

---

## 3. Product Scope & Operational Boundaries

### What Sentinel Does
1. **Static Ingestion & Parsing**: Parses `package.json` (syntax, declared ranges) and `package-lock.json` (v1, v2, v3 formats, resolved versions, integrity hashes).
2. **CI/CD Workflow Analysis**: AST parsing of `.github/workflows/*.yml` to detect unpinned actions, `pull_request_target` triggers, untrusted `github.event` injections, and excessive default permissions.
3. **Evidence Modeling**: Synthesizes a unified evidence model categorizing every finding into **Observed Facts**, **Inferred Risks**, and **Unknowns**.
4. **Graph & Attack Path Modeling**: Traces direct and transitive dependency chains to identify how a vulnerable package enters the dependency tree.
5. **Remediation Diffing**: Generates surgical `package.json` manifest diffs targeting fixed versions with semver breaking-change warnings.
6. **Standard Compliance Exports**: Exports findings in CycloneDX 1.5 JSON SBOM, Markdown executive summary, CSV inventory, and printable HTML formats.

### What Sentinel Does NOT Do (Strict Boundaries)
- **No Remote Code Execution**: Sentinel **never** executes `npm install`, runs `preinstall`/`postinstall` lifecycle scripts, or runs analyzed source code.
- **No Universal Guarantee**: Automated scanning cannot discover every zero-day vulnerability or guarantee that audited software is 100% bug-free.
- **No Replacement for Human Pentests**: Automated supply-chain heuristics do not replace dedicated human application security assessments or red-team engagements.
- **No Private Source Code Archival**: Proprietary source files are never mirrored or archived in Sentinel databases.

---

## 4. Evidence Classification Model

To prevent false confidence or alarm fatigue, Sentinel enforces a three-tier evidence taxonomy:

```
┌─────────────────────────────────────────────────────────────┐
│                      EVIDENCE TAXONOMY                      │
├─────────────────────────────────────────────────────────────┤
│ 1. OBSERVED FACTS                                           │
│    - Exact resolved versions extracted from lockfiles       │
│    - Unpinned Git commit SHAs in GitHub Actions YAML        │
│    - Confirmed CVE / GHSA advisories in the OSV database    │
│    - Validated integrity hashes (SHA-512)                   │
├─────────────────────────────────────────────────────────────┤
│ 2. INFERRED RISKS                                           │
│    - Potential reachability through transitive call chains  │
│    - Workflow script injection via PR branch names          │
│    - Supply chain blast radius across multiple packages     │
├─────────────────────────────────────────────────────────────┤
│ 3. UNKNOWNS                                                 │
│    - Unresolved versions when lockfiles are missing         │
│    - Production vs devDependency status when unclassified   │
│    - Actual runtime function invocation within code         │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Demo Fixtures vs. Live Scan Transparency

Sentinel enforces strict visual and programmatic labelling between real scans and demo fixtures:
- **Demo Mode**: Clearly watermarked with `DEMO` badges, synthetic CVE identifiers (e.g., `DEMO-001`), and warning banners. Fixture data is never commingled with real scans.
- **Live Scans**: Accurately report upstream rate limits, repository metadata, commit SHAs, scan duration, and incomplete analysis warnings if lockfiles are missing.
