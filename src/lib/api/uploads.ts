import '@/lib/sdk-client';
import {
  createSession as sdkCreateSession,
  getSessionStatus as sdkGetSessionStatus,
  complete as sdkComplete,
  cancel as sdkCancel,
} from '@artifact-keeper/sdk';
import type {
  CreateSessionRequest,
  CreateSessionResponse,
  SessionStatusResponse,
  ChunkResponse,
  CompleteResponse,
} from '@artifact-keeper/sdk';
import { getActiveInstanceBaseUrl } from '@/lib/sdk-client';

// --- Re-export SDK types under the names the rest of the codebase expects ---

export type { CreateSessionResponse };

/** Alias for the SDK's SessionStatusResponse, matching the old hand-rolled type. */
export type UploadSession = SessionStatusResponse;

/** Alias kept for backward compatibility with the hook's public interface. */
export type CompleteResult = CompleteResponse;

/** Alias kept for backward compatibility. */
export type ChunkResult = ChunkResponse;

/** Parameters for creating an upload session (maps to CreateSessionRequest). */
export type CreateSessionParams = CreateSessionRequest;

// --- Custom error classes (not provided by the SDK) ---

export class UploadSessionExpiredError extends Error {
  constructor(sessionId: string) {
    super(`Upload session ${sessionId} has expired`);
    this.name = 'UploadSessionExpiredError';
  }
}

export class ChecksumMismatchError extends Error {
  constructor() {
    super('File checksum does not match. The file may have changed during upload.');
    this.name = 'ChecksumMismatchError';
  }
}

// --- Helpers ---

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

// --- API Functions ---

export async function createUploadSession(
  params: CreateSessionParams
): Promise<CreateSessionResponse> {
  const { data, error } = await sdkCreateSession({ body: params });
  if (error) {
    throw new Error(`Failed to create upload session: ${errorMessage(error)}`);
  }
  return data as unknown as CreateSessionResponse;
}

/**
 * Upload a binary chunk. The SDK's uploadChunk declares body as never because
 * the OpenAPI spec uses application/octet-stream, which the generated client
 * cannot serialize. We keep a raw fetch call for this endpoint.
 */
export async function uploadChunk(
  sessionId: string,
  start: number,
  end: number,
  total: number,
  data: Blob
): Promise<ChunkResult> {
  const baseUrl = getActiveInstanceBaseUrl();
  const response = await fetch(`${baseUrl}/api/v1/uploads/${sessionId}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Range': `bytes ${start}-${end - 1}/${total}`,
    },
    body: data,
  });
  if (!response.ok) {
    if (response.status === 410) {
      throw new UploadSessionExpiredError(sessionId);
    }
    const body = await response.text().catch(() => '');
    throw new Error(`Chunk upload failed (${response.status}): ${body}`);
  }
  return response.json() as Promise<ChunkResult>;
}

export async function getUploadSession(
  sessionId: string
): Promise<UploadSession> {
  const { data, error, response } = await sdkGetSessionStatus({
    path: { session_id: sessionId },
  });
  if (error) {
    if (response?.status === 410) {
      throw new UploadSessionExpiredError(sessionId);
    }
    throw new Error(
      `Failed to get upload session: ${errorMessage(error)}`
    );
  }
  return data as unknown as UploadSession;
}

export async function completeUploadSession(
  sessionId: string
): Promise<CompleteResult> {
  const { data, error, response } = await sdkComplete({
    path: { session_id: sessionId },
  });
  if (error) {
    if (response?.status === 409) {
      throw new ChecksumMismatchError();
    }
    if (response?.status === 410) {
      throw new UploadSessionExpiredError(sessionId);
    }
    throw new Error(
      `Failed to finalize upload: ${errorMessage(error)}`
    );
  }
  return data as unknown as CompleteResult;
}

export async function cancelUploadSession(
  sessionId: string
): Promise<void> {
  const { error } = await sdkCancel({
    path: { session_id: sessionId },
  });
  if (error) {
    throw new Error(
      `Failed to cancel upload: ${errorMessage(error)}`
    );
  }
}
