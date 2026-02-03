export interface ServiceHealthEntry {
  service_name: string;
  status: string;
  previous_status: string | null;
  message: string | null;
  response_time_ms: number | null;
  checked_at: string;
}

export interface AlertState {
  service_name: string;
  current_status: string;
  consecutive_failures: number;
  last_alert_sent_at: string | null;
  suppressed_until: string | null;
  updated_at: string;
}

export interface HealthLogQuery {
  service?: string;
  limit?: number;
}

export interface SuppressRequest {
  service_name: string;
  until: string;
}
