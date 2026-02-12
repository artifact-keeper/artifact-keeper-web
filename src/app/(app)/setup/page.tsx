"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Code,
  Rocket,
  Package,
  Search,
  Filter,
} from "lucide-react";

import { repositoriesApi } from "@/lib/api/repositories";
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
import { CopyButton } from "@/components/common/copy-button";

// -- types --

interface SetupStep {
  title: string;
  code: string;
  description?: string;
}

interface CICDPlatform {
  key: string;
  name: string;
  description: string;
  steps: SetupStep[];
}

// -- helpers --

const REGISTRY_URL =
  typeof window !== "undefined"
    ? window.location.origin
    : "https://artifacts.example.com";

const REGISTRY_HOST =
  typeof window !== "undefined"
    ? window.location.host
    : "artifacts.example.com";

/** Generate repo-specific setup steps based on format */
function getRepoSetupSteps(repo: Repository): SetupStep[] {
  const repoKey = repo.key;

  switch (repo.format) {
    case "npm":
    case "yarn":
    case "pnpm":
      return [
        {
          title: "Configure registry",
          description: "Add to your .npmrc file or run:",
          code: `npm config set @${repoKey}:registry ${REGISTRY_URL}/api/v1/repositories/${repoKey}/npm/
npm config set //${REGISTRY_HOST}/api/v1/repositories/${repoKey}/npm/:_authToken YOUR_TOKEN`,
        },
        {
          title: "Install a package",
          code: `npm install @${repoKey}/<package-name>`,
        },
        {
          title: "Publish a package",
          code: `npm publish --registry ${REGISTRY_URL}/api/v1/repositories/${repoKey}/npm/`,
        },
      ];
    case "pypi":
    case "poetry":
    case "conda":
      return [
        {
          title: "Configure pip",
          description: "Add to ~/.pip/pip.conf or ~/.config/pip/pip.conf:",
          code: `[global]
index-url = ${REGISTRY_URL}/api/v1/repositories/${repoKey}/pypi/simple/
trusted-host = ${REGISTRY_HOST}`,
        },
        {
          title: "Install a package",
          code: `pip install --index-url ${REGISTRY_URL}/api/v1/repositories/${repoKey}/pypi/simple/ <package-name>`,
        },
        {
          title: "Upload with twine",
          code: `twine upload --repository-url ${REGISTRY_URL}/api/v1/repositories/${repoKey}/pypi/ dist/*`,
        },
      ];
    case "maven":
    case "gradle":
    case "sbt":
      return [
        {
          title: "Configure settings.xml",
          description: "Add to ~/.m2/settings.xml:",
          code: `<settings>
  <servers>
    <server>
      <id>${repoKey}</id>
      <username>YOUR_USERNAME</username>
      <password>YOUR_TOKEN</password>
    </server>
  </servers>
</settings>`,
        },
        {
          title: "Add repository to pom.xml",
          code: `<repositories>
  <repository>
    <id>${repoKey}</id>
    <url>${REGISTRY_URL}/api/v1/repositories/${repoKey}/maven/</url>
  </repository>
</repositories>`,
        },
        { title: "Deploy artifacts", code: "mvn deploy" },
      ];
    case "docker":
    case "podman":
    case "buildx":
    case "oras":
      return [
        {
          title: "Login to registry",
          code: `docker login ${REGISTRY_HOST}`,
        },
        {
          title: "Tag an image",
          code: `docker tag my-image:latest ${REGISTRY_HOST}/${repoKey}/my-image:latest`,
        },
        {
          title: "Push an image",
          code: `docker push ${REGISTRY_HOST}/${repoKey}/my-image:latest`,
        },
        {
          title: "Pull an image",
          code: `docker pull ${REGISTRY_HOST}/${repoKey}/my-image:latest`,
        },
      ];
    case "cargo":
      return [
        {
          title: "Configure Cargo",
          description: "Add to ~/.cargo/config.toml:",
          code: `[registries.${repoKey}]
index = "${REGISTRY_URL}/api/v1/repositories/${repoKey}/cargo/index"
token = "YOUR_TOKEN"`,
        },
        {
          title: "Publish a crate",
          code: `cargo publish --registry ${repoKey}`,
        },
        {
          title: "Add a dependency",
          description: "In Cargo.toml:",
          code: `[dependencies]
my-crate = { version = "0.1", registry = "${repoKey}" }`,
        },
      ];
    case "helm":
    case "helm_oci":
      return [
        {
          title: "Add Helm repository",
          code: `helm repo add ${repoKey} ${REGISTRY_URL}/api/v1/repositories/${repoKey}/helm/
helm repo update`,
        },
        {
          title: "Push a chart",
          code: `helm push my-chart-0.1.0.tgz oci://${REGISTRY_HOST}/${repoKey}/`,
        },
        {
          title: "Install a chart",
          code: `helm install my-release ${repoKey}/my-chart`,
        },
      ];
    case "nuget":
      return [
        {
          title: "Add NuGet source",
          code: `dotnet nuget add source ${REGISTRY_URL}/api/v1/repositories/${repoKey}/nuget/v3/index.json \\
  --name ${repoKey} --username YOUR_USERNAME --password YOUR_TOKEN`,
        },
        {
          title: "Push a package",
          code: `dotnet nuget push MyPackage.1.0.0.nupkg --source ${repoKey} --api-key YOUR_TOKEN`,
        },
        {
          title: "Install a package",
          code: `dotnet add package MyPackage --source ${repoKey}`,
        },
      ];
    case "go":
      return [
        {
          title: "Configure Go proxy",
          code: `export GOPROXY=${REGISTRY_URL}/api/v1/repositories/${repoKey}/go,direct
export GONOSUMCHECK=*`,
        },
        {
          title: "Add a dependency",
          code: "go get example.com/my-module@latest",
        },
      ];
    case "rubygems":
      return [
        {
          title: "Configure Bundler",
          description: "In your Gemfile:",
          code: `source "${REGISTRY_URL}/api/v1/repositories/${repoKey}/rubygems/"`,
        },
        {
          title: "Push a gem",
          code: `gem push my-gem-0.1.0.gem --host ${REGISTRY_URL}/api/v1/repositories/${repoKey}/rubygems/`,
        },
      ];
    case "debian":
      return [
        {
          title: "Add APT repository",
          description: "Add to /etc/apt/sources.list.d/artifact-keeper.list:",
          code: `deb ${REGISTRY_URL}/api/v1/repositories/${repoKey}/debian/ stable main`,
        },
        {
          title: "Update and install",
          code: `sudo apt update
sudo apt install <package-name>`,
        },
      ];
    case "rpm":
      return [
        {
          title: "Add YUM/DNF repository",
          description: "Create /etc/yum.repos.d/artifact-keeper.repo:",
          code: `[${repoKey}]
name=Artifact Keeper - ${repo.name}
baseurl=${REGISTRY_URL}/api/v1/repositories/${repoKey}/rpm/
enabled=1
gpgcheck=0`,
        },
        {
          title: "Install a package",
          code: `sudo dnf install <package-name>`,
        },
      ];
    case "terraform":
    case "opentofu":
      return [
        {
          title: "Configure provider mirror",
          description: "In ~/.terraformrc:",
          code: `provider_installation {
  network_mirror {
    url = "${REGISTRY_URL}/api/v1/repositories/${repoKey}/terraform/"
  }
}`,
        },
      ];
    case "composer":
      return [
        {
          title: "Add Composer repository",
          code: `composer config repositories.${repoKey} composer ${REGISTRY_URL}/api/v1/repositories/${repoKey}/composer/`,
        },
        {
          title: "Require a package",
          code: `composer require vendor/package`,
        },
      ];
    case "alpine":
      return [
        {
          title: "Add APK repository",
          description: "Add to /etc/apk/repositories:",
          code: `${REGISTRY_URL}/api/v1/repositories/${repoKey}/alpine/`,
        },
        {
          title: "Install a package",
          code: `apk add <package-name>`,
        },
      ];
    case "protobuf":
      return [
        {
          title: "Configure buf.yaml",
          description: "Set the registry in your module's buf.yaml:",
          code: `# buf.yaml
version: v2
modules:
  - path: proto
    name: ${REGISTRY_HOST}/proto/${repoKey}/myorg/mymodule`,
        },
        {
          title: "Authenticate with buf CLI",
          code: `buf registry login ${REGISTRY_HOST} --username YOUR_USERNAME --token-stdin <<< "YOUR_TOKEN"`,
        },
        {
          title: "Push a module",
          code: `buf push --registry ${REGISTRY_URL}/proto/${repoKey}`,
        },
        {
          title: "Add a dependency",
          description: "In buf.yaml, add deps and run update:",
          code: `# buf.yaml
deps:
  - ${REGISTRY_HOST}/proto/${repoKey}/owner/module

# Then resolve:
buf dep update`,
        },
      ];
    default:
      return [
        {
          title: "Upload an artifact",
          code: `curl -X PUT -H "Authorization: Bearer YOUR_TOKEN" \\
  -T ./my-file.tar.gz \\
  ${REGISTRY_URL}/api/v1/repositories/${repoKey}/artifacts/my-file.tar.gz`,
        },
        {
          title: "Download an artifact",
          code: `curl -O ${REGISTRY_URL}/api/v1/repositories/${repoKey}/artifacts/my-file.tar.gz`,
        },
      ];
  }
}

