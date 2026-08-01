"use client";

import { useParams } from "next/navigation";
import { StagingDetailContent } from "../_components/staging-detail-content";
import { useDocumentTitle } from "@/hooks/use-document-title";

export default function StagingDetailPage() {
  const params = useParams<{ key: string }>();
  useDocumentTitle(`Staging: ${params.key}`);

  return <StagingDetailContent repoKey={params.key} standalone />;
}
