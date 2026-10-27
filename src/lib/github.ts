/**
 * GitHub Safe Read-Only Client
 * Validates URLs and retrieves dependency manifests and workflows without executing any code.
 * Implements tree-based acquisition, commit SHA resolution, monorepo/subdirectory routing,
 * and an in-memory commit cache for rate-limit preservation.
 */

import { RepositoryMetadata, WorkflowFile, DiscoveredFile } from './types';

export interface ParsedGitHubUrl {
  owner: string;
  repo: string;
  ref?: string;
  subdirectory?: string;
  isValid: boolean;
  error?: string;
}

export interface TreeFetchResult {
  tree: DiscoveredFile[];
  truncated: boolean;
  rateLimitRemaining?: number;
  resolvedSha?: string;
  error?: string;
}

/**
 * Approved GitHub hosts for read-only access.
 * Any redirect or request to hosts outside this list is strictly blocked to prevent SSRF.
 */
export const ALLOWED_GITHUB_HOSTS = new Set([
  'github.com',
  'www.github.com',
  'api.github.com',
  'raw.githubusercontent.com',
  'codeload.github.com',
]);

/**
 * Validates whether a given hostname is an approved, safe GitHub domain.
 * Blocks IP addresses (IPv4, IPv6), localhost, internal cloud metadata, and arbitrary external domains.
 */
export function isApprovedGitHubHost(hostname: string): boolean {
  if (!hostname || typeof hostname !== 'string') return false;
  let lower = hostname.toLowerCase().trim();

  // Strip enclosing brackets for IPv6 notation e.g. [::1]
  if (lower.startsWith('[') && lower.endsWith(']')) {
    lower = lower.slice(1, -1);
  }

  // Explicit check against IP addresses:
  // - Standard IPv4 dotted decimal (e.g. 127.0.0.1, 169.254.169.254)
  // - IPv6 notation (contains colons)
  // - Pure numeric decimal dword (e.g. 2130706433)
  // - Hexadecimal IP representations (e.g. 0x7f000001)
  // - Octal IP representations (e.g. 017700000001)
  if (
    /^(\d{1,3}\.){3}\d{1,3}$/.test(lower) ||
    lower.includes(':') ||
    /^\d+$/.test(lower) ||
    /^0x[0-9a-f]+$/i.test(lower) ||
    /^0[0-7]+$/.test(lower)
  ) {
    return false;
  }

  return ALLOWED_GITHUB_HOSTS.has(lower);
}

/**
 * Maximum permitted raw file response size (2MB) to prevent memory exhaustion from untrusted content
 */
export const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;

/**
 * In-memory LRU-style cache for immutable commit contents and tree queries.
 * Prevents redundant GitHub API requests and protects API rate limits.
 */
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const responseCache = new Map<string, CacheEntry<unknown>>();

function getFromCache<T>(key: string): T | undefined {
  const entry = responseCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    responseCache.delete(key);
    return undefined;
  }
  return entry.data as T;
}

