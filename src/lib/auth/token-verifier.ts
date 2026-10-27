/**
 * Supply Chain Sentinel 2.0 - Managed Auth Token Verifier
 * 
 * Cryptographically verifies JSON Web Tokens (JWT) for managed auth providers (Clerk, Supabase, Auth0).
 * Enforces:
 * - Alg whitelist (strictly HS256, prevents 'alg: none' and alg-confusion attacks).
 * - Constant-time signature comparison using crypto.timingSafeEqual.
 * - Expiration (exp) and Not-Before (nbf) validation.
 * - Issuer (iss) and Audience (aud) validation.
 */

import crypto from 'node:crypto';

export interface VerifiedClaims {
  sub: string;
  email?: string;
  name?: string;
  org_id?: string;
  workspace_id?: string;
  role?: string;
  iss?: string;
  aud?: string;
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
 * Verifies a JWT against a managed auth secret.
 */
export function verifyManagedAuthToken(
  token: string,
  secret: string,
  options: VerificationOptions = {}
): TokenVerificationResult {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Token must be a non-empty string.' };
  }
  if (!secret || typeof secret !== 'string') {
    return { valid: false, error: 'Managed auth secret is not configured.' };
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

  // Strict algorithm check: prevent 'alg: none' or unauthorized algs
  if (!header.alg || header.alg.toLowerCase() === 'none') {
    return { valid: false, error: "Disallowed JWT algorithm: 'none' is forbidden." };
  }
  if (header.alg !== 'HS256') {
    return { valid: false, error: `Unsupported JWT algorithm '${header.alg}'. Expected HS256.` };
  }

  // 2. Cryptographic signature check (constant-time)
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${rawHeader}.${rawPayload}`)
    .digest('base64url');

  const sigBuffer = Buffer.from(signature);
  const expectedSigBuffer = Buffer.from(expectedSignature);

  if (
    sigBuffer.length !== expectedSigBuffer.length ||
    !crypto.timingSafeEqual(sigBuffer, expectedSigBuffer)
  ) {
    return { valid: false, error: 'Invalid token signature.' };
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

  // 7. Audience check
  if (options.audience && payload.aud !== options.audience) {
    return {
      valid: false,
      error: `Token audience mismatch: expected '${options.audience}', got '${payload.aud}'.`,
    };
  }

  return { valid: true, claims: payload };
}