// -- CI/CD data --

const CICD_PLATFORMS: CICDPlatform[] = [
  {
    key: "github",
    name: "GitHub Actions",
    description: "GitHub CI/CD workflows",
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
    name: "GitLab CI",
    description: "GitLab pipelines",
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
    name: "Jenkins",
    description: "Jenkins pipelines",
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
    name: "Azure DevOps",
    description: "Azure Pipelines",
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

const FORMAT_CATEGORIES: { key: string; label: string; formats: string[] }[] = [
  {
    key: "core",
    label: "Core",
    formats: ["maven", "gradle", "npm", "pypi", "nuget", "go", "cargo", "rubygems", "generic"],
  },
  {
    key: "container",
    label: "Container",
    formats: ["docker", "helm", "helm_oci", "podman", "buildx", "oras", "wasm_oci"],
  },
  {
    key: "linux",
    label: "Linux",
    formats: ["debian", "rpm", "alpine", "opkg"],
  },
  {
    key: "ecosystem",
    label: "Ecosystem",
    formats: ["poetry", "conda", "yarn", "pnpm", "composer", "cocoapods", "swift", "hex", "pub", "sbt", "cran"],
  },
  {
    key: "infra",
    label: "Infrastructure",
    formats: ["terraform", "opentofu", "chef", "puppet", "ansible", "vagrant"],
  },
  {
    key: "other",
    label: "Other",
    formats: ["generic", "gitlfs", "bazel", "p2", "protobuf", "huggingface", "mlmodel", "vscode", "jetbrains"],
  },
];

// -- CodeBlock component --

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative group">
      <pre className="rounded-lg bg-muted border p-4 text-sm overflow-x-auto whitespace-pre-wrap break-all">
        <code>{code}</code>
      </pre>
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <CopyButton value={code} />
      </div>
    </div>
  );
}

