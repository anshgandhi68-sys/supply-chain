# Supply Chain Sentinel 🛡️

**Supply Chain Sentinel** is a software supply-chain security investigation platform designed to analyze public GitHub repositories for dependency vulnerabilities and risky GitHub Actions configurations, present evidence-backed findings, and deterministically verify whether a proposed fix resolves a finding.

---

## ⚡ Core Security Architecture & Guarantees

1. **Zero Code Execution**:
   - The scanner operates in a read-only analysis sandbox. It inspects YAML AST, lockfiles, and package manifests **strictly as data**.
   - It **never downloads or executes untrusted packages** from npm, PyPI, or Go, and never executes workflow shell scripts.
2. **Real Upstream Security Advisories (Google OSV API)**:
   - Integrates directly with Google's OSV database (`api.osv.dev`) matching exact resolved package versions and ecosystems (`npm`, `PyPI`, `Go`).
   - Advisories, CVEs, GHSAs, and CVSS scores are backed by source records.
   - If a network check fails, an **unknown or error status** is displayed — never a false clean bill of health.
3. **Deterministic GitHub Actions Rules**:
   - Analyzes `.github/workflows/*.yml` with line and column tracking using an AST parser.
   - Rules:
     - `GHA-001`: Unpinned Third-Party Action References (mutable tags/branches vs. 40-character commit SHAs).
     - `GHA-002`: Overly Permissive Workflow Permissions (`permissions: write-all`).
     - `GHA-003`: Dangerous `pull_request_target` with Untrusted Code Checkout.
     - `GHA-004`: Script Injection via Untrusted GitHub Context (`${{ github.event.issue.title }}`).
     - `GHA-005`: Unverified Remote Script Execution (Pipe to Shell `curl | bash`).
     - `GHA-006`: Missing Explicit Workflow Permissions Declaration.
4. **Secret Redaction**:
   - All evidence excerpts undergo automatic credential masking (GitHub classic PATs, fine-grained PATs, AWS keys, bearer tokens, private keys).
5. **Safe Simulated Fix Verification**:
   - Evaluates proposed remediations by re-running deterministic detection rules on before-and-after configurations.
   - Re-runs the exact same engine to confirm resolution.
   - Uses verified full-length 40-character commit SHA placeholders (e.g., `# v3.5.2 (verified SHA placeholder)`) clearly documented until production release.
6. **SSRF and Redirect Defense**:
   - Enforces strict GitHub domain allowlisting (`github.com`, `api.github.com`, `raw.githubusercontent.com`, `codeload.github.com`).
   - Manually intercepts HTTP redirects (`safeGitHubFetch`) to prevent redirection to internal IPs (`127.0.0.1`, `169.254.169.254`), cloud metadata, or unapproved external domains.
   - Rejects URLs with embedded credentials and non-standard ports.
   - Enforces a 2MB maximum response size limit to protect against memory exhaustion from untrusted remote repositories.
7. **Timeout Guarantees & Honest Incomplete Scan Reporting**:
   - All upstream OSV and GitHub API calls operate with strict timeouts (10s via `AbortController`).
   - Unresolved manifests, unsupported package managers (`Cargo.toml`, `Pipfile`, etc.), and failed API queries are labeled honestly as incomplete analyses — preventing false claims of security.

---

## 🚀 Quick Start

### Prerequisites
- Node.js >= 18 (Tested on Node.js v26)
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
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Running Production Build
```bash
npm run build
npm start
```

### Running the Test Suite
The project includes a comprehensive 43-test unit test suite covering input validation, SSRF redirect defense, OSV timeouts and explicit error handling, secret redaction, manifest parsing, Actions AST rules, error handling, and deterministic before-and-after fix verification across all fixtures:
```bash
npm test
```

---

## 🔬 Testing Scenarios & Fixtures

The application includes controlled test fixtures in `src/fixtures/`:

| Fixture | File | Purpose |
|---|---|---|
| **Risky Workflow** | `risky-workflow.yml` | Demonstrates `pull_request_target` untrusted checkout, `permissions: write-all`, unpinned actions (`@v3`), and direct context interpolation. |
| **Corrected Workflow** | `corrected-workflow.yml` | Demonstrates least privilege (`permissions: contents: read`), full 40-character commit SHA pinning, and environment variable sanitization. |
| **Clean Production** | `clean-workflow.yml` | Conforms to all Sentinel standards; yields 0 findings. |
| **Malformed YAML** | `malformed-workflow.yml` | Tests syntax error handling without crashing. |
| **Vulnerable Lockfile** | `sample-package-lock.json` | Contains pinned packages (`lodash: 4.17.20`, `axios: 0.21.1`) matching real OSV advisories (`CVE-2021-23337`, `CVE-2020-28168`). |

### Testing in the Dashboard
1. Click **"⚡ Controlled Risky Demo"** on the dashboard search bar.
2. View **36+ evidence-backed findings** spanning confirmed OSV vulnerabilities and GitHub Actions execution hazards.
3. Click any finding to inspect redacted code excerpts, severity rationales, and recommended next steps.
4. Click **"Fix Verification Studio"** to see side-by-side comparison and click **"Re-run Deterministic Rules"** to observe `VERIFIED RESOLVED` proof.

---

## 📊 Technical Limitations

- **Action Pinning Caveat**: Pinning an action to a commit SHA guarantees immutability against tag retagging, but does not prove whether the commit itself contains malicious code.
- **Lockfile Resolution**: When analyzing repositories containing only `package.json` without a lockfile, exact installed versions cannot be proven, and findings are categorized accordingly.
- **GitHub API Rate Limits**: Unauthenticated requests to GitHub are capped at 60 requests/hour by GitHub. Users may optionally supply a client-side Personal Access Token to raise the limit to 5,000 requests/hour.
- **Private Repositories**: This MVP is intentionally scoped to public repositories without requiring credentials or write permissions.

---

## 📁 Project Structure

```
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── fixtures/route.ts    # Test fixture loader endpoint
│   │   │   ├── scan/route.ts        # Safe read-only repo scanning API
│   │   │   └── verify/route.ts      # Deterministic fix verification API
│   │   ├── layout.tsx               # Cyber dark root layout
│   │   ├── page.tsx                 # Sentinel dashboard
│   │   └── globals.css              # Cyber styling & glassmorphism
│   ├── components/
│   │   ├── Header.tsx               # Top navigation & system status
│   │   ├── RepoInput.tsx            # Validating GitHub repo search bar
│   │   ├── ScanOverview.tsx         # Severity metrics & classification breakdown
│   │   ├── FindingsList.tsx         # Filterable finding cards
│   │   ├── FindingDetailModal.tsx   # Evidence viewer with redacted secrets
│   │   ├── EvidenceGraph.tsx        # Evidence relationship topology
│   │   ├── FixStudioModal.tsx       # Safe simulated fix verification studio
│   │   └── IncidentTimeline.tsx     # Chronological audit timeline
│   ├── fixtures/
│   │   ├── risky-workflow.yml       # Controlled risky workflow fixture
│   │   ├── corrected-workflow.yml   # Remediated workflow fixture
│   │   ├── clean-workflow.yml       # Zero-violation compliant workflow
│   │   └── sample-package-lock.json # Vulnerable dependency fixture
│   ├── lib/
│   │   ├── actions/                 # GitHub Actions AST engine & rules
│   │   ├── manifests/               # Lockfile & manifest parsers
│   │   ├── osv/                     # Google OSV batch API client
│   │   ├── github.ts                # GitHub URL validator & read-only fetcher
│   │   ├── redaction.ts             # Secret sanitization utility
│   │   ├── scanner.ts               # Scan orchestrator
│   │   └── verifier.ts              # Fix verification logic
│   └── tests/                       # Vitest test suite (29 tests)
```