function setInCache<T>(key: string, data: T): void {
  // Bounded cache size: prune oldest when exceeding 500 entries
  if (responseCache.size > 500) {
    const firstKey = responseCache.keys().next().value;
    if (firstKey) responseCache.delete(firstKey);
  }
  responseCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * Validates and extracts owner, repository name, optional ref, and optional subdirectory from a user-supplied URL.
 * Only allows github.com hosts. Rejects malformed, localhost, file://, SSRF attempts,
 * URLs with embedded credentials, and custom ports.
 */
export function parseAndValidateGitHubUrl(rawInput: string): ParsedGitHubUrl {
  if (!rawInput || typeof rawInput !== 'string') {
    return { owner: '', repo: '', isValid: false, error: 'URL cannot be empty' };
  }

  const trimmed = rawInput.trim();

  // Allow "owner/repo" shorthand or full URL
  let urlToTest = trimmed;
  if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(trimmed)) {
    urlToTest = `https://github.com/${trimmed}`;
  } else if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    if (trimmed.includes('://')) {
      return {
        owner: '',
        repo: '',
        isValid: false,
        error: 'Only HTTPS GitHub URLs are allowed. Disallowed protocol.',
      };
    }
    urlToTest = `https://${trimmed}`;
  }

  try {
    const parsed = new URL(urlToTest);

    // Enforce protocol
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return {
        owner: '',
        repo: '',
        isValid: false,
        error: `Protocol '${parsed.protocol}' is not permitted. Only HTTPS GitHub URLs are allowed.`,
      };
    }

    // Disallow credentials in URL
    if (parsed.username || parsed.password) {
      return {
        owner: '',
        repo: '',
        isValid: false,
        error: 'URLs containing embedded credentials (user:password@) are rejected.',
      };
    }

    // Disallow non-standard ports to prevent port scanning SSRF
    if (parsed.port && parsed.port !== '443' && parsed.port !== '80') {
      return {
        owner: '',
        repo: '',
        isValid: false,
        error: `Custom port '${parsed.port}' is not permitted.`,
      };
    }

    // Strict hostname check - strictly github.com or www.github.com
    const hostname = parsed.hostname.toLowerCase();
    if (hostname !== 'github.com' && hostname !== 'www.github.com') {
      return {
        owner: '',
        repo: '',
        isValid: false,
        error: `Only public repositories on github.com are permitted. Host '${hostname}' is rejected.`,
      };
    }

    // Path segments: /owner/repo[/tree/<ref>/<subpath...>] or /owner/repo[/commit/<sha>]
    const rawSegments = parsed.pathname
      .split('/')
      .filter((s) => s.length > 0);

    if (rawSegments.length < 2) {
      return {
        owner: '',
        repo: '',
        isValid: false,
        error: 'URL must contain both owner and repository name (e.g., https://github.com/owner/repo)',
      };
    }

    const owner = rawSegments[0];
    const repo = rawSegments[1].replace(/\.git$/i, '');

    // Validate characters to prevent path traversal or injection
    const validIdentifier = /^[a-zA-Z0-9_.-]+$/;
    if (!validIdentifier.test(owner) || !validIdentifier.test(repo)) {
      return {
        owner: '',
        repo: '',
        isValid: false,
        error: 'Repository or owner contains invalid characters.',
      };
    }

    if (owner === '.' || owner === '..' || repo === '.' || repo === '..') {
      return {
        owner: '',
        repo: '',
        isValid: false,
        error: 'Invalid repository path.',
      };
    }

    let ref: string | undefined;
    let subdirectory: string | undefined;

    // Parse /tree/<ref>/<subpath> or /blob/<ref>/<subpath> or /commit/<sha>
    if (rawSegments.length >= 4 && (rawSegments[2] === 'tree' || rawSegments[2] === 'blob')) {
      ref = rawSegments[3];
      if (rawSegments.length > 4) {
        subdirectory = rawSegments.slice(4).join('/');
      }
    } else if (rawSegments.length >= 4 && rawSegments[2] === 'commit') {
      ref = rawSegments[3];
    }

    return {
      owner,
      repo,
      ref,
      subdirectory,
      isValid: true,
    };
  } catch {
    return {
      owner: '',
      repo: '',
      isValid: false,
      error: 'Invalid URL format.',
    };
  }
}

/**
 * SSRF-Safe Fetch Client
 * Intercepts all redirects manually and verifies that redirect targets remain strictly within
 * the approved GitHub host allowlist. Rejects redirects to local, internal, or arbitrary external endpoints.
 * Enforces timeout and maximum response content-length size limits.
 */
export async function safeGitHubFetch(
  targetUrl: string,
  init?: RequestInit,
  maxRedirects: number = 3,
  timeoutMs: number = 10000
): Promise<Response> {
  const parsed = new URL(targetUrl);

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`SSRF Blocked: Disallowed protocol '${parsed.protocol}'. Only HTTPS/HTTP permitted.`);
  }

  if (!isApprovedGitHubHost(parsed.hostname)) {
    throw new Error(`SSRF Blocked: Host '${parsed.hostname}' is not in approved GitHub domains allowlist.`);
  }

  if (parsed.username || parsed.password) {
    throw new Error('SSRF Blocked: Credentials in URL are forbidden.');
  }

  if (parsed.port && parsed.port !== '443' && parsed.port !== '80') {
    throw new Error(`SSRF Blocked: Non-standard port '${parsed.port}' is forbidden.`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(targetUrl, {
      ...init,
      redirect: 'manual', // Never follow redirects automatically without host verification
      signal: init?.signal || controller.signal,
    });
    clearTimeout(timeoutId);

    // Handle manual redirect verification
    if (response.status >= 300 && response.status < 400) {
      if (maxRedirects <= 0) {
        throw new Error('Exceeded maximum permitted redirects (3).');
      }

      const location = response.headers.get('location');
      if (!location) {
        return response;
      }

      const redirectUrl = new URL(location, targetUrl);

      // Verify redirect target host
      if (!isApprovedGitHubHost(redirectUrl.hostname)) {
        throw new Error(
          `SSRF Blocked: Prevented redirect from '${parsed.hostname}' to unapproved host '${redirectUrl.hostname}'.`
        );
      }

      if (redirectUrl.protocol !== 'https:' && redirectUrl.protocol !== 'http:') {
        throw new Error(`SSRF Blocked: Disallowed redirect protocol '${redirectUrl.protocol}'.`);
      }

      if (redirectUrl.username || redirectUrl.password) {
        throw new Error('SSRF Blocked: Redirect URL contains credentials.');
      }

      return safeGitHubFetch(redirectUrl.toString(), init, maxRedirects - 1, timeoutMs);
    }

    // Verify response size limits against denial of service
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_FILE_SIZE_BYTES) {
      throw new Error(`Response size (${contentLength} bytes) exceeds safety limit of ${MAX_FILE_SIZE_BYTES} bytes.`);
    }

    return response;
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`GitHub request timed out after ${timeoutMs}ms.`);
    }
    throw err;
  }
}

