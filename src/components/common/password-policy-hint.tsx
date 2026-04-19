"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { settingsApi, type PasswordPolicy } from "@/lib/api/settings";

interface PasswordPolicyHintProps {
  /** The current password value to validate against policy rules */
  password?: string;
  /** Additional CSS classes for the container */
  className?: string;
}

interface PolicyRule {
  label: string;
  met: boolean;
}

function buildRules(password: string, policy: PasswordPolicy): PolicyRule[] {
  const rules: PolicyRule[] = [
    {
      label: `Minimum ${policy.min_length} characters`,
      met: password.length >= policy.min_length,
    },
  ];

  if (policy.require_uppercase) {
    rules.push({
      label: "At least one uppercase letter",
      met: /[A-Z]/.test(password),
    });
  }

  if (policy.require_lowercase) {
    rules.push({
      label: "At least one lowercase letter",
      met: /[a-z]/.test(password),
    });
  }

  if (policy.require_digit) {
    rules.push({
      label: "At least one number",
      met: /\d/.test(password),
    });
  }

  if (policy.require_special) {
    rules.push({
      label: "At least one special character",
      met: /[^A-Za-z0-9]/.test(password),
    });
  }

  if (policy.history_count > 0) {
    rules.push({
      label: `Cannot reuse your last ${policy.history_count} ${policy.history_count === 1 ? "password" : "passwords"}`,
      // History check is server-side only; always show as neutral
      met: false,
    });
  }

  return rules;
}

/**
 * Displays the active password policy requirements with live validation
 * feedback. Fetches policy from the server settings endpoint and falls
 * back to sensible defaults when the endpoint is unavailable.
 */
export function PasswordPolicyHint({
  password = "",
  className,
}: PasswordPolicyHintProps) {
  const { data: policy } = useQuery({
    queryKey: ["password-policy"],
    queryFn: () => settingsApi.getPasswordPolicy(),
    staleTime: 5 * 60 * 1000, // cache for 5 minutes
    retry: false,
  });

  const effectivePolicy = policy ?? settingsApi.DEFAULT_PASSWORD_POLICY;
  const rules = buildRules(password, effectivePolicy);
  const hasInput = password.length > 0;

  return (
    <div
      className={cn("space-y-1.5", className)}
      role="list"
      aria-label="Password requirements"
    >
      <p className="text-xs font-medium text-muted-foreground">
        Password requirements
      </p>
      {rules.map((rule) => {
        // For history rules, never show a check since we can't validate client-side
        const isHistoryRule = rule.label.startsWith("Cannot reuse");
        const showStatus = hasInput && !isHistoryRule;

        return (
          <div
            key={rule.label}
            className="flex items-center gap-1.5"
            role="listitem"
          >
            {showStatus ? (
              rule.met ? (
                <Check
                  className="size-3.5 shrink-0 text-green-600 dark:text-green-400"
                  aria-hidden="true"
                />
              ) : (
                <X
                  className="size-3.5 shrink-0 text-destructive"
                  aria-hidden="true"
                />
              )
            ) : (
              <span className="size-3.5 shrink-0 flex items-center justify-center">
                <span className="size-1 rounded-full bg-muted-foreground/40" />
              </span>
            )}
            <span
              className={cn(
                "text-xs",
                showStatus && rule.met
                  ? "text-green-600 dark:text-green-400"
                  : showStatus && !rule.met
                    ? "text-destructive"
                    : "text-muted-foreground"
              )}
            >
              {rule.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
