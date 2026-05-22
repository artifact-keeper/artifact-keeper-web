import '@/lib/sdk-client';
import {
  getTelemetrySettings as sdkGetTelemetrySettings,
  updateTelemetrySettings as sdkUpdateTelemetrySettings,
  listCrashes as sdkListCrashes,
  listPendingCrashes as sdkListPendingCrashes,
  getCrash as sdkGetCrash,
  submitCrashes as sdkSubmitCrashes,
  deleteCrash as sdkDeleteCrash,
} from '@artifact-keeper/sdk';
import type {
  CrashReport as SdkCrashReport,
  CrashListResponse as SdkCrashListResponse,
  TelemetrySettings as SdkTelemetrySettings,
} from '@artifact-keeper/sdk';
import type {
  CrashReport,
  TelemetrySettings,
  CrashListResponse,
  SubmitResponse,
} from '@/types/telemetry';
import { assertData } from '@/lib/api/fetch';

// SDK declares optional+nullable for several CrashReport fields the local
// type declares as required-but-nullable. Adapter normalizes undefined → null
// (#206 / #359).

function adaptCrashReport(sdk: SdkCrashReport): CrashReport {
  return {
    id: sdk.id,
    error_type: sdk.error_type,
    error_message: sdk.error_message,
    stack_trace: sdk.stack_trace ?? null,
    component: sdk.component,
    severity: sdk.severity,
    app_version: sdk.app_version,
    os_info: sdk.os_info ?? null,
    uptime_seconds: sdk.uptime_seconds ?? null,
    context: sdk.context,
    submitted: sdk.submitted,
    submitted_at: sdk.submitted_at ?? null,
    submission_error: sdk.submission_error ?? null,
    error_signature: sdk.error_signature,
    occurrence_count: sdk.occurrence_count,
    first_seen_at: sdk.first_seen_at,
    last_seen_at: sdk.last_seen_at,
    created_at: sdk.created_at,
  };
}

function adaptCrashList(sdk: SdkCrashListResponse): CrashListResponse {
  return {
    items: sdk.items.map(adaptCrashReport),
    total: sdk.total,
  };
}

function adaptTelemetrySettings(sdk: SdkTelemetrySettings): TelemetrySettings {
  return {
    enabled: sdk.enabled,
    review_before_send: sdk.review_before_send,
    scrub_level: sdk.scrub_level,
    include_logs: sdk.include_logs,
  };
}

const telemetryApi = {
  getSettings: async (): Promise<TelemetrySettings> => {
    const { data, error } = await sdkGetTelemetrySettings();
    if (error) throw error;
    return adaptTelemetrySettings(assertData(data, 'telemetryApi.getSettings'));
  },

  updateSettings: async (
    settings: TelemetrySettings,
  ): Promise<TelemetrySettings> => {
    const { data, error } = await sdkUpdateTelemetrySettings({ body: settings });
    if (error) throw error;
    return adaptTelemetrySettings(
      assertData(data, 'telemetryApi.updateSettings'),
    );
  },

  listCrashes: async (params?: {
    page?: number;
    per_page?: number;
  }): Promise<CrashListResponse> => {
    const { data, error } = await sdkListCrashes({ query: params });
    if (error) throw error;
    return adaptCrashList(assertData(data, 'telemetryApi.listCrashes'));
  },

  listPending: async (): Promise<CrashReport[]> => {
    const { data, error } = await sdkListPendingCrashes();
    if (error) throw error;
    return assertData(data, 'telemetryApi.listPending').map(adaptCrashReport);
  },

  getCrash: async (id: string): Promise<CrashReport> => {
    const { data, error } = await sdkGetCrash({ path: { id } });
    if (error) throw error;
    return adaptCrashReport(assertData(data, 'telemetryApi.getCrash'));
  },

  submitCrashes: async (ids: string[]): Promise<SubmitResponse> => {
    const { data, error } = await sdkSubmitCrashes({ body: { ids } });
    if (error) throw error;
    return assertData(data, 'telemetryApi.submitCrashes');
  },

  deleteCrash: async (id: string): Promise<void> => {
    const { error } = await sdkDeleteCrash({ path: { id } });
    if (error) throw error;
  },
};

export default telemetryApi;