/**
 * Fetch GitHub repository metadata, resolving default branch and commit SHA.
 */
export async function fetchRepoMetadata(
  owner: string,
  repo: string,
  token?: string,
  requestedRef?: string,
  subdirectory?: string
): Promise<{ metadata?: RepositoryMetadata; rateLimitRemaining?: number; error?: string }> {
  const cacheKey = `meta:${owner}/${repo}:${requestedRef || 'default'}`;
  const cached = getFromCache<RepositoryMetadata>(cacheKey);
  if (cached) {
    return { metadata: cached, rateLimitRemaining: cached.rateLimitRemaining };
  }

  const url = `https://api.github.com/repos/${owner}/${repo}`;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'SupplyChainSentinel/1.0',
  };

  if (token) {
    headers['Authorization'] = `token ${token}`;
  }

  try {
    const res = await safeGitHubFetch(url, { headers });

    const rateLimitHeader = res.headers.get('x-ratelimit-remaining');
    const rateLimitReset = res.headers.get('x-ratelimit-reset');
    const rateLimitRemaining = rateLimitHeader ? parseInt(rateLimitHeader, 10) : -1;

    if (res.status === 404) {
      return { error: `Repository '${owner}/${repo}' was not found on GitHub. Verify that it is public.` };
    }

    if (res.status === 403) {
      return {
        error: `GitHub API rate limit exceeded. Reset at: ${
          rateLimitReset ? new Date(parseInt(rateLimitReset, 10) * 1000).toLocaleTimeString() : 'unknown'
        }. Provide a GitHub Personal Access Token to increase quota.`,
        rateLimitRemaining: 0,
      };
    }

    if (!res.ok) {
      return { error: `GitHub API returned HTTP status ${res.status}: ${res.statusText}` };
    }

    const data = await res.json();
    const defaultBranch = data.default_branch || 'main';
    const activeRef = requestedRef || defaultBranch;

    const metadata: RepositoryMetadata = {
      owner: data.owner?.login || owner,
      repo: data.name || repo,
      fullName: data.full_name || `${owner}/${repo}`,
      defaultBranch,
      requestedRef,
      subdirectory,
      description: data.description || '',
      stars: data.stargazers_count || 0,
      isFork: data.fork,
      isArchived: data.archived,
      rateLimitRemaining: rateLimitRemaining >= 0 ? rateLimitRemaining : undefined,
      rateLimitReset: rateLimitReset ? new Date(parseInt(rateLimitReset, 10) * 1000).toISOString() : undefined,
    };

    // Resolve exact commit SHA for activeRef
    try {
      const commitRes = await safeGitHubFetch(
        `https://api.github.com/repos/${owner}/${repo}/commits/${activeRef}`,
        { headers }
      );
      if (commitRes.ok) {
        const commitData = await commitRes.json();
        const fullSha = commitData.sha || '';
        metadata.resolvedCommitSha = fullSha;
        metadata.latestCommitSha = fullSha.substring(0, 7);
      }
    } catch {
      // Non-fatal if commit fetch fails; fall back to activeRef
    }

    setInCache(cacheKey, metadata);
    return { metadata, rateLimitRemaining };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `Network error connecting to GitHub: ${msg}` };
  }
}

/**
 * Fetches the entire repository tree metadata using GitHub Git Trees API.
 * Discovers manifests, workflows, and configurations in a single recursive call.
 */
