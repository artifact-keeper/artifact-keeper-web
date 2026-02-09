/* eslint-disable @typescript-eslint/no-explicit-any */
import '@/lib/sdk-client';
import {
  listWebhooks as sdkListWebhooks,
  getWebhook as sdkGetWebhook,
  createWebhook as sdkCreateWebhook,
  deleteWebhook as sdkDeleteWebhook,
  enableWebhook as sdkEnableWebhook,
  disableWebhook as sdkDisableWebhook,
  testWebhook as sdkTestWebhook,
  listDeliveries as sdkListDeliveries,
  redeliver as sdkRedeliver,
} from '@artifact-keeper/sdk';

export interface WebhookListResponse<T> {
  items: T[];
  total: number;
}

export type WebhookEvent =
  | 'artifact_uploaded'
  | 'artifact_deleted'
  | 'repository_created'
  | 'repository_deleted'
  | 'user_created'
  | 'user_deleted'
  | 'build_started'
  | 'build_completed'
  | 'build_failed';

export interface Webhook {
  id: string;
  name: string;
  url: string;
  events: WebhookEvent[];
  is_enabled: boolean;
  repository_id?: string;
  headers?: Record<string, string>;
  last_triggered_at?: string;
  created_at: string;
}

export interface CreateWebhookRequest {
  name: string;
  url: string;
  events: WebhookEvent[];
  secret?: string;
  repository_id?: string;
  headers?: Record<string, string>;
}

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  event: string;
  payload: Record<string, unknown>;
  response_status?: number;
  response_body?: string;
  success: boolean;
  attempts: number;
  delivered_at?: string;
  created_at: string;
}

export interface WebhookTestResult {
  success: boolean;
  status_code?: number;
  response_body?: string;
  error?: string;
}

export interface ListWebhooksParams {
  repository_id?: string;
  enabled?: boolean;
  page?: number;
  per_page?: number;
}

export interface ListDeliveriesParams {
  status?: 'success';
  page?: number;
  per_page?: number;
}

export const webhooksApi = {
  list: async (params: ListWebhooksParams = {}): Promise<WebhookListResponse<Webhook>> => {
    const { data, error } = await sdkListWebhooks({ query: params as any });
    if (error) throw error;
    return data as any;
  },

  get: async (id: string): Promise<Webhook> => {
    const { data, error } = await sdkGetWebhook({ path: { id } });
    if (error) throw error;
    return data as any;
  },

  create: async (data: CreateWebhookRequest): Promise<Webhook> => {
    const { data: result, error } = await sdkCreateWebhook({ body: data as any });
    if (error) throw error;
    return result as any;
  },

  delete: async (id: string): Promise<void> => {
    const { error } = await sdkDeleteWebhook({ path: { id } });
    if (error) throw error;
  },

  enable: async (id: string): Promise<void> => {
    const { error } = await sdkEnableWebhook({ path: { id } });
    if (error) throw error;
  },

  disable: async (id: string): Promise<void> => {
    const { error } = await sdkDisableWebhook({ path: { id } });
    if (error) throw error;
  },

  test: async (id: string): Promise<WebhookTestResult> => {
    const { data, error } = await sdkTestWebhook({ path: { id } });
    if (error) throw error;
    return data as any;
  },

  listDeliveries: async (id: string, params: ListDeliveriesParams = {}): Promise<WebhookListResponse<WebhookDelivery>> => {
    const { data, error } = await sdkListDeliveries({ path: { id }, query: params as any });
    if (error) throw error;
    return data as any;
  },

  redeliver: async (webhookId: string, deliveryId: string): Promise<WebhookDelivery> => {
    const { data, error } = await sdkRedeliver({ path: { id: webhookId, delivery_id: deliveryId } });
    if (error) throw error;
    return data as any;
  },
};

export default webhooksApi;