// -- page --

export default function SetupPage() {
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<CICDPlatform | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const { data: repositoriesData } = useQuery({
    queryKey: ["repositories"],
    queryFn: () => repositoriesApi.list({ per_page: 100 }),
  });

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

  const selectedSteps = selectedRepo ? getRepoSetupSteps(selectedRepo) : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Setup Guide"
        description="Configure your build tools and CI/CD pipelines to work with Artifact Keeper."
      />

      <Tabs defaultValue="repositories">
        <TabsList>
          <TabsTrigger value="repositories">
            <Package className="size-4" />
            Repositories
          </TabsTrigger>
          <TabsTrigger value="cicd">
            <Rocket className="size-4" />
            CI/CD Platforms
          </TabsTrigger>
        </TabsList>

        {/* -- Repositories Tab (main) -- */}
        <TabsContent value="repositories" className="mt-6 space-y-4">
          {/* Search + category filter */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search repositories..."
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
              All
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
                {cat.label}
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
                    ? "No repositories available. Create a repository first."
                    : "No repositories match your filters."}
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
                      {repos.length} {repos.length === 1 ? "repository" : "repositories"}
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
                  <p className="font-semibold text-sm">{platform.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {platform.description}
                  </p>
                  <Button className="mt-3" size="sm" variant="outline">
                    Get Started
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
              Set Up: {selectedRepo?.key}
              <Badge variant="secondary" className="text-xs uppercase">
                {selectedRepo?.format}
              </Badge>
            </DialogTitle>
            <DialogDescription>
              Configure your tools to work with the{" "}
              <span className="font-medium text-foreground">{selectedRepo?.name}</span>{" "}
              repository.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-6">
              {selectedSteps.map((step, i) => (
                <div key={i} className="space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <span className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                      {i + 1}
                    </span>
                    {step.title}
                  </h4>
                  {step.description && (
                    <p className="text-sm text-muted-foreground ml-8">
                      {step.description}
                    </p>
                  )}
                  <div className="ml-8">
                    <CodeBlock code={step.code} />
                  </div>
                </div>
              ))}
            </div>
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
          <DialogHeader>
            <DialogTitle>{selectedPlatform?.name} Integration</DialogTitle>
            <DialogDescription>
              Configure {selectedPlatform?.name} to publish and consume
              artifacts from Artifact Keeper.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-6">
              {selectedPlatform?.steps.map((step, i) => (
                <div key={i} className="space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <span className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                      {i + 1}
                    </span>
                    {step.title}
                  </h4>
                  {step.description && (
                    <p className="text-sm text-muted-foreground ml-8">
                      {step.description}
                    </p>
                  )}
                  <div className="ml-8">
                    <CodeBlock code={step.code} />
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>
    </div>
  );
}
