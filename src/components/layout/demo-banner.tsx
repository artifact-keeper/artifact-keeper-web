"use client";

import { useState, useEffect } from "react";

export function DemoBanner() {
  const [demoMode, setDemoMode] = useState(false);

  useEffect(() => {
    fetch("/health")
      .then((res) => res.json())
      .then((data) => setDemoMode(data.demo_mode === true))
      .catch(() => {});
  }, []);

  if (!demoMode) return null;

  return (
    <div className="sticky top-0 z-50 border-b border-yellow-300 bg-yellow-50 px-4 py-2 text-center text-sm text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950 dark:text-yellow-200">
      This is a read-only demo &mdash; logged in as admin.{" "}
      <a
        href="https://artifactkeeper.com"
        className="font-semibold underline underline-offset-2"
      >
        Deploy your own instance &rarr;
      </a>
    </div>
  );
}