export async function fetchRepoTree(
  owner: string,
  repo: string,
  commitShaOrBranch: string,
  token?: string,
  subdirectory?: string
): Promise<TreeFetchResult> {
  const cacheKey = `tree:${owner}/${repo}@${commitShaOrBranch}:${subdirectory || 'root'}`;
  const cached = getFromCache<TreeFetchResult>(cacheKey);
  if (cached) return cached;

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'SupplyChainSentinel/1.0',
  };
  if (token) headers['Authorization'] = `token ${token}`;

  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${commitShaOrBranch}?recursive=1`;
    const res = await safeGitHubFetch(url, { headers });

    const rateLimitHeader = res.headers.get('x-ratelimit-remaining');
    const rateLimitRemaining = rateLimitHeader ? parseInt(rateLimitHeader, 10) : undefined;

    if (!res.ok) {
      if (res.status === 404 || res.status === 409) {
        // 409: Git Repository is empty
        return { tree: [], truncated: false, rateLimitRemaining };
      }
      return {
        tree: [],
        truncated: false,
        rateLimitRemaining,
        error: `GitHub Trees API returned HTTP ${res.status}`,
      };
    }

    const data = await res.json();
    const rawTree: Array<{ path: string; mode: string; type: string; sha: string; size?: number }> = data.tree || [];
    const isTruncated = Boolean(data.truncated);

    let tree: DiscoveredFile[] = rawTree
      .filter((item) => item.type === 'blob')
      .map((item) => ({
        path: item.path,
        size: item.size,
        sha: item.sha,
        type: 'blob' as const,
      }));

    if (subdirectory) {
      const normalizedSub = subdirectory.replace(/\/+$/, '') + '/';
      tree = tree.filter((item) => item.path.startsWith(normalizedSub));
    }

    const result: TreeFetchResult = {
      tree,
      truncated: isTruncated,
      rateLimitRemaining,
      resolvedSha: typeof data.sha === 'string' ? data.sha : undefined,
    };

    setInCache(cacheKey, result);
    return result;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { tree: [], truncated: false, error: `Failed to fetch repository tree: ${msg}` };
  }
}

/**
 * Safely fetches a raw file from GitHub repository
 */
export async function fetchRawFile(
  owner: string,
  repo: string,
  branchOrSha: string,
  path: string,
  token?: string
): Promise<{ content?: string; notFound?: boolean; error?: string }> {
  const cacheKey = `raw:${owner}/${repo}@${branchOrSha}:${path}`;
  const cached = getFromCache<string>(cacheKey);
  if (cached !== undefined) return { content: cached };

  // First try raw.githubusercontent.com which avoids API rate limits for raw text
  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branchOrSha}/${path}`;

  try {
    const rawRes = await safeGitHubFetch(rawUrl, {
      headers: {
        'User-Agent': 'SupplyChainSentinel/1.0',
        ...(token ? { Authorization: `token ${token}` } : {}),
      },
    });

    if (rawRes.status === 404) {
      return { notFound: true };
    }

    if (rawRes.ok) {
      const text = await rawRes.text();
      if (text.length > MAX_FILE_SIZE_BYTES) {
        return { error: `File content exceeds safety limit of ${MAX_FILE_SIZE_BYTES} bytes.` };
      }
      setInCache(cacheKey, text);
      return { content: text };
    }
  } catch {
    // Fall back to GitHub API
  }

  // Fallback to GitHub contents API
  try {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3.raw',
      'User-Agent': 'SupplyChainSentinel/1.0',
    };
    if (token) headers['Authorization'] = `token ${token}`;

    const apiRes = await safeGitHubFetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branchOrSha}`,
      { headers }
    );

    if (apiRes.status === 404) {
      return { notFound: true };
    }

    if (apiRes.status === 403) {
      return { error: 'Rate limit exceeded on GitHub API.' };
    }

    if (!apiRes.ok) {
      return { error: `Failed to fetch file ${path}: HTTP ${apiRes.status}` };
    }

    const text = await apiRes.text();
    if (text.length > MAX_FILE_SIZE_BYTES) {
      return { error: `File content exceeds safety limit of ${MAX_FILE_SIZE_BYTES} bytes.` };
    }
    setInCache(cacheKey, text);
    return { content: text };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `Network error fetching ${path}: ${msg}` };
  }
}

/**
 * Discovers and fetches workflow files located in .github/workflows
 */
export async function fetchWorkflows(
  owner: string,
  repo: string,
  branchOrSha: string,
  token?: string
): Promise<{ workflows: WorkflowFile[]; warnings: string[] }> {
  const workflows: WorkflowFile[] = [];
  const warnings: string[] = [];

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'SupplyChainSentinel/1.0',
  };
  if (token) headers['Authorization'] = `token ${token}`;

  try {
    const res = await safeGitHubFetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/.github/workflows?ref=${branchOrSha}`,
      { headers }
    );

    if (res.status === 404) {
      return { workflows: [], warnings: [] };
    }

    if (res.status === 403) {
      warnings.push('GitHub API rate limit reached while querying .github/workflows directory.');
      return { workflows: [], warnings };
    }

    if (!res.ok) {
      warnings.push(`Could not list .github/workflows directory: HTTP ${res.status}`);
      return { workflows: [], warnings };
    }

    const items = await res.json();
    if (!Array.isArray(items)) {
      return { workflows: [], warnings };
    }

    for (const item of items) {
      if (item.type === 'file' && (item.name.endsWith('.yml') || item.name.endsWith('.yaml'))) {
        const fileRes = await fetchRawFile(owner, repo, branchOrSha, item.path, token);
        if (fileRes.content) {
          workflows.push({
            path: item.path,
            content: fileRes.content,
            sha: item.sha,
          });
        }
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`Error discovering workflows: ${msg}`);
  }

  return { workflows, warnings };
}
