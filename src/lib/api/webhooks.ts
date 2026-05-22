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
import type {
  WebhookResponse as SdkWebhookResponse,
  WebhookListResponse as SdkWebhookListResponse,
  CreateWebhookRequest as SdkCreateWebhookRequest,
  DeliveryResponse as SdkDeliveryResponse,
  DeliveryListResponse as SdkDeliveryListResponse,
  TestWebhookResponse as SdkTestWebhookResponse,
} from '@artifact-keeper/sdk';
import { assertData, narrowEnum } from '@/lib/api/fetch';

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

const WEBHOOK_EVENTS = new Set<WebhookEvent>([
  'artifact_uploaded',
  'artifact_deleted',
  'repository_created',
  'repository_deleted',
  'user_created',
  'user_deleted',
  'build_started',
  'build_completed',
  'build_failed',
]);

export interface Webhook {
  id: string;
  name: string;
  url: string;
  events: WebhookEvent[];
  is_enabled: boolean;
  repository_id?: string;
  headers?: Record<string, string>;
  payload_template?: string;
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
  payload_template?: string;
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

// SDK headers map values to `unknown`; the local type narrows to `string`.
// Stringify each value defensively so a non-string slipping through doesn't
// crash render code that expects strings.
function adaptHeaders(
  raw: { [key: string]: unknown } | null | undefined,
): Record<string, string> | undefined {
  if (!raw) return undefined;
  return Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, typeof v === 'string' ? v : String(v)]),
  );
}

function adaptWebhook(sdk: SdkWebhookResponse): Webhook {
  return {
    id: sdk.id,
    name: sdk.name,
    url: sdk.url,
    events: sdk.events.map((e) =>
      narrowEnum(
        e,
        WEBHOOK_EVENTS,
        'artifact_uploaded',
        `webhooksApi: unknown event "${e}" — falling back to "artifact_uploaded".`,
      ),
    ),
    is_enabled: sdk.is_enabled,
    repository_id: sdk.repository_id ?? undefined,
    headers: adaptHeaders(sdk.headers),
    last_triggered_at: sdk.last_triggered_at ?? undefined,
    created_at: sdk.created_at,
  };
}

function adaptWebhookList(
  sdk: SdkWebhookListResponse,
): WebhookListResponse<Webhook> {
  return {
    items: sdk.items.map(adaptWebhook),
    total: sdk.total,
  };
}

function adaptDelivery(sdk: SdkDeliveryResponse): WebhookDelivery {
  return {
    id: sdk.id,
    webhook_id: sdk.webhook_id,
    event: sdk.event,
    payload: sdk.payload,
    response_status: sdk.response_status ?? undefined,
    response_body: sdk.response_body ?? undefined,
    success: sdk.success,
    attempts: sdk.attempts,
    delivered_at: sdk.delivered_at ?? undefined,
    created_at: sdk.created_at,
  };
}

function adaptDeliveryList(
  sdk: SdkDeliveryListResponse,
): WebhookListResponse<WebhookDelivery> {
  return {
    items: sdk.items.map(adaptDelivery),
    total: sdk.total,
  };
}

function adaptTestResult(sdk: SdkTestWebhookResponse): WebhookTestResult {
  return {
    success: sdk.success,
    status_code: sdk.status_code ?? undefined,
    response_body: sdk.response_body ?? undefined,
    error: sdk.error ?? undefined,
  };
}

// SDK type leak: CreateWebhookRequest declares `headers?: { [key: string]:
// unknown } | null` but accepts any Record<string, string>. Forward fields
// explicitly so a future local-type addition surfaces at typecheck.
function adaptCreateRequest(req: CreateWebhookRequest): SdkCreateWebhookRequest {
  return {
    name: req.name,
    url: req.url,
    events: req.events,
    secret: req.secret,
    repository_id: req.repository_id,
    headers: req.headers,
  };
}

export const webhooksApi = {
  list: async (
    params: ListWebhooksParams = {},
  ): Promise<WebhookListResponse<Webhook>> => {
    const { data, error } = await sdkListWebhooks({ query: params });
    if (error) throw error;
    return adaptWebhookList(assertData(data, 'webhooksApi.list'));
  },

  get: async (id: string): Promise<Webhook> => {
    const { data, error } = await sdkGetWebhook({ path: { id } });
    if (error) throw error;
    return adaptWebhook(assertData(data, 'webhooksApi.get'));
  },

  create: async (data: CreateWebhookRequest): Promise<Webhook> => {
    const { data: result, error } = await sdkCreateWebhook({
      body: adaptCreateRequest(data),
    });
    if (error) throw error;
    return adaptWebhook(assertData(result, 'webhooksApi.create'));
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
    return adaptTestResult(assertData(data, 'webhooksApi.test'));
  },

  listDeliveries: async (
    id: string,
    params: ListDeliveriesParams = {},
  ): Promise<WebhookListResponse<WebhookDelivery>> => {
    const { data, error } = await sdkListDeliveries({
      path: { id },
      query: params,
    });
    if (error) throw error;
    return adaptDeliveryList(assertData(data, 'webhooksApi.listDeliveries'));
  },

  redeliver: async (
    webhookId: string,
    deliveryId: string,
  ): Promise<WebhookDelivery> => {
    const { data, error } = await sdkRedeliver({
      path: { id: webhookId, delivery_id: deliveryId },
    });
    if (error) throw error;
    return adaptDelivery(assertData(data, 'webhooksApi.redeliver'));
  },
};

export default webhooksApi;
