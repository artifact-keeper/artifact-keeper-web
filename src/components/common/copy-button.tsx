"use client";

import { useState, useCallback } from "react";
import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface CopyButtonProps {
  value: string;
  className?: string;
  label?: string;
}

export function CopyButton({ value, className, label }: CopyButtonProps) {
  const t = useTranslations("common");
  const [copied, setCopied] = useState(false);
  const resolvedLabel = label ?? t("copy");

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  }, [value]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          className={cn("text-muted-foreground hover:text-foreground", className)}
          onClick={handleCopy}
        >
          {copied ? (
            <Check className="size-3 text-emerald-500" />
          ) : (
            <Copy className="size-3" />
          )}
          <span className="sr-only">{resolvedLabel}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{copied ? t("copied") : resolvedLabel}</TooltipContent>
    </Tooltip>
  );
}
