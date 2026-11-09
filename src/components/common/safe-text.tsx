"use client";

import type { ElementType, HTMLAttributes } from "react";
import {
  DEFAULT_MAX_LENGTH,
  formatUntrustedText,
} from "@/lib/untrusted-text";

type SafeTextProps = {
  /** The untrusted string. */
  value: string | null | undefined;
  /** Longest text shown before it is cut with an ellipsis. */
  max?: number;
  as?: ElementType;
} & Omit<HTMLAttributes<HTMLElement>, "children">;

/**
 * Renders text this app does not control (see `formatUntrustedText`): control
 * and bidi characters are shown as `[U+XXXX]`, and over-long text is cut with
 * the whole text in a tooltip.
 */
export function SafeText({
  value,
  max = DEFAULT_MAX_LENGTH,
  as: Tag = "span",
  title,
  ...rest
}: SafeTextProps) {
  const { text, full, escaped, truncated } = formatUntrustedText(value, { max });
  const note =
    escaped > 0
      ? `Contains ${escaped} hidden or control character${escaped === 1 ? "" : "s"}, shown as [U+XXXX].`
      : undefined;
  return (
    <Tag
      {...rest}
      title={truncated ? full : (title ?? note)}
      data-sanitized={escaped > 0 ? "true" : undefined}
    >
      {text}
    </Tag>
  );
}
