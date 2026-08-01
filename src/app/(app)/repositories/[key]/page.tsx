"use client";

import { useParams } from "next/navigation";
import { RepoDetailContent } from "../_components/repo-detail-content";
import { useDocumentTitle } from "@/hooks/use-document-title";

export default function RepositoryDetailPage() {
  const params = useParams<{ key: string }>();
  useDocumentTitle(params.key);

  return <RepoDetailContent repoKey={params.key} standalone />;
}
