"use client";

import { useState, useMemo } from "react";
import {
  Code,
  Rocket,
  Package,
  Search,
  Filter,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { useRepositories } from "@/hooks/use-repositories";
import type { Repository } from "@/types";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

import { PageHeader } from "@/components/common/page-header";
import {
  RepoSetupGuide,
  StepsList,
  type SetupStep,
} from "@/components/setup/repo-setup-guide";

// Re-exported for the #362 tests that import `repoKeyToGradleId` from this page.
export { repoKeyToGradleId } from "@/components/setup/repo-setup-guide";

// -- types --

interface CICDPlatform {
  key: string;
  nameKey: string;
  descriptionKey: string;
  steps: SetupStep[];
}

// -- CI/CD data --

const CICD_PLATFORMS: CICDPlatform[] = [
  {
    key: "github",
    nameKey: "platformGithubActions",
    descriptionKey: "platformGithubActionsDescription",
    steps: [
      {
        title: "Add secrets",
        description:
          "Go to Settings > Secrets and add ARTIFACT_KEEPER_TOKEN and ARTIFACT_KEEPER_URL.",
        code: `# .github/workflows/publish.yml
name: Publish
on:
  push:
    tags: ['v*']

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Publish to Artifact Keeper
        env:
          REGISTRY_URL: \${{ secrets.ARTIFACT_KEEPER_URL }}
          REGISTRY_TOKEN: \${{ secrets.ARTIFACT_KEEPER_TOKEN }}
        run: |
          # Configure and publish your artifacts here`,
      },
    ],
  },
  {
    key: "gitlab",
    nameKey: "platformGitlabCi",
    descriptionKey: "platformGitlabCiDescription",
    steps: [
      {
        title: "Configure .gitlab-ci.yml",
        description:
          "Add CI/CD variables: ARTIFACT_KEEPER_TOKEN and ARTIFACT_KEEPER_URL.",
        code: `# .gitlab-ci.yml
publish:
  stage: deploy
  script:
    - echo "Publishing to $ARTIFACT_KEEPER_URL"
    # Configure and publish your artifacts here
  only:
    - tags`,
      },
    ],
  },
  {
    key: "jenkins",
    nameKey: "platformJenkins",
    descriptionKey: "platformJenkinsDescription",
    steps: [
      {
        title: "Configure Jenkinsfile",
        description: "Store credentials in Jenkins Credential Manager.",
        code: `// Jenkinsfile
pipeline {
    agent any
    environment {
        REGISTRY_CREDS = credentials('artifact-keeper')
    }
    stages {
        stage('Publish') {
            steps {
                sh '''
                    # Configure and publish your artifacts here
                '''
            }
        }
    }
}`,
      },
    ],
  },
  {
    key: "azure",
    nameKey: "platformAzureDevops",
    descriptionKey: "platformAzureDevopsDescription",
    steps: [
      {
        title: "Configure azure-pipelines.yml",
        description:
          "Add service connection for Artifact Keeper in Project Settings.",
        code: `# azure-pipelines.yml
trigger:
  tags:
    include:
      - 'v*'

pool:
  vmImage: 'ubuntu-latest'

steps:
  - script: |
      # Configure and publish your artifacts here
    env:
      REGISTRY_TOKEN: $(ARTIFACT_KEEPER_TOKEN)
    displayName: 'Publish to Artifact Keeper'`,
      },
    ],
  },
];

// -- format categories for filter --

const FORMAT_CATEGORIES: { key: string; labelKey: string; formats: string[] }[] = [
  {
    key: "core",
    labelKey: "categoryCore",
    formats: ["maven", "gradle", "npm", "pypi", "nuget", "go", "cargo", "rubygems", "generic"],
  },
  {
    key: "container",
    labelKey: "categoryContainer",
    formats: ["docker", "helm", "helm_oci", "podman", "buildx", "oras", "wasm_oci", "incus", "lxc"],
  },
  {
    key: "linux",
    labelKey: "categoryLinux",
    formats: ["debian", "rpm", "alpine", "opkg"],
  },
  {
    key: "ecosystem",
    labelKey: "categoryEcosystem",
    formats: ["poetry", "conda", "yarn", "pnpm", "composer", "cocoapods", "swift", "hex", "pub", "sbt", "cran"],
  },
  {
    key: "infra",
    labelKey: "categoryInfrastructure",
    formats: ["terraform", "opentofu", "chef", "puppet", "ansible", "vagrant"],
  },
  {
    key: "other",
    labelKey: "categoryOther",
    formats: ["generic", "gitlfs", "bazel", "p2", "protobuf", "huggingface", "mlmodel", "vscode", "jetbrains"],
  },
];

// -- page --

export default function SetupPage() {
  const t = useTranslations("setup");
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<CICDPlatform | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const { data: repositoriesData } = useRepositories({ per_page: 100 });

  const repositories = repositoriesData?.items ?? [];

  // Filter repos by search and category
  const filteredRepos = useMemo(() => {
    let result = repositories;

    if (categoryFilter !== "all") {
      const category = FORMAT_CATEGORIES.find((c) => c.key === categoryFilter);
      if (category) {
        result = result.filter((r) => category.formats.includes(r.format));
      }
    }

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.key.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q) ||
          r.format.toLowerCase().includes(q)
      );
    }

    return result;
  }, [repositories, categoryFilter, search]);

  // Group filtered repos by format for display
  const reposByFormat = useMemo(() => {
    const map = new Map<string, Repository[]>();
    for (const repo of filteredRepos) {
      const key = repo.format;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(repo);
    }
    // Sort groups alphabetically
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredRepos]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
      />

      <Tabs defaultValue="repositories">
        <TabsList>
          <TabsTrigger value="repositories">
            <Package className="size-4" />
            {t("repositoriesTab")}
          </TabsTrigger>
          <TabsTrigger value="cicd">
            <Rocket className="size-4" />
            {t("cicdTab")}
          </TabsTrigger>
        </TabsList>

        {/* -- Repositories Tab (main) -- */}
        <TabsContent value="repositories" className="mt-6 space-y-4">
          {/* Search + category filter */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder={t("searchPlaceholder")}
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="size-4 text-muted-foreground shrink-0" />
            <Button
              variant={categoryFilter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setCategoryFilter("all")}
            >
              {t("all")}
            </Button>
            {FORMAT_CATEGORIES.map((cat) => (
              <Button
                key={cat.key}
                variant={categoryFilter === cat.key ? "default" : "outline"}
                size="sm"
                onClick={() =>
                  setCategoryFilter(categoryFilter === cat.key ? "all" : cat.key)
                }
              >
                {t(cat.labelKey)}
              </Button>
            ))}
          </div>

          {/* Repos grouped by format */}
          {reposByFormat.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Package className="size-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  {repositories.length === 0
                    ? t("noRepositories")
                    : t("noMatch")}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {reposByFormat.map(([format, repos]) => (
                <div key={format}>
                  <div className="flex items-center gap-2 mb-3">
                    <Badge variant="secondary" className="text-xs uppercase">
                      {format}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {t("repoCount", { count: repos.length })}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {repos.map((repo) => (
                      <Card
                        key={repo.id}
                        className="cursor-pointer hover:border-primary/50 transition-colors"
                        onClick={() => setSelectedRepo(repo)}
                      >
                        <CardContent className="flex items-center gap-3 py-4">
                          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                            <Code className="size-5 text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-sm truncate">
                              {repo.key}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {repo.name !== repo.key ? repo.name : repo.repo_type}
                            </p>
                          </div>
                          <Badge variant="outline" className="text-xs shrink-0">
                            {repo.repo_type}
                          </Badge>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* -- CI/CD Platforms Tab -- */}
        <TabsContent value="cicd" className="mt-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {CICD_PLATFORMS.map((platform) => (
              <Card
                key={platform.key}
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => setSelectedPlatform(platform)}
              >
                <CardContent className="text-center py-6">
                  <div className="flex items-center justify-center mb-3">
                    <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10">
                      <Rocket className="size-6 text-primary" />
                    </div>
                  </div>
                  <p className="font-semibold text-sm">{t(platform.nameKey)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t(platform.descriptionKey)}
                  </p>
                  <Button className="mt-3" size="sm" variant="outline">
                    {t("getStarted")}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* -- Repository Setup Dialog -- */}
      <Dialog
        open={!!selectedRepo}
        onOpenChange={(o) => {
          if (!o) setSelectedRepo(null);
        }}
      >
        <DialogContent className="sm:max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {t("setUpTitle", { key: selectedRepo?.key ?? "" })}
              <Badge variant="secondary" className="text-xs uppercase">
                {selectedRepo?.format}
              </Badge>
            </DialogTitle>
            <DialogDescription>
              {t("setUpDescription", { name: selectedRepo?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            {selectedRepo && <RepoSetupGuide repo={selectedRepo} />}
          </ScrollArea>
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>

      {/* -- CI/CD Platform Dialog -- */}
      <Dialog
        open={!!selectedPlatform}
        onOpenChange={(o) => {
          if (!o) setSelectedPlatform(null);
        }}
      >
        <DialogContent className="sm:max-w-4xl max-h-[80vh]">
          {selectedPlatform && (
            <>
              <DialogHeader>
                <DialogTitle>{t("platformIntegrationTitle", { name: t(selectedPlatform.nameKey) })}</DialogTitle>
                <DialogDescription>
                  {t("platformIntegrationDescription", { name: t(selectedPlatform.nameKey) })}
                </DialogDescription>
              </DialogHeader>
              <ScrollArea className="max-h-[60vh] pr-4">
                <StepsList steps={selectedPlatform.steps} />
              </ScrollArea>
            </>
          )}
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>
    </div>
  );
}
