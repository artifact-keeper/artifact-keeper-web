"use client";

import { useState, useCallback } from "react";
import { Check, Copy } from "lucide-react";
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

export function CopyButton({ value, className, label = "Copy" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

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
          <span className="sr-only">{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{copied ? "Copied!" : label}</TooltipContent>
    </Tooltip>
  );
}
