"use client";

import { useParams } from "next/navigation";
import { RepoDetailContent } from "../_components/repo-detail-content";

export default function RepositoryDetailPage() {
  const params = useParams<{ key: string }>();

  return <RepoDetailContent repoKey={params.key} standalone />;
}
