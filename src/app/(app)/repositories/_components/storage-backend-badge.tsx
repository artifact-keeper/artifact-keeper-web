import { Badge } from "@/components/ui/badge";
import { storageBackendLabel } from "@/lib/storage-backend";
import type { RepositoryStorageBackend } from "@/types";

/**
 * Read-only "Storage: <backend>" badge for the repository header (#918,
 * backend artifact-keeper#4018). Renders nothing when the backend does not
 * report a storage backend.
 */
export function StorageBackendBadge({
  storageBackend,
}: {
  storageBackend?: RepositoryStorageBackend;
}) {
  if (!storageBackend) return null;
  return (
    <Badge
      variant="outline"
      className="text-xs font-normal"
      title="Storage backend (set at creation, cannot be changed)"
    >
      Storage: {storageBackendLabel(storageBackend)}
    </Badge>
  );
}
