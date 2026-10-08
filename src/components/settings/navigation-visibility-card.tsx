"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Info, Loader2 } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  NAV_GROUPS,
  isNavItemHideable,
  normalizeHiddenNavItems,
} from "@/components/layout/nav-items";
import {
  NAVIGATION_SETTINGS_QUERY_KEY,
  navigationSettingsApi,
} from "@/lib/api/navigation-settings";
import { mutationErrorToast } from "@/lib/error-utils";
import { SYSTEM_CONFIG_QUERY_KEY } from "@/providers/system-config-provider";

/**
 * Admin editor for the sidebar entries hidden for every user (#968, backend
 * artifact-keeper#4574).
 *
 * One switch per sidebar entry, grouped like the sidebar. Hiding only removes
 * the menu link: pages stay reachable by URL and keep their permission checks.
 * The Settings entry is always shown so an admin can get back here.
 */
export function NavigationVisibilityCard() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: NAVIGATION_SETTINGS_QUERY_KEY,
    queryFn: () => navigationSettingsApi.get(),
    retry: false,
  });

  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  // The saved list arrives asynchronously. Re-seed local state whenever it
  // changes, but never while the admin has unsaved edits.
  const [seeded, setSeeded] = useState<string[] | undefined>(undefined);
  if (data && data.hiddenNavItems !== seeded && !dirty) {
    setSeeded(data.hiddenNavItems);
    setHidden(new Set(data.hiddenNavItems));
  }

  const saveMutation = useMutation({
    mutationFn: (items: string[]) => navigationSettingsApi.update(items),
    onSuccess: (saved) => {
      toast.success("Navigation settings saved");
      queryClient.setQueryData(NAVIGATION_SETTINGS_QUERY_KEY, saved);
      // The sidebar reads the list from the public system config.
      queryClient.invalidateQueries({ queryKey: SYSTEM_CONFIG_QUERY_KEY });
      setDirty(false);
    },
    onError: mutationErrorToast("Failed to save navigation settings"),
  });

  function setVisible(href: string, visible: boolean) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (visible) next.delete(href);
      else next.add(href);
      return next;
    });
    setDirty(true);
  }

  function showAll() {
    setHidden(new Set());
    setDirty(true);
  }

  const hiddenCount = normalizeHiddenNavItems(hidden).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Navigation</CardTitle>
        <CardDescription>
          Choose which entries appear in the sidebar. Hidden entries are
          removed from the menu for every user, admins included. The pages
          stay reachable by URL and keep their permission checks.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-6 w-2/5" />
          </div>
        ) : isError || !data ? (
          <Alert variant="destructive">
            <AlertTitle>Unavailable</AlertTitle>
            <AlertDescription>
              The navigation settings could not be loaded.
            </AlertDescription>
          </Alert>
        ) : !data.supported ? (
          <Alert>
            <Info className="size-4" />
            <AlertTitle>Not supported by this server</AlertTitle>
            <AlertDescription>
              Hiding navigation entries needs a newer Artifact Keeper server.
              Every entry is shown until the server is upgraded.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {NAV_GROUPS.map((group) => (
                <fieldset key={group.label} className="space-y-2">
                  <legend className="mb-2 text-sm font-medium">
                    {group.label}
                  </legend>
                  {group.items.map((item) => {
                    const id = `nav-visible-${item.href}`;
                    const hideable = isNavItemHideable(item.href);
                    return (
                      <div
                        key={item.href}
                        className="flex items-center justify-between gap-3"
                      >
                        <label
                          htmlFor={id}
                          className="flex min-w-0 items-center gap-2 text-sm"
                        >
                          <item.icon className="size-4 shrink-0 text-muted-foreground" />
                          <span className="truncate">{item.title}</span>
                          {!hideable && (
                            <Badge variant="secondary">Always shown</Badge>
                          )}
                        </label>
                        <Switch
                          id={id}
                          size="sm"
                          checked={!hideable || !hidden.has(item.href)}
                          disabled={!hideable}
                          onCheckedChange={(checked) =>
                            setVisible(item.href, checked === true)
                          }
                          aria-label={`Show ${group.label} / ${item.title} in the sidebar`}
                        />
                      </div>
                    );
                  })}
                </fieldset>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {hiddenCount === 0
                  ? "Every entry is shown."
                  : `${hiddenCount} ${hiddenCount === 1 ? "entry" : "entries"} hidden.`}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={showAll}
                  disabled={saveMutation.isPending || hidden.size === 0}
                >
                  Show all
                </Button>
                <Button
                  onClick={() =>
                    saveMutation.mutate(normalizeHiddenNavItems(hidden))
                  }
                  disabled={saveMutation.isPending || !dirty}
                >
                  {saveMutation.isPending && (
                    <Loader2 className="size-4 mr-2 animate-spin" />
                  )}
                  Save
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
