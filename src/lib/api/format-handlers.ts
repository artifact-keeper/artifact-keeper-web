import '@/lib/sdk-client';
import {
  listFormatHandlers,
  getFormatHandler,
  enableFormatHandler,
  disableFormatHandler,
  testFormatHandler,
} from '@artifact-keeper/sdk';
import type { FormatHandlerResponse, TestFormatResponse } from '@artifact-keeper/sdk';
import { assertData } from '@/lib/api/fetch';
import { unwrap } from '@/lib/sdk-utils';

/** A package-format handler (built-in `Core` or a `Wasm` plugin). */
export interface FormatHandler {
  id: string;
  format_key: string;
  display_name: string;
  description: string | null;
  extensions: string[];
  handler_type: 'Core' | 'Wasm';
  is_enabled: boolean;
  priority: number;
  plugin_id: string | null;
  /**
   * Free-form capability bag the backend publishes per handler (declared for
   * WASM plugins; `null` for built-in `Core` handlers today). Read through a
   * named key rather than indexed ad hoc — see `PROXY_DOWNLOAD_CAPABILITY_KEY`
   * in `@/lib/proxy-downloads`, which uses it to let the API state whether a
   * format records proxied downloads instead of the frontend guessing from a
   * hardcoded list (#808, backend artifact-keeper#3446).
   */
  capabilities: Record<string, unknown> | null;
}

/** Result of dry-running a handler against sample content. */
export interface FormatTestResult {
  valid: boolean;
  parse_error: string | null;
}

export interface TestFormatInput {
  /** Artifact path to simulate, e.g. `foo/bar-1.0.0.whl`. */
  path: string;
  content: string;
  base64?: boolean;
}

function adapt(sdk: FormatHandlerResponse): FormatHandler {
  return {
    id: sdk.id,
    format_key: sdk.format_key,
    display_name: sdk.display_name,
    description: sdk.description ?? null,
    extensions: sdk.extensions,
    handler_type: sdk.handler_type,
    is_enabled: sdk.is_enabled,
    priority: sdk.priority,
    plugin_id: sdk.plugin_id ?? null,
    capabilities: sdk.capabilities ?? null,
  };
}

function adaptTest(sdk: TestFormatResponse): FormatTestResult {
  return { valid: sdk.valid, parse_error: sdk.parse_error ?? null };
}

export const formatHandlersApi = {
  list: async (): Promise<FormatHandler[]> => {
    const data = await unwrap(listFormatHandlers());
    return assertData(data, 'formatHandlersApi.list').map(adapt);
  },

  get: async (key: string): Promise<FormatHandler> => {
    const data = await unwrap(getFormatHandler({ path: { format_key: key } }));
    return adapt(assertData(data, 'formatHandlersApi.get'));
  },

  setEnabled: async (key: string, enabled: boolean): Promise<FormatHandler> => {
    const fn = enabled ? enableFormatHandler : disableFormatHandler;
    const data = await unwrap(fn({ path: { format_key: key } }));
    return adapt(assertData(data, 'formatHandlersApi.setEnabled'));
  },

  /** Dry-run the handler against sample content; returns validity + parse error. */
  test: async (key: string, input: TestFormatInput): Promise<FormatTestResult> => {
    const data = await unwrap(testFormatHandler({
      path: { format_key: key },
      body: { path: input.path, content: input.content, base64: input.base64 ?? false },
    }));
    return adaptTest(assertData(data, 'formatHandlersApi.test'));
  },
};

