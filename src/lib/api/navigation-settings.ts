import { z } from "zod";
import { apiFetch } from "@/lib/api/fetch";

/**
 * Admin read/write of the sidebar entries hidden for every user (#968,
 * backend artifact-keeper#4574).
 *
 * The list lives with the other runtime settings behind
 * `GET`/`PATCH /api/v1/admin/settings/system` (backend #867). `PATCH` only
 * changes the fields it is sent, so this module never touches guest access.
 * Everyone else reads the list from the public `/api/v1/system/config`
 * (`ui.hidden_nav_items`), which is what the sidebar uses.
 */

export interface NavigationSettings {
  /** Sidebar entries (by route) hidden for every user. */
  hiddenNavItems: string[];
  /**
   * False when the backend predates the setting: its response has no
   * `hidden_nav_items` field and it would reject a `PATCH` that sends one.
   */
  supported: boolean;
}

const RuntimeSettingsSchema = z
  .object({
    hidden_nav_items: z.array(z.string()).optional(),
  })
  .passthrough();

const RUNTIME_SETTINGS_PATH = "/api/v1/admin/settings/system";

/** Query key for the admin read of the navigation settings. */
export const NAVIGATION_SETTINGS_QUERY_KEY = [
  "admin",
  "settings",
  "navigation",
] as const;

function adapt(raw: unknown): NavigationSettings {
  const parsed = RuntimeSettingsSchema.parse(raw);
  return {
    hiddenNavItems: parsed.hidden_nav_items ?? [],
    supported: parsed.hidden_nav_items !== undefined,
  };
}

export const navigationSettingsApi = {
  get: async (): Promise<NavigationSettings> => {
    return adapt(await apiFetch<unknown>(RUNTIME_SETTINGS_PATH));
  },

  update: async (hiddenNavItems: string[]): Promise<NavigationSettings> => {
    const raw = await apiFetch<unknown>(RUNTIME_SETTINGS_PATH, {
      method: "PATCH",
      body: JSON.stringify({ hidden_nav_items: hiddenNavItems }),
    });
    return adapt(raw);
  },
};
