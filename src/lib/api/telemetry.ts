/* eslint-disable @typescript-eslint/no-explicit-any */
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
  CrashReport,
  TelemetrySettings,
  CrashListResponse,
  SubmitResponse,
} from "@/types/telemetry";

const telemetryApi = {
  getSettings: async (): Promise<TelemetrySettings> => {
    const { data, error } = await sdkGetTelemetrySettings();
    if (error) throw error;
    return data as any;
  },

  updateSettings: async (
    settings: TelemetrySettings
  ): Promise<TelemetrySettings> => {
    const { data, error } = await sdkUpdateTelemetrySettings({ body: settings as any });
    if (error) throw error;
    return data as any;
  },

  listCrashes: async (params?: {
    page?: number;
    per_page?: number;
  }): Promise<CrashListResponse> => {
    const { data, error } = await sdkListCrashes({ query: params as any });
    if (error) throw error;
    return data as any;
  },

  listPending: async (): Promise<CrashReport[]> => {
    const { data, error } = await sdkListPendingCrashes();
    if (error) throw error;
    return data as any;
  },

  getCrash: async (id: string): Promise<CrashReport> => {
    const { data, error } = await sdkGetCrash({ path: { id } });
    if (error) throw error;
    return data as any;
  },

  submitCrashes: async (ids: string[]): Promise<SubmitResponse> => {
    const { data, error } = await sdkSubmitCrashes({ body: { ids } as any });
    if (error) throw error;
    return data as any;
  },

  deleteCrash: async (id: string): Promise<void> => {
    const { error } = await sdkDeleteCrash({ path: { id } });
    if (error) throw error;
  },
};

export default telemetryApi;
