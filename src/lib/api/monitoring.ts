import '@/lib/sdk-client';
import {
  getHealthLog as sdkGetHealthLog,
  getAlertStates as sdkGetAlertStates,
  suppressAlert as sdkSuppressAlert,
  runHealthCheck as sdkRunHealthCheck,
} from '@artifact-keeper/sdk';
import type {
  ServiceHealthEntry as SdkServiceHealthEntry,
  AlertState as SdkAlertState,
  SuppressRequest as SdkSuppressRequest,
} from '@artifact-keeper/sdk';
import type {
  ServiceHealthEntry,
  AlertState,
  HealthLogQuery,
  SuppressRequest,
} from '@/types/monitoring';
import { assertData } from '@/lib/api/fetch';
import { unwrap } from '@/lib/sdk-utils';

// Local types declare optional fields as required-but-nullable
// (`previous_status: string | null`) while the SDK declares them as
// optional-and-nullable (`previous_status?: string | null`). The
// adapters below normalize undefined → null so callers see a stable
// shape (#206 / #359).

function adaptServiceHealthEntry(sdk: SdkServiceHealthEntry): ServiceHealthEntry {
  return {
    service_name: sdk.service_name,
    status: sdk.status,
    previous_status: sdk.previous_status ?? null,
    message: sdk.message ?? null,
    response_time_ms: sdk.response_time_ms ?? null,
    checked_at: sdk.checked_at,
  };
}

function adaptAlertState(sdk: SdkAlertState): AlertState {
  return {
    service_name: sdk.service_name,
    current_status: sdk.current_status,
    consecutive_failures: sdk.consecutive_failures,
    last_alert_sent_at: sdk.last_alert_sent_at ?? null,
    suppressed_until: sdk.suppressed_until ?? null,
    updated_at: sdk.updated_at,
  };
}

function adaptSuppressRequest(req: SuppressRequest): SdkSuppressRequest {
  return {
    service_name: req.service_name,
    until: req.until,
  };
}

export const monitoringApi = {
  getHealthLog: async (
    params?: HealthLogQuery
  ): Promise<ServiceHealthEntry[]> => {
    const data = await unwrap(sdkGetHealthLog({ query: params }));
    return assertData(data, 'monitoringApi.getHealthLog').map(adaptServiceHealthEntry);
  },

  getAlerts: async (): Promise<AlertState[]> => {
    const data = await unwrap(sdkGetAlertStates());
    return assertData(data, 'monitoringApi.getAlerts').map(adaptAlertState);
  },

  suppressAlert: async (req: SuppressRequest): Promise<void> => {
    await unwrap(sdkSuppressAlert({ body: adaptSuppressRequest(req) }));
  },

  triggerCheck: async (): Promise<ServiceHealthEntry[]> => {
    const data = await unwrap(sdkRunHealthCheck());
    return assertData(data, 'monitoringApi.triggerCheck').map(adaptServiceHealthEntry);
  },
};

