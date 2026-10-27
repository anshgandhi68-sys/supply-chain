/**
 * Client-safe validation utilities for manifest JSON and configurations
 */

export const MAX_JSON_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export function validateJsonInput(
  content: string,
  filename: string
): { isValid: boolean; error?: string; parsed?: any } {
  if (content.length > MAX_JSON_SIZE_BYTES) {
    return {
      isValid: false,
      error: `File ${filename} exceeds safe limit of 5MB (${(content.length / (1024 * 1024)).toFixed(1)}MB).`,
    };
  }

  try {
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object') {
      return { isValid: false, error: `${filename} must be a valid JSON object.` };
    }
    return { isValid: true, parsed };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { isValid: false, error: `Malformed JSON in ${filename}: ${msg}` };
  }
}
