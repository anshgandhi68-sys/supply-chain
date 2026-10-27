# Supply Chain Sentinel 2.0 🛡️

**Supply Chain Sentinel 2.0** is an evidence-driven software supply-chain security investigation workstation. It transforms raw dependency manifests, lockfiles, and GitHub Actions CI/CD workflows into an interactive spatial attack graph, actionable tri-part evidence models, and deterministically verified remediation proposals.

---

## ⚡ Core Architecture & Guarantees

1. **Zero Code Execution**:
   - Operates in a read-only analysis sandbox. Manifests, lockfiles, and workflow ASTs are parsed and inspected **strictly as data**.
   - Untrusted packages from npm, PyPI, or Go are never downloaded or executed, and CI shell scripts are never evaluated.
2. **Deterministic Upstream Security Advisories (Google OSV API)**:
   - Integrates directly with Google's OSV database (`api.osv.dev`) with SemVer boundary validation across ecosystems (`npm`, `PyPI`, `Go`, `crates.io`, `Maven`, etc.).
   - Advisories, CVEs, GHSAs, and CVSS scores are backed by authoritative source records.
   - **Honest Absence Reporting**: If an advisory is absent or an upstream network call times out, Sentinel labels the status honestly—a missing advisory is **never** presented as proof that a component is safe.
3. **Plausible Attack Path Modeling**:
   - Traces execution lineages from application root components down through direct dependencies to transitive packages.
   - Computes blast radius based on real dependent graph ancestors.
   - Explains why an attack path is plausible (scope, reachability, vulnerability class) and never labels a dependency relationship as an exploitable path without supporting evidence.
4. **Tri-Part Evidence Decomposition**:
   - Every finding is decomposed into:
     - 🟢 **Observed Facts**: Exact version parsed from lockfile, manifest file path and line number, upstream CVE/GHSA reference.
     - 🟡 **Inferred Risks**: Reachability likelihood based on dependency scope (production vs development), potential attack surface, blast radius.
     - ⚪ **Unknowns & Boundaries**: Statically unobservable runtime execution paths, input validation proxies, undeclared 0-days.
5. **Safe Remediation with Breaking Change Assessment**:
   - Suggests candidate upgrade versions **only** when supported by verified advisory `fixedVersion` data.
   - Evaluates SemVer compatibility risk (Patch = Low Risk, Minor = Moderate, Major = High/Breaking).
   - Generates unified code diffs for review.
   - **Zero Automatic Mutation**: Sentinel never modifies user files or repositories automatically without explicit export.
6. **SSRF & Private Network Defense**:
   - Enforces strict domain allowlists (`github.com`, `api.github.com`, `raw.githubusercontent.com`).
   - Intercepts redirects to block access to internal IP spaces (`127.0.0.1`, `169.254.169.254`), cloud metadata endpoints, and non-standard ports.
   - Enforces a 2MB maximum response limit to prevent memory exhaustion attacks.

---

## 🚀 The 6 Connected Workstation Experiences

| Experience | Route | Primary Capabilities |
|---|---|---|
| **A. Overview** | `/` | Executive security summary, Posture Score (0–100), exposure & remediation metrics, findings catalog grouped by severity, quick benchmarks. |
| **B. Repository Analysis** | `/analyze` | Dual-mode input: direct manifest upload/paste (`package.json`, `package-lock.json`), public GitHub repository URLs, and pre-configured benchmark fixtures with real-time JSON validation. |
| **C. Dependency Attack Graph** | `/graph` | Large interactive SVG/Canvas dependency graph visually distinguishing root components, direct dependencies, transitive packages, and vulnerable nodes with an evidence panel and 3D WebGL orbit toggle. |
| **D. Investigation Workspace** | `/investigate` | Deep-dive evidence workspace presenting the **Tri-Part Evidence Model** (Observed Facts, Inferred Risks, Unknowns), lineage breadcrumbs, blast radius, and actionable checklists. |
| **E. Remediation Center** | `/remediation` | Candidate version upgrades with SemVer breaking change risk evaluation, proposed package diffs, and a side-by-side GitHub Actions AST fix verification simulator. |
| **F. Reports** | `/reports` | Downloadable audit reports (Markdown, Full JSON, CycloneDX v1.5 SBOM, Printable HTML) with mandatory dataset classification labeling (**Controlled Demonstration Fixture** vs **Live Repository Audit**). |

---

## 🛠️ Quick Start

### Prerequisites
- Node.js >= 18 (Tested on Node.js v20 & v26)
- npm >= 9

### Installation
```bash
# Clone and enter the repository
cd SUPPLY-CHAIN-SENTINEL

# Install dependencies
npm install
```

