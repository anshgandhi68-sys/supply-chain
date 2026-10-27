/**
 * Safe Request Body Streaming Reader
 * Enforces maximum size limits chunk-by-chunk during stream ingestion.
 * Rejects oversized chunked/streaming requests before unbounded memory allocation occurs.
 */

import { NextRequest } from 'next/server';

export interface ReadPayloadResult<T> {
  data?: T;
  error?: string;
  status?: number;
}

export const DEFAULT_MAX_BODY_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Reads and parses JSON from a NextRequest body while strictly enforcing a byte limit.
 * Cancels and aborts the stream immediately if incoming chunked bytes exceed maxBytes.
 */
export async function readJsonBodyWithLimit<T = any>(
  req: NextRequest,
  maxBytes: number = DEFAULT_MAX_BODY_BYTES
): Promise<ReadPayloadResult<T>> {
  // 1. Fast pre-check: If Content-Length header is present and exceeds maxBytes, reject immediately
  const contentLengthHeader = req.headers.get('content-length');
  if (contentLengthHeader) {
    const contentLength = parseInt(contentLengthHeader, 10);
    if (!isNaN(contentLength) && contentLength > maxBytes) {
      return {
        error: `Payload too large. Request body exceeds ${maxBytes} bytes limit.`,
        status: 413,
      };
    }
  }

  // 2. Stream chunk-by-chunk ingestion with progressive byte accumulator
  if (!req.body) {
    return {
      error: 'Request body is required.',
      status: 400,
    };
  }

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          // Immediately cancel the stream so the client cannot send further data
          await reader.cancel('Payload size exceeded limit');
          return {
            error: `Payload too large. Stream exceeded ${maxBytes} bytes limit.`,
            status: 413,
          };
        }
        chunks.push(value);
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      error: `Failed to read request body stream: ${msg}`,
      status: 400,
    };
  }

  if (totalBytes === 0) {
    return {
      error: 'Request body cannot be empty.',
      status: 400,
    };
  }

  // Assemble concatenated buffer
  const completeBuffer = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    completeBuffer.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const text = new TextDecoder('utf-8').decode(completeBuffer);
  try {
    const parsed = JSON.parse(text);
    return { data: parsed as T };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      error: `Malformed JSON: ${msg}`,
      status: 400,
    };
  }
}
