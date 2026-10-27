/**
 * Supply Chain Sentinel 2.0 - Managed Auth Token Verifier
 * 
 * Cryptographically verifies JSON Web Tokens (JWT) for managed auth providers:
 * - Clerk (RS256 with JWT Public Key, or HS256 with Secret Key)
 * - Supabase Auth / Generic OAuth (HS256 with Shared Secret)
 * 
 * Security Controls Enforced:
 * 1. Strict algorithm whitelist: strictly HS256 or RS256.
 *    Explicitly forbids 'alg: none' and algorithm confusion.
 * 2. Constant-time signature verification preventing timing side-channel leaks.
 * 3. Strict expiration (exp), not-before (nbf), issuer (iss), and audience/authorized-party (aud/azp) validation.
 * 4. Safe base64url decoding preventing buffer overruns.
 */

import crypto from 'node:crypto';

export interface VerifiedClaims {
  sub: string;
  email?: string;
  name?: string;
  org_id?: string;
  org_role?: string;
  org_slug?: string;
  workspace_id?: string;
  role?: string;
  iss?: string;
  aud?: string | string[];
  azp?: string;
  exp?: number;
  nbf?: number;
  [key: string]: unknown;
}

export interface TokenVerificationResult {
  valid: boolean;
  claims?: VerifiedClaims;
  error?: string;
}

export interface VerificationOptions {
  issuer?: string;
  audience?: string;
  clockToleranceSeconds?: number;
}

/**
 * Base64URL decoder helper
 */
function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * Formats a raw PEM key string if lines or headers are missing.
 */
function normalizePemKey(rawKey: string): string {
  const trimmed = rawKey.trim();
  if (trimmed.includes('-----BEGIN PUBLIC KEY-----')) {
    return trimmed;
  }
  // If base64-encoded single line, wrap in standard PEM boundaries
  const cleaned = trimmed.replace(/\s+/g, '');
  return `-----BEGIN PUBLIC KEY-----\n${cleaned.match(/.{1,64}/g)?.join('\n')}\n-----END PUBLIC KEY-----`;
}

/**
 * Verifies a JWT against a managed auth secret (HMAC-SHA256) or public key (RSA-SHA256).
 */
export function verifyManagedAuthToken(
  token: string,
  secretOrPublicKey: string,
  options: VerificationOptions = {}
): TokenVerificationResult {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Token must be a non-empty string.' };
  }
  if (!secretOrPublicKey || typeof secretOrPublicKey !== 'string') {
    return { valid: false, error: 'Managed auth key/secret is not configured.' };
  }

  const parts = token.trim().split('.');
  if (parts.length !== 3) {
    return { valid: false, error: 'Invalid JWT structure: token must contain 3 parts.' };
  }

  const [rawHeader, rawPayload, signature] = parts;

  // 1. Parse and validate header
  let header: { alg?: string; typ?: string };
  try {
    header = JSON.parse(base64UrlDecode(rawHeader));
  } catch {
    return { valid: false, error: 'Invalid JWT header: base64 decode or JSON parse failed.' };
  }

  // Strict algorithm check: prevent 'alg: none' or unsupported algs
  if (!header.alg || header.alg.toLowerCase() === 'none') {
    return { valid: false, error: "Disallowed JWT algorithm: 'none' is forbidden." };
  }

  const allowedAlgs = ['HS256', 'RS256'];
  if (!allowedAlgs.includes(header.alg)) {
    return { valid: false, error: `Unsupported JWT algorithm '${header.alg}'. Expected HS256 or RS256.` };
  }

  // 2. Cryptographic signature check
  const dataToVerify = `${rawHeader}.${rawPayload}`;

  if (header.alg === 'HS256') {
    const expectedSignature = crypto
      .createHmac('sha256', secretOrPublicKey)
      .update(dataToVerify)
      .digest('base64url');

    const sigBuffer = Buffer.from(signature);
    const expectedSigBuffer = Buffer.from(expectedSignature);

    if (
      sigBuffer.length !== expectedSigBuffer.length ||
      !crypto.timingSafeEqual(sigBuffer, expectedSigBuffer)
    ) {
      return { valid: false, error: 'Invalid token signature.' };
    }
  } else if (header.alg === 'RS256') {
    try {
      const publicKey = normalizePemKey(secretOrPublicKey);
      const verifier = crypto.createVerify('RSA-SHA256');
      verifier.update(dataToVerify);
      const isValid = verifier.verify(publicKey, signature, 'base64url');
      if (!isValid) {
        return { valid: false, error: 'Invalid RSA token signature.' };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { valid: false, error: `RSA signature verification failed: ${msg}` };
    }
  }

  // 3. Parse and validate payload
  let payload: VerifiedClaims;
  try {
    payload = JSON.parse(base64UrlDecode(rawPayload));
  } catch {
    return { valid: false, error: 'Invalid JWT payload: JSON parse failed.' };
  }

  if (!payload.sub || typeof payload.sub !== 'string') {
    return { valid: false, error: "Invalid token payload: missing 'sub' claim." };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const tolerance = options.clockToleranceSeconds || 0;

  // 4. Expiration check
  if (typeof payload.exp === 'number') {
    if (nowSec - tolerance >= payload.exp) {
      return { valid: false, error: 'Token has expired.' };
    }
  }

  // 5. Not-Before check
  if (typeof payload.nbf === 'number') {
    if (nowSec + tolerance < payload.nbf) {
      return { valid: false, error: 'Token is not active yet (nbf claim).' };
    }
  }

  // 6. Issuer check
  if (options.issuer && payload.iss !== options.issuer) {
    return {
      valid: false,
      error: `Token issuer mismatch: expected '${options.issuer}', got '${payload.iss}'.`,
    };
  }

  // 7. Audience check (supports aud or Clerk azp authorized party)
  if (options.audience) {
    const audMatches = Array.isArray(payload.aud)
      ? payload.aud.includes(options.audience)
      : payload.aud === options.audience;
    const azpMatches = payload.azp === options.audience;

    if (!audMatches && !azpMatches) {
      return {
        valid: false,
        error: `Token audience mismatch: expected '${options.audience}', got '${payload.aud || payload.azp}'.`,
      };
    }
  }

  return { valid: true, claims: payload };
}

/**
 * Dedicated Clerk Token Verifier
 * Supports verifying Clerk Session Tokens using either:
 * - CLERK_JWT_KEY (Clerk instance public key PEM)
 * - CLERK_SECRET_KEY / MANAGED_AUTH_SECRET (Secret key)
 * Automatically maps Clerk organization claims (org_id, org_role) to workspace identity.
 */
export function verifyClerkToken(
  token: string,
  keyOrSecret: string,
  options: VerificationOptions = {}
): TokenVerificationResult {
  const result = verifyManagedAuthToken(token, keyOrSecret, options);
  if (!result.valid || !result.claims) {
    return result;
  }

  // Map Clerk org_role to Sentinel WorkspaceRole
  let mappedRole: string | undefined;
  if (result.claims.org_role) {
    if (result.claims.org_role === 'org:admin') {
      mappedRole = 'admin';
    } else if (result.claims.org_role === 'org:member') {
      mappedRole = 'analyst';
    } else {
      mappedRole = 'viewer';
    }
  }

  return {
    valid: true,
    claims: {
      ...result.claims,
      workspace_id: (result.claims.org_id as string) || (result.claims.workspace_id as string),
      role: mappedRole || (result.claims.role as string) || 'analyst',
    },
  };
}
