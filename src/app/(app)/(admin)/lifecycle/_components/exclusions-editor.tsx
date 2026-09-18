"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";
import { Plus, ShieldCheck, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PolicyExclusions } from "@/types/lifecycle";

interface StringListFieldProps {
  id: string;
  label: string;
  placeholder: string;
  description: ReactNode;
  /** Singular noun used in button labels and validation messages. */
  noun: string;
  items: string[];
  onChange: (next: string[]) => void;
  /** Extra per-entry validation; return a message to reject the entry. */
  validate?: (value: string) => string | null;
  /** Backend rejection for this list, rendered under the entries. */
  error?: string | null;
}

/**
 * One add-and-remove list of strings. Both exclusion lists are the same
 * control with different copy and validation, so they share this one
 * implementation rather than being written out twice.
 */
function StringListField({
  id,
  label,
  placeholder,
  description,
  noun,
  items,
  onChange,
  validate,
  error,
}: StringListFieldProps) {
  const [draft, setDraft] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const handleAdd = () => {
    // Trimmed because the backend rejects empty entries outright, and a
    // stray space is a typo rather than part of a version.
    const value = draft.trim();
    if (!value) {
      setAddError(`Enter a ${noun} first.`);
      return;
    }
    if (items.includes(value)) {
      setAddError(`"${value}" is already in the list.`);
      return;
    }
    const invalid = validate?.(value);
    if (invalid) {
      setAddError(invalid);
      return;
    }
    setAddError(null);
    setDraft("");
    onChange([...items, value]);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    // The dialog's primary action is "Create"; Enter here means "add this
    // entry", never "submit the policy".
    event.preventDefault();
    handleAdd();
  };

  const messageId = `${id}-message`;
  const message = addError ?? error ?? null;

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <p className="text-xs text-muted-foreground">{description}</p>
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setAddError(null);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="font-mono text-xs"
          aria-describedby={message ? messageId : undefined}
          aria-invalid={message ? true : undefined}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAdd}
          disabled={!draft.trim()}
          aria-label={`Add ${noun}`}
        >
          <Plus className="size-4" />
        </Button>
      </div>
      {items.length > 0 && (
        <ul className="space-y-1" aria-label={`${label} list`}>
          {items.map((item) => (
            <li
              key={item}
              className="flex items-center justify-between gap-2 rounded-md border px-2 py-1"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-xs">
                {item}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="text-destructive hover:text-destructive"
                onClick={() => onChange(items.filter((entry) => entry !== item))}
                aria-label={`Remove ${noun} ${item}`}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {message && (
        <p id={messageId} role="alert" className="text-xs text-destructive">
          {message}
        </p>
      )}
    </div>
  );
}

export interface ExclusionsEditorProps {
  value: PolicyExclusions;
  onChange: (next: PolicyExclusions) => void;
  /** Backend rejection naming `exclude.versions`, if any. */
  versionsError?: string | null;
  /** Backend rejection naming `exclude.version_patterns`, if any. */
  patternsError?: string | null;
}

/**
 * Editor for a policy's `config.exclude` block — the artifacts a sweep must
 * never delete (backend 1.10.0, artifact-keeper#2024).
 *
 * Applies to every policy type. Both lists select on the artifact's version,
 * which for OCI/Docker repositories is its tag, so one editor expresses both
 * "never delete the `latest` tag" and "never delete release 1.4.2".
 */
export function ExclusionsEditor({
  value,
  onChange,
  versionsError,
  patternsError,
}: ExclusionsEditorProps) {
  return (
    <div className="space-y-4 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Exclusions</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Versions kept no matter what this policy matches. For Docker and OCI
        repositories the version is the tag.
      </p>
      <StringListField
        id="lifecycle-exclude-versions"
        label="Keep these versions"
        placeholder="e.g. latest"
        description="Matched exactly."
        noun="version"
        items={value.versions}
        onChange={(versions) => onChange({ ...value, versions })}
        error={versionsError}
      />
      <StringListField
        id="lifecycle-exclude-version-patterns"
        label="Keep versions matching"
        placeholder="e.g. ^v[0-9]+\.[0-9]+\.[0-9]+$"
        description="Regular expressions, matched against the whole version."
        noun="pattern"
        items={value.version_patterns}
        onChange={(version_patterns) => onChange({ ...value, version_patterns })}
        validate={(pattern) => {
          // The backend compiles these with Rust's regex crate; JavaScript's
          // engine is close enough to catch a typo here and give immediate,
          // associated feedback instead of a rejected save.
          try {
            new RegExp(pattern);
            return null;
          } catch {
            return "Not a valid regular expression.";
          }
        }}
        error={patternsError}
      />
    </div>
  );
}
