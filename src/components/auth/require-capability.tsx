"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import type { User } from "@/types";

/** Global capability that lets a non-admin decide package exceptions. */
export const CAP_SECURITY_REVIEW = "security_review";

/**
 * Does this user hold `capability`?
 *
 * Admins always do: the backend's `require_security_review` short-circuits on
 * `is_admin`, and a UI that disagreed with it would hide a page the API would
 * happily serve. Exported so a nav item can ask the same question the route
 * guard asks, instead of re-deriving it.
 */
export function hasCapability(
  user: User | null | undefined,
  capability: string,
): boolean {
  if (!user) return false;
  if (user.is_admin) return true;
  return user.capabilities?.includes(capability) ?? false;
}

/**
 * Route guard for a page that needs a global capability rather than admin.
 *
 * Sibling of `RequireAdmin`, deliberately a separate component rather than a
 * parameter on it: the two answer different questions, and conflating them is
 * how a capability check quietly becomes an admin check.
 *
 * This is a UX guard, not a security boundary. Every endpoint behind it
 * enforces the same capability server-side; hiding the page only saves the
 * user a 403.
 */
export function RequireCapability({
  capability,
  children,
}: {
  capability: string;
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const router = useRouter();
  const allowed = hasCapability(user, capability);

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        router.replace("/login");
      } else if (!allowed) {
        router.replace("/error/403");
      }
    }
  }, [isAuthenticated, isLoading, allowed, router]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated || !allowed) {
    return null;
  }

  return <>{children}</>;
}
