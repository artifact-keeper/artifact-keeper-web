"use client";

import { ExternalLink, Rss } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

/**
 * Read-only documentation surface for the npm upstream change-feed (#702).
 *
 * Backend 1.7.0 ships an opt-in consumer of npm's replication feed
 * (`replicate.npmjs.com/_changes`) that proactively evicts stale cached
 * packuments in remote/virtual npm repositories instead of waiting for the
 * packument cache TTL. It is currently configurable only via environment
 * variables, and the backend exposes no status or config endpoint for it —
 * the API the UI needs is tracked as artifact-keeper#3069
 * (BACKEND_ISSUE_URL below). Until that lands, this card is intentionally
 * read-only: there is nothing to fetch and nothing to persist.
 */

export const NPM_REPLICATION_FEED_DEFAULT_URL =
  "https://replicate.npmjs.com/_changes";

/** Backend issue tracking the status/config API this UI depends on. */
export const BACKEND_ISSUE_URL =
  "https://github.com/artifact-keeper/artifact-keeper/issues/3069";

interface EnvVarDoc {
  name: string;
  defaultValue: string;
  descriptionKey: string;
}

/** Environment variables that configure the feed, shown read-only. */
export const NPM_UPSTREAM_FEED_ENV_VARS: EnvVarDoc[] = [
  {
    name: "NPM_UPSTREAM_FEED_ENABLED",
    defaultValue: "false",
    descriptionKey: "npmFeedEnabledDescription",
  },
  {
    name: "NPM_UPSTREAM_FEED_URL",
    defaultValue: NPM_REPLICATION_FEED_DEFAULT_URL,
    descriptionKey: "npmFeedUrlDescription",
  },
];

export function NpmUpstreamFeedCard() {
  const t = useTranslations("common");
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Rss className="size-4 text-muted-foreground" />
          <CardTitle className="text-base">{t("npmFeedTitle")}</CardTitle>
          <Badge variant="secondary">{t("configuredViaEnv")}</Badge>
        </div>
        <CardDescription>
          {t("npmFeedDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {NPM_UPSTREAM_FEED_ENV_VARS.map((envVar, index) => (
          <div key={envVar.name}>
            {index > 0 && <Separator className="mb-4" />}
            <div className="space-y-2">
              <p className="text-sm font-medium">
                <code>{envVar.name}</code>
              </p>
              <p className="text-xs text-muted-foreground">
                {t("default")}: <code>{envVar.defaultValue}</code>
              </p>
              <p className="text-xs text-muted-foreground">
                {t(envVar.descriptionKey)}
              </p>
            </div>
          </div>
        ))}
        <Separator />
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("runtimeStatus")}</p>
          <p className="text-xs text-muted-foreground">
            {t("runtimeStatusDescription")}{" "}
            <a
              href={BACKEND_ISSUE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-foreground"
            >
              artifact-keeper#3069
              <ExternalLink className="size-3" />
            </a>
            .
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