### Running Locally (Development Mode)
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser to launch the Sentinel 2.0 Workstation.

### Running Production Build
```bash
npm run build
npm start
```

### Running the Test Suite
The repository includes a 113-test Vitest test suite covering manifest parsing, dependency graph traversal, blast radius calculations, tri-part evidence decomposition, SemVer breaking risk scoring, Actions AST rules, SSRF defense, report generation, and adversarial edge cases:
```bash
npm test
```

---

## 🔬 Supported Inputs & Manifests

- **npm / Node.js**: `package.json`, `package-lock.json` (v1, v2, and v3 formats)
- **Yarn**: `yarn.lock` (v1 and Berry)
- **pnpm**: `pnpm-lock.yaml`
- **Python**: `requirements.txt`, `Pipfile`, `Pipfile.lock`, `poetry.lock`, `pyproject.toml`
- **Rust**: `Cargo.toml`, `Cargo.lock`
- **Go**: `go.mod`, `go.sum`
- **PHP**: `composer.json`, `composer.lock`
- **Ruby**: `Gemfile`, `Gemfile.lock`
- **Java**: `pom.xml` (Maven)
- **.NET**: `packages.lock.json`, `*.csproj`
- **GitHub Actions Workflows**: `.github/workflows/*.yml` (Rules: `GHA-001` through `GHA-006`)

---

## 📊 Technical Limitations

1. **Lockfile Integrity**: Without a lockfile (`package-lock.json`), exact installed versions cannot be guaranteed in production; findings are honestly classified as `VERSION_UNVERIFIED`.
2. **Runtime Execution Bounds**: Static dependency graph analysis proves declared and resolved lineages, but cannot verify whether specific vulnerable functions are invoked at runtime without dynamic execution instrumentation.
3. **Commit Pinning Caveat**: Pinning an Action to a 40-character commit SHA prevents mutable tag-hijacking, but does not prove whether the commit itself contains malicious code.
4. **GitHub Unauthenticated Rate Limits**: Unauthenticated GitHub API calls are limited to 60 requests/hour by GitHub. Users may optionally supply a client-side Personal Access Token to expand the threshold to 5,000 requests/hour.

---

## 📁 Repository Structure

```
├── src/
│   ├── app/
│   │   ├── page.tsx               # Overview & Executive Posture
│   │   ├── analyze/page.tsx       # Manifest Upload & Ingestion
│   │   ├── graph/page.tsx         # Dependency Attack Graph (2D & 3D)
│   │   ├── investigate/page.tsx   # Tri-Part Evidence Workspace
│   │   ├── remediation/page.tsx   # Safe Remediation & Diff Studio
│   │   ├── reports/page.tsx       # Downloadable Audit Reports
│   │   ├── telemetry/page.tsx     # System Health & OSV Connectivity
│   │   ├── coverage/page.tsx      # Ecosystem Matrix
│   │   ├── layout.tsx             # Midnight root layout & ScanProvider
│   │   └── api/
│   │       ├── scan/route.ts      # Multi-mode repository & manifest scanner
│   │       ├── verify/route.ts    # Deterministic fix verification API
│   │       ├── export/route.ts    # Multi-format report export API
│   │       ├── fixtures/route.ts  # Benchmark test fixtures loader
│   │       └── health/route.ts    # Upstream OSV and SSRF health check
│   ├── components/
│   │   ├── WorkstationNav.tsx     # Workstation navigation header & status chip
│   │   ├── FindingDetailModal.tsx # Evidence modal with tri-part decomposition
│   │   ├── Sentinel3DScene.tsx    # Three.js 3D spatial orbit visualization
│   │   └── ...                    # Reusable UI controls
│   ├── lib/
│   │   ├── graph.ts               # Lineage graph & attack path engine
│   │   ├── investigation.ts       # Tri-part evidence decomposition engine
│   │   ├── remediation.ts         # SemVer risk assessment & diff generator
│   │   ├── reports.ts             # Markdown, JSON & HTML report engine
│   │   ├── validation.ts          # Client-safe JSON validator
│   │   ├── manifest-scanner.ts    # Direct manifest upload analysis pipeline
│   │   ├── scanner.ts             # Repository scan orchestrator
│   │   ├── verifier.ts            # Deterministic AST & dependency verifier
│   │   ├── actions/               # GitHub Actions AST rules (GHA-001 - GHA-006)
│   │   ├── manifests/             # Multi-ecosystem lockfile parsers
│   │   ├── osv/                   # Google OSV batch client & SemVer comparator
│   │   └── context/
│   │       └── ScanContext.tsx    # Unified client-side scan state provider
│   └── tests/                     # 95 Vitest unit tests across 13 test files
```
