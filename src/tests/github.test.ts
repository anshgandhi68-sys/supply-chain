import { describe, it, expect } from 'vitest';
import { parseAndValidateGitHubUrl } from '../lib/github';

describe('GitHub URL Validation & Sanitization', () => {
  it('accepts standard public repository URLs', () => {
    const res = parseAndValidateGitHubUrl('https://github.com/torvalds/linux');
    expect(res.isValid).toBe(true);
    expect(res.owner).toBe('torvalds');
    expect(res.repo).toBe('linux');
  });

  it('accepts URLs with .git suffix', () => {
    const res = parseAndValidateGitHubUrl('https://github.com/facebook/react.git');
    expect(res.isValid).toBe(true);
    expect(res.owner).toBe('facebook');
    expect(res.repo).toBe('react');
  });

  it('accepts owner/repo shorthand notation', () => {
    const res = parseAndValidateGitHubUrl('vercel/next.js');
    expect(res.isValid).toBe(true);
    expect(res.owner).toBe('vercel');
    expect(res.repo).toBe('next.js');
  });

  it('rejects non-github hosts (GitLab, Bitbucket, arbitrary websites)', () => {
    const res1 = parseAndValidateGitHubUrl('https://gitlab.com/owner/repo');
    expect(res1.isValid).toBe(false);
    expect(res1.error).toContain('Only public repositories on github.com are permitted');

    const res2 = parseAndValidateGitHubUrl('https://evil-site.com/exploit');
    expect(res2.isValid).toBe(false);
  });

  it('rejects SSRF attempts and local/private addresses', () => {
    const res1 = parseAndValidateGitHubUrl('http://127.0.0.1/owner/repo');
    expect(res1.isValid).toBe(false);

    const res2 = parseAndValidateGitHubUrl('http://localhost:3000');
    expect(res2.isValid).toBe(false);

    const res3 = parseAndValidateGitHubUrl('file:///etc/passwd');
    expect(res3.isValid).toBe(false);
  });

  it('rejects path traversal and invalid character patterns', () => {
    const res1 = parseAndValidateGitHubUrl('https://github.com/../passwd');
    expect(res1.isValid).toBe(false);

    const res2 = parseAndValidateGitHubUrl('https://github.com/owner');
    expect(res2.isValid).toBe(false);
    expect(res2.error).toContain('must contain both owner and repository name');
  });

  it('rejects URLs with embedded credentials to prevent credential abuse', () => {
    const res = parseAndValidateGitHubUrl('https://user:password@github.com/owner/repo');
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('embedded credentials');
  });

  it('rejects custom non-standard ports to prevent port-scanning SSRF', () => {
    const res = parseAndValidateGitHubUrl('https://github.com:8443/owner/repo');
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('Custom port');
  });

  it('rejects disallowed protocols (ftp, file, javascript)', () => {
    const res1 = parseAndValidateGitHubUrl('ftp://github.com/owner/repo');
    expect(res1.isValid).toBe(false);
    expect(res1.error).toContain('Only HTTPS GitHub URLs are allowed');
  });
});

