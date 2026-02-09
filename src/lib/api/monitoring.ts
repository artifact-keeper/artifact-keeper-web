/* eslint-disable @typescript-eslint/no-explicit-any */
import '@/lib/sdk-client';
import {
  getHealthLog as sdkGetHealthLog,
  getAlertStates as sdkGetAlertStates,
  suppressAlert as sdkSuppressAlert,
  runHealthCheck as sdkRunHealthCheck,
} from '@artifact-keeper/sdk';
import type {
  ServiceHealthEntry,
  AlertState,
  HealthLogQuery,
  SuppressRequest,
} from "@/types/monitoring";

const monitoringApi = {
  getHealthLog: async (
    params?: HealthLogQuery
  ): Promise<ServiceHealthEntry[]> => {
    const { data, error } = await sdkGetHealthLog({ query: params as any });
    if (error) throw error;
    return data as any;
  },

  getAlerts: async (): Promise<AlertState[]> => {
    const { data, error } = await sdkGetAlertStates();
    if (error) throw error;
    return data as any;
  },

  suppressAlert: async (req: SuppressRequest): Promise<void> => {
    const { error } = await sdkSuppressAlert({ body: req as any });
    if (error) throw error;
  },

  triggerCheck: async (): Promise<ServiceHealthEntry[]> => {
    const { data, error } = await sdkRunHealthCheck();
    if (error) throw error;
    return data as any;
  },
};

export default monitoringApi;
