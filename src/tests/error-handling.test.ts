import { describe, it, expect, vi, beforeEach } from 'vitest';
import { queryOsvForPackages } from '../lib/osv/client';
import { fetchRepoMetadata, fetchRawFile } from '../lib/github';
import { parseManifest } from '../lib/manifests';
import { DependencyPackage } from '../lib/types';

describe('Error Handling, Missing Data & Network Failures', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('handles missing manifest files gracefully', () => {
    const parsed = parseManifest('non-existent.txt', '');
    expect(parsed).toBeNull();
  });

  it('handles empty package.json without crashing', () => {
    const parsed = parseManifest('package.json', '{}');
    expect(parsed).not.toBeNull();
    expect(parsed?.packages.length).toBe(0);
    expect(parsed?.parseErrors.length).toBe(0);
  });

  it('handles corrupt JSON in package-lock.json with explicit parseErrors', () => {
    const parsed = parseManifest('package-lock.json', '{ "incomplete": ');
    expect(parsed).not.toBeNull();
    expect(parsed?.parseErrors.length).toBeGreaterThan(0);
    expect(parsed?.parseErrors[0]).toContain('Failed to parse package-lock.json');
  });

  it('handles OSV API 500 server error without giving false clean bill of health', async () => {
    const mockPackages: DependencyPackage[] = [
      {
        name: 'test-pkg',
        version: '1.0.0',
        ecosystem: 'npm',
        isDirect: true,
        manifestPath: 'package.json',
      },
    ];

    // Mock fetch to simulate 500 Internal Server Error
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      })
    );

    const result = await queryOsvForPackages(mockPackages, 'test/repo');
    expect(result.apiSuccess).toBe(false);
    expect(result.errorMessage).toContain('HTTP status 500');
    expect(result.findings.length).toBe(0);
  });

  it('handles OSV network timeout/exception gracefully', async () => {
    const mockPackages: DependencyPackage[] = [
      {
        name: 'test-pkg',
        version: '1.0.0',
        ecosystem: 'npm',
        isDirect: true,
        manifestPath: 'package.json',
      },
    ];

    // Mock fetch to simulate network failure (e.g. DNS failure or timeout)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND api.osv.dev'))
    );

    const result = await queryOsvForPackages(mockPackages, 'test/repo');
    expect(result.apiSuccess).toBe(false);
    expect(result.errorMessage).toContain('Failed to connect to OSV API');
  });

  it('handles GitHub 404 for non-existent repository', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers(),
      })
    );

    const result = await fetchRepoMetadata('ghost-user', 'non-existent-repo');
    expect(result.metadata).toBeUndefined();
    expect(result.error).toContain('was not found');
  });

  it('handles GitHub 403 rate limit response with reset time parsing', async () => {
    const headers = new Headers();
    headers.set('x-ratelimit-remaining', '0');
    headers.set('x-ratelimit-reset', '1700000000');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        headers,
      })
    );

    const result = await fetchRepoMetadata('busy-user', 'busy-repo');
    expect(result.metadata).toBeUndefined();
    expect(result.rateLimitRemaining).toBe(0);
    expect(result.error).toContain('rate limit exceeded');
  });

  it('handles OSV query abort timeout explicitly with descriptive error', async () => {
    const mockPackages: DependencyPackage[] = [
      {
        name: 'test-pkg',
        version: '1.0.0',
        ecosystem: 'npm',
        isDirect: true,
        manifestPath: 'package.json',
      },
    ];

    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

    const result = await queryOsvForPackages(mockPackages, 'test/repo', undefined, 50);
    expect(result.apiSuccess).toBe(false);
    expect(result.errorMessage).toContain('timed out after 50ms');
  });

  it('flags isAnalysisIncomplete and includes honest warning when OSV fails during scan', async () => {
    const { runSupplyChainScan } = await import('../lib/scanner');

    // Mock fetch for OSV to fail with 500 error
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers(),
      })
    );

    const result = await runSupplyChainScan('demo', undefined, true);
    expect(result.isAnalysisIncomplete).toBe(true);
    expect(result.warnings.some((w) => w.includes('0 confirmed vulnerabilities does NOT prove'))).toBe(true);
  });

  it('handles malformed YAML in GitHub Actions workflows with malformed_config finding', async () => {
    const { inspectWorkflow } = await import('../lib/actions/engine');
    const badYaml = 'name: Bad CI\njobs:\n  test:\n    runs-on: [unterminated';
    const result = inspectWorkflow(badYaml, '.github/workflows/bad.yml', 'org/repo');

    expect(result.isValidYaml).toBe(false);
    expect(result.findings.length).toBeGreaterThan(0);
    const finding = result.findings[0];
    expect(finding.category).toBe('malformed_config');
    expect(finding.severity).toBe('high');
    expect(finding.title).toContain('YAML Syntax Error');
  });

  it('handles repository with no supported manifests gracefully', async () => {
    const { runSupplyChainScan } = await import('../lib/scanner');

    // Mock GitHub to return 404 for all files and empty workflows
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('api.github.com/repos/org/empty-repo/contents/.github/workflows')) {
          return Promise.resolve({ ok: false, status: 404, headers: new Headers() });
        }
        if (url.includes('api.github.com/repos/org/empty-repo')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              name: 'empty-repo',
              full_name: 'org/empty-repo',
              default_branch: 'main',
              owner: { login: 'org' },
            }),
            headers: new Headers({ 'x-ratelimit-remaining': '60' }),
          });
        }
        // 404 for raw files
        return Promise.resolve({ ok: false, status: 404, headers: new Headers() });
      })
    );

    const scan = await runSupplyChainScan('org/empty-repo');
    expect(scan.stats.dependenciesScanned).toBe(0);
    expect(scan.stats.workflowsScanned).toBe(0);
    expect(scan.stats.totalFindings).toBe(0);
    expect(scan.errors.length).toBe(0);
  });
});

