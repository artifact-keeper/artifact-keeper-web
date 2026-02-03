export interface CrashReport {
  id: string;
  error_type: string;
  error_message: string;
  stack_trace: string | null;
  component: string;
  severity: string;
  app_version: string;
  os_info: string | null;
  uptime_seconds: number | null;
  context: Record<string, unknown>;
  submitted: boolean;
  submitted_at: string | null;
  submission_error: string | null;
  error_signature: string;
  occurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
}

export interface TelemetrySettings {
  enabled: boolean;
  review_before_send: boolean;
  scrub_level: string;
  include_logs: boolean;
}

export interface CrashListResponse {
  items: CrashReport[];
  total: number;
}

export interface SubmitCrashesRequest {
  ids: string[];
}

export interface SubmitResponse {
  marked_submitted: number;
}
