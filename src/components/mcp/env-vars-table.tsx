import { KeyRound } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { McpInput } from "@/types/mcp";

/** What a fixed value shows as: secrets are masked, never echoed. */
function shownValue(i: McpInput): string {
  if (i.isSecret) return i.value !== undefined || i.default !== undefined ? "••••••••" : "";
  return i.value ?? i.default ?? "";
}

/**
 * Inputs a runner declares (env vars, arguments, headers). Publisher text is
 * rendered as plain text; a secret's value or default is masked.
 */
export function McpInputsTable({ inputs, caption }: { inputs: McpInput[]; caption: string }) {
  if (inputs.length === 0) return null;
  return (
    <Table>
      <caption className="mb-1 text-left text-xs font-medium text-muted-foreground">{caption}</caption>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Required</TableHead>
          <TableHead>Value</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {inputs.map((i, idx) => (
          <TableRow key={`${i.name ?? i.valueHint ?? "input"}-${idx}`}>
            <TableCell className="font-mono text-xs">
              <span className="inline-flex items-center gap-1">
                {i.name ?? i.valueHint ?? "(positional)"}
                {i.isSecret && (
                  <span className="inline-flex items-center gap-0.5 text-amber-700 dark:text-amber-400">
                    <KeyRound className="size-3" aria-hidden="true" />
                    secret
                  </span>
                )}
              </span>
            </TableCell>
            <TableCell className="whitespace-normal text-xs text-muted-foreground">{i.description ?? ""}</TableCell>
            <TableCell className="text-xs">{i.isRequired ? "yes" : "no"}</TableCell>
            <TableCell className="font-mono text-xs">
              {shownValue(i)}
              {i.choices && i.choices.length > 0 && (
                <span className="ml-1 text-muted-foreground">({i.choices.join(" | ")})</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
