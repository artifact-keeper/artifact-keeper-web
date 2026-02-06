"use client";

import { useParams } from "next/navigation";
import { StagingDetailContent } from "../_components/staging-detail-content";

export default function StagingDetailPage() {
  const params = useParams<{ key: string }>();

  return <StagingDetailContent repoKey={params.key} standalone />;
}
