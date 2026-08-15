import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Alert,
  AlertTitle,
  AlertDescription,
} from "@/components/ui/alert";
import { CopyButton } from "@/components/common/copy-button";

interface TokenCreatedAlertProps {
  title: string;
  description: string;
  token: string;
  onDone: () => void;
}

export function TokenCreatedAlert({
  title,
  description,
  token,
  onDone,
}: TokenCreatedAlertProps) {
  const t = useTranslations("common");
  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <Alert
        variant="destructive"
        className="border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800"
      >
        <AlertTriangle className="size-4" />
        <AlertTitle>{t("storeSafely")}</AlertTitle>
        <AlertDescription>
          {t("storeSafelyDescription")}
        </AlertDescription>
      </Alert>
      <div className="flex items-center gap-2 rounded-md border bg-muted p-3">
        <code className="flex-1 break-all text-sm">{token}</code>
        <CopyButton value={token} />
      </div>
      <DialogFooter>
        <Button onClick={onDone}>{t("done")}</Button>
      </DialogFooter>
    </>
  );
}
