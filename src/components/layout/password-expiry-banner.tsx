"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";

const WARNING_THRESHOLD_DAYS = 7;

function daysUntil(dateString: string): number {
  const now = new Date();
  const expiry = new Date(dateString);
  const diffMs = expiry.getTime() - now.getTime();
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, days);
}

export function PasswordExpiryBanner() {
  const { passwordExpiresAt, isAuthenticated } = useAuth();

  if (!isAuthenticated || !passwordExpiresAt) {
    return null;
  }

  const daysRemaining = daysUntil(passwordExpiresAt);

  if (isNaN(daysRemaining)) {
    return null;
  }

  // Already expired passwords are handled by RequireAuth redirect,
  // so this banner only covers the warning window.
  if (daysRemaining > WARNING_THRESHOLD_DAYS) {
    return null;
  }

  const message =
    daysRemaining === 0
      ? "Your password expires today."
      : daysRemaining === 1
        ? "Your password expires tomorrow."
        : `Your password expires in ${daysRemaining} days.`;

  return (
    <div
      role="alert"
      className="sticky top-0 z-50 flex items-center justify-center gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
    >
      <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
      <span>
        {message}{" "}
        <Link
          href="/change-password"
          className="font-semibold underline underline-offset-2"
        >
          Change it now
        </Link>
      </span>
    </div>
  );
}
