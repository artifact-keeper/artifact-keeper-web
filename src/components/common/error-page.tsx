"use client";

import Link from "next/link";
import { Home } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ErrorPageProps {
  icon: LucideIcon;
  iconContainerClassName: string;
  iconClassName: string;
  code: string;
  title: string;
  description: string;
  actionLabel: string;
  actionIcon: LucideIcon;
  onAction: () => void;
}

export function ErrorPage({
  icon: Icon,
  iconContainerClassName,
  iconClassName,
  code,
  title,
  description,
  actionLabel,
  actionIcon: ActionIcon,
  onAction,
}: ErrorPageProps) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center px-6">
      <div className="flex flex-col items-center text-center max-w-md">
        <div
          className={cn(
            "flex size-20 items-center justify-center rounded-2xl mb-6",
            iconContainerClassName
          )}
        >
          <Icon className={cn("size-10", iconClassName)} />
        </div>
        <h1 className="text-7xl font-bold tracking-tighter text-foreground">
          {code}
        </h1>
        <h2 className="mt-4 text-xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          {description}
        </p>
        <div className="mt-8 flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
          >
            <Home className="size-4" />
            Go to Dashboard
          </Link>
          <button
            onClick={onAction}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2.5 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <ActionIcon className="size-4" />
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
