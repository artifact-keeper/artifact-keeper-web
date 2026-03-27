import { apiFetch } from './fetch';
import { getActiveInstanceBaseUrl } from '@/lib/sdk-client';

// --- Types ---

export interface CreateSessionParams {
  repository_key: string;
  artifact_path: string;
  total_size: number;
  checksum_sha256: string;
  chunk_size?: number;
  content_type?: string;
}

/** Response from POST /api/v1/uploads (create session) */
export interface CreateSessionResponse {
  session_id: string;
  chunk_count: number;
  chunk_size: number;
  expires_at: string;
}

/** Response from GET /api/v1/uploads/{session_id} (session status) */
export interface UploadSession {
  session_id: string;
  status: 'in_progress' | 'completed' | 'cancelled' | 'expired';
  total_size: number;
  bytes_received: number;
  chunks_completed: number;
  chunks_total: number;
  repository_key: string;
  artifact_path: string;
  created_at: string;
  expires_at: string;
}

export interface ChunkResult {
  chunk_index: number;
  bytes_received: number;
  chunks_completed: number;
  chunks_remaining: number;
}

export interface CompleteResult {
  artifact_id: string;
  path: string;
  size: number;
  checksum_sha256: string;
}

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

// --- API Functions ---

const UPLOADS_PATH = '/api/v1/uploads';

export async function createUploadSession(
  params: CreateSessionParams
): Promise<CreateSessionResponse> {
  return apiFetch<CreateSessionResponse>(UPLOADS_PATH, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function uploadChunk(
  sessionId: string,
  start: number,
  end: number,
  total: number,
  data: Blob
): Promise<ChunkResult> {
  const baseUrl = getActiveInstanceBaseUrl();
  const response = await fetch(`${baseUrl}${UPLOADS_PATH}/${sessionId}`, {
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
  const baseUrl = getActiveInstanceBaseUrl();
  const response = await fetch(`${baseUrl}${UPLOADS_PATH}/${sessionId}`, {
    method: 'GET',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    if (response.status === 410) {
      throw new UploadSessionExpiredError(sessionId);
    }
    const body = await response.text().catch(() => '');
    throw new Error(`Failed to get upload session (${response.status}): ${body}`);
  }
  return response.json() as Promise<UploadSession>;
}

export async function completeUploadSession(
  sessionId: string
): Promise<CompleteResult> {
  const baseUrl = getActiveInstanceBaseUrl();
  const response = await fetch(`${baseUrl}${UPLOADS_PATH}/${sessionId}/complete`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    if (response.status === 409) {
      throw new ChecksumMismatchError();
    }
    if (response.status === 410) {
      throw new UploadSessionExpiredError(sessionId);
    }
    const body = await response.text().catch(() => '');
    throw new Error(`Failed to finalize upload (${response.status}): ${body}`);
  }
  return response.json() as Promise<CompleteResult>;
}

export async function cancelUploadSession(
  sessionId: string
): Promise<void> {
  return apiFetch<void>(`${UPLOADS_PATH}/${sessionId}`, {
    method: 'DELETE',
  });
}
