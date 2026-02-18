import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { SCOPES, EXPIRY_OPTIONS } from "@/lib/constants/token";
import type { RepoSelector } from "@/lib/api/service-accounts";
import { RepoSelectorForm } from "@/components/common/repo-selector-form";

type ScopeOption = { value: string; label: string };

interface TokenCreateFormProps {
  title: string;
  description: string;
  name: string;
  onNameChange: (name: string) => void;
  namePlaceholder?: string;
  expiry: string;
  onExpiryChange: (expiry: string) => void;
  scopes: string[];
  onScopesChange: (scopes: string[]) => void;
  availableScopes?: readonly ScopeOption[];
  isPending: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel?: string;
  /** When true, shows the repository selector section. */
  showRepoSelector?: boolean;
  repoSelector?: RepoSelector;
  onRepoSelectorChange?: (selector: RepoSelector) => void;
}

export function TokenCreateForm({
  title,
  description,
  name,
  onNameChange,
  namePlaceholder = "e.g., CI/CD Pipeline",
  expiry,
  onExpiryChange,
  scopes,
  onScopesChange,
  availableScopes = SCOPES as readonly ScopeOption[],
  isPending,
  onSubmit,
  onCancel,
  submitLabel = "Create",
  showRepoSelector = false,
  repoSelector,
  onRepoSelectorChange,
}: TokenCreateFormProps) {
  const toggleScope = (scope: string) => {
    onScopesChange(
      scopes.includes(scope)
        ? scopes.filter((s) => s !== scope)
        : [...scopes, scope]
    );
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="token-form-name">Name</Label>
          <Input
            id="token-form-name"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder={namePlaceholder}
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Expiration</Label>
          <Select value={expiry} onValueChange={onExpiryChange}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPIRY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-3">
          <Label>Scopes</Label>
          <div className="grid grid-cols-2 gap-3">
            {availableScopes.map((s) => (
              <label
                key={s.value}
                className="flex items-center gap-2 text-sm"
              >
                <Checkbox
                  checked={scopes.includes(s.value)}
                  onCheckedChange={() => toggleScope(s.value)}
                />
                {s.label}
              </label>
            ))}
          </div>
        </div>
        {showRepoSelector && repoSelector && onRepoSelectorChange && (
          <div className="space-y-2 border-t pt-4">
            <Label>Repository Access</Label>
            <p className="text-xs text-muted-foreground">
              Restrict which repositories this token can access. Leave empty for
              unrestricted access.
            </p>
            <RepoSelectorForm
              value={repoSelector}
              onChange={onRepoSelectorChange}
            />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending || !name}>
            {isPending ? "Creating..." : submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
