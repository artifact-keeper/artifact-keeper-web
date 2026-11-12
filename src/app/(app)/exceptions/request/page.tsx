"use client";

import { useDocumentTitle } from "@/hooks/use-document-title";

import { Suspense, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { HelpCircle, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import {
  exceptionsApi,
  EXCEPTION_GATES,
  type ExceptionGate,
} from "@/lib/api/exceptions";
import { toUserMessage } from "@/lib/error-utils";
import { ApiError, apiErrorMessage } from "@/lib/api/fetch";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

const GATE_LABEL: Record<ExceptionGate, string> = {
  age: "It is too new",
  scan: "It has vulnerabilities",
  curation: "A rule blocks it",
};

/** Each open request a user may hold at once, per the backend. */
const MAX_OPEN_REQUESTS = 50;

/** What to tell the asker when the backend refuses the request. */
function requestErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const said = apiErrorMessage(err);
    // A backend without the exception queue 404s this route with no body.
    // "API error 404" tells the asker nothing they can act on, so name the
    // cause instead. A 404 that carries the backend's own message ("Repository
    // not found" for a key they mistyped or cannot see) is about the request,
    // not the server, so that message is shown as is.
    if (err.status === 404 && said === null) {
      return "This server does not accept exception requests yet. Ask an administrator to review the package directly.";
    }
    if (err.status === 404) {
      return `${said} Check the repository key, and that you can see the repository.`;
    }
    // The backend caps how many undecided requests one person may hold.
    if (err.status === 409) {
      return `You already have ${MAX_OPEN_REQUESTS} open exception requests. Wait for a reviewer to decide some of them, then ask again.`;
    }
    // An unknown gate or a missing or oversized field; the backend names it.
    if (err.status === 400 && said) {
      return `The request was not accepted: ${said}`;
    }
  }
  return toUserMessage(err, "Could not send the request");
}

/**
 * Ask the security team to unblock a package.
 *
 * Deliberately NOT behind a capability guard: any authenticated user may ask.
 * The backend still checks that the repository is visible to them, bounds the
 * justification, and refuses an unknown gate.
 *
 * The fields are prefilled from the query string so the URL in a refusal
 * message can drop someone straight in with the coordinate already filled.
 */
function RequestExceptionForm() {
  useDocumentTitle("Request a package exception");
  const params = useSearchParams();

  const [repositoryKey, setRepositoryKey] = useState(params.get("repo") ?? "");
  const [packageName, setPackageName] = useState(params.get("package") ?? "");
  const [packageVersion, setPackageVersion] = useState(
    params.get("version") ?? "",
  );
  const initialGate = params.get("gate");
  const [gate, setGate] = useState<ExceptionGate>(
    (EXCEPTION_GATES as readonly string[]).includes(initialGate ?? "")
      ? (initialGate as ExceptionGate)
      : "scan",
  );
  const [justification, setJustification] = useState("");
  const [done, setDone] = useState(false);

  const submit = useMutation({
    mutationFn: () =>
      exceptionsApi.request({
        repositoryKey,
        gate,
        packageName,
        packageVersion,
        justification,
      }),
    onSuccess: () => {
      setDone(true);
      toast.success("Request sent to the security team");
    },
    onError: (err: unknown) => toast.error(requestErrorMessage(err)),
  });

  const incomplete =
    repositoryKey.trim() === "" ||
    packageName.trim() === "" ||
    justification.trim() === "";

  if (done) {
    return (
      <div className="mx-auto max-w-xl space-y-4 p-6 text-center">
        <CheckCircle2 className="mx-auto size-10 text-emerald-600 dark:text-emerald-500" />
        <h1 className="text-xl font-semibold">Request sent</h1>
        <p className="text-sm text-muted-foreground">
          The security team can see it now. You will still be blocked until
          someone grants the exception, so if the build is urgent, say so
          wherever your team tracks that.
        </p>
        <Button variant="outline" onClick={() => setDone(false)}>
          Request another
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 p-6">
      <div className="flex items-center gap-2">
        <HelpCircle className="size-6" />
        <div>
          <h1 className="text-xl font-semibold">Request a package exception</h1>
          <p className="text-sm text-muted-foreground">
            Ask the security team to unblock a package they are currently
            withholding. You can ask before you are blocked.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="req-repo">Repository</Label>
          <Input
            id="req-repo"
            value={repositoryKey}
            onChange={(e) => setRepositoryKey(e.target.value)}
            placeholder="npm-remote"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="req-pkg">Package</Label>
          <Input
            id="req-pkg"
            value={packageName}
            onChange={(e) => setPackageName(e.target.value)}
            placeholder="lodash"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="req-ver">Version</Label>
          <Input
            id="req-ver"
            value={packageVersion}
            onChange={(e) => setPackageVersion(e.target.value)}
            placeholder="Leave blank for the whole package"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="req-gate">Why do you think it is blocked?</Label>
          <Select value={gate} onValueChange={(v) => setGate(v as ExceptionGate)}>
            <SelectTrigger id="req-gate" aria-label="Reason it is blocked">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXCEPTION_GATES.map((g) => (
                <SelectItem key={g} value={g}>
                  {GATE_LABEL[g]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            If you are not sure, check the error your package manager printed.
            Each reason is excepted separately, so a grant for the wrong one
            does not unblock the package.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="req-why">Why do you need it?</Label>
          <Textarea
            id="req-why"
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            placeholder="What breaks without it, and anything you know about the risk"
            rows={4}
          />
        </div>

        {incomplete && (
          <p id="req-incomplete" className="text-xs text-muted-foreground">
            Fill in the repository, the package and why you need it before
            sending.
          </p>
        )}
        <Button
          className="w-full"
          disabled={incomplete || submit.isPending}
          aria-describedby={incomplete ? "req-incomplete" : undefined}
          onClick={() => submit.mutate()}
        >
          {submit.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Send request
        </Button>
      </div>
    </div>
  );
}

/**
 * `useSearchParams` opts the tree into client rendering, which Next refuses
 * to prerender without a boundary, so the page is the boundary and the form
 * is what it suspends.
 */
export default function RequestExceptionPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <RequestExceptionForm />
    </Suspense>
  );
}