describe('SSRF Protection & Safe Fetch Client', () => {
  it('validates approved GitHub hosts correctly', async () => {
    const { isApprovedGitHubHost } = await import('../lib/github');
    expect(isApprovedGitHubHost('github.com')).toBe(true);
    expect(isApprovedGitHubHost('api.github.com')).toBe(true);
    expect(isApprovedGitHubHost('raw.githubusercontent.com')).toBe(true);
    expect(isApprovedGitHubHost('codeload.github.com')).toBe(true);

    // Rejects IP addresses and arbitrary hosts
    expect(isApprovedGitHubHost('127.0.0.1')).toBe(false);
    expect(isApprovedGitHubHost('169.254.169.254')).toBe(false);
    expect(isApprovedGitHubHost('localhost')).toBe(false);
    expect(isApprovedGitHubHost('attacker.com')).toBe(false);
    expect(isApprovedGitHubHost('github.com.attacker.com')).toBe(false);
  });

  it('safeGitHubFetch blocks initial requests to unapproved hosts', async () => {
    const { safeGitHubFetch } = await import('../lib/github');
    await expect(safeGitHubFetch('https://evil-server.internal/api')).rejects.toThrow(
      'SSRF Blocked: Host \'evil-server.internal\' is not in approved GitHub domains allowlist.'
    );
  });

  it('safeGitHubFetch blocks redirects to unapproved hosts (SSRF redirect defense)', async () => {
    const { safeGitHubFetch } = await import('../lib/github');
    const { vi } = await import('vitest');

    // Simulate response redirecting to AWS metadata service
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 302,
        headers: new Headers({
          location: 'http://169.254.169.254/latest/meta-data/',
        }),
      })
    );

    await expect(safeGitHubFetch('https://api.github.com/repos/test/repo')).rejects.toThrow(
      'SSRF Blocked: Prevented redirect from \'api.github.com\' to unapproved host \'169.254.169.254\'.'
    );
    vi.restoreAllMocks();
  });

  it('safeGitHubFetch blocks responses exceeding maximum file size limit', async () => {
    const { safeGitHubFetch } = await import('../lib/github');
    const { vi } = await import('vitest');

    // Simulate oversized file (3MB > 2MB limit)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        headers: new Headers({
          'content-length': String(3 * 1024 * 1024),
        }),
      })
    );

    await expect(safeGitHubFetch('https://raw.githubusercontent.com/test/repo/main/large.json')).rejects.toThrow(
      'Response size'
    );
    vi.restoreAllMocks();
  });

  it('parses branch, tag, and subdirectory paths accurately from GitHub URLs', () => {
    const res1 = parseAndValidateGitHubUrl('https://github.com/facebook/react/tree/main/packages/react');
    expect(res1.isValid).toBe(true);
    expect(res1.owner).toBe('facebook');
    expect(res1.repo).toBe('react');
    expect(res1.ref).toBe('main');
    expect(res1.subdirectory).toBe('packages/react');

    const res2 = parseAndValidateGitHubUrl('https://github.com/facebook/react/tree/v18.2.0/scripts/jest');
    expect(res2.isValid).toBe(true);
    expect(res2.ref).toBe('v18.2.0');
    expect(res2.subdirectory).toBe('scripts/jest');

    const res3 = parseAndValidateGitHubUrl('https://github.com/facebook/react/commit/a1b2c3d4e5f6');
    expect(res3.isValid).toBe(true);
    expect(res3.ref).toBe('a1b2c3d4e5f6');
  });

  it('fetchRepoTree correctly returns discovered files and filters by subdirectory', async () => {
    const { fetchRepoTree } = await import('../lib/github');
    const { vi } = await import('vitest');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'x-ratelimit-remaining': '55' }),
        json: async () => ({
          truncated: false,
          tree: [
            { path: 'package.json', type: 'blob', size: 100 },
            { path: 'packages/core/package.json', type: 'blob', size: 200 },
            { path: 'packages/core/Cargo.toml', type: 'blob', size: 150 },
            { path: 'docs/readme.md', type: 'blob', size: 50 },
            { path: 'packages', type: 'tree' },
          ],
        }),
      })
    );

    const fullTree = await fetchRepoTree('org', 'repo', 'main');
    expect(fullTree.tree.length).toBe(4); // Only blobs
    expect(fullTree.truncated).toBe(false);

    const subTree = await fetchRepoTree('org', 'repo', 'main', undefined, 'packages/core');
    expect(subTree.tree.length).toBe(2);
    expect(subTree.tree[0].path).toBe('packages/core/package.json');
    expect(subTree.tree[1].path).toBe('packages/core/Cargo.toml');

    vi.restoreAllMocks();
  });
});

