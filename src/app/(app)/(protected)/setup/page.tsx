"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Code,
  Rocket,
  Wrench,
  Copy,
  Check,
  Package,
  Container,
} from "lucide-react";
import { toast } from "sonner";

import { repositoriesApi } from "@/lib/api/repositories";
import type { Repository } from "@/types";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
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

interface PackageFormat {
  key: string;
  name: string;
  description: string;
  steps: SetupStep[];
}

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

// -- data --

const REGISTRY_URL = typeof window !== "undefined" ? window.location.origin : "https://artifacts.example.com";

const PACKAGE_FORMATS: PackageFormat[] = [
  {
    key: "npm",
    name: "npm",
    description: "Node.js packages",
    steps: [
      {
        title: "Configure npm registry",
        description: "Add this to your .npmrc file or run the command:",
        code: `npm config set registry ${REGISTRY_URL}/api/v1/npm/
npm config set //${new URL(REGISTRY_URL).host}/api/v1/npm/:_authToken YOUR_TOKEN`,
      },
      {
        title: "Publish a package",
        code: "npm publish",
      },
      {
        title: "Install packages",
        code: "npm install <package-name>",
      },
    ],
  },
  {
    key: "pypi",
    name: "PyPI (pip)",
    description: "Python packages",
    steps: [
      {
        title: "Configure pip",
        description: "Add to ~/.pip/pip.conf or ~/.config/pip/pip.conf:",
        code: `[global]
index-url = ${REGISTRY_URL}/api/v1/pypi/simple/
trusted-host = ${new URL(REGISTRY_URL).host}`,
      },
      {
        title: "Upload with twine",
        code: `twine upload --repository-url ${REGISTRY_URL}/api/v1/pypi/ dist/*`,
      },
      {
        title: "Install packages",
        code: `pip install --index-url ${REGISTRY_URL}/api/v1/pypi/simple/ <package-name>`,
      },
    ],
  },
  {
    key: "maven",
    name: "Maven",
    description: "Java/JVM artifacts",
    steps: [
      {
        title: "Configure settings.xml",
        description: "Add to ~/.m2/settings.xml:",
        code: `<settings>
  <servers>
    <server>
      <id>artifact-keeper</id>
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
    <id>artifact-keeper</id>
    <url>${REGISTRY_URL}/api/v1/maven/</url>
  </repository>
</repositories>`,
      },
      {
        title: "Deploy artifacts",
        code: "mvn deploy",
      },
    ],
  },
  {
    key: "docker",
    name: "Docker",
    description: "Container images",
    steps: [
      {
        title: "Login to registry",
        code: `docker login ${new URL(REGISTRY_URL).host}`,
      },
      {
        title: "Tag an image",
        code: `docker tag my-image:latest ${new URL(REGISTRY_URL).host}/my-repo/my-image:latest`,
      },
      {
        title: "Push an image",
        code: `docker push ${new URL(REGISTRY_URL).host}/my-repo/my-image:latest`,
      },
      {
        title: "Pull an image",
        code: `docker pull ${new URL(REGISTRY_URL).host}/my-repo/my-image:latest`,
      },
    ],
  },
  {
    key: "cargo",
    name: "Cargo",
    description: "Rust crates",
    steps: [
      {
        title: "Configure Cargo",
        description: "Add to ~/.cargo/config.toml:",
        code: `[registries.artifact-keeper]
index = "${REGISTRY_URL}/api/v1/cargo/index"
token = "YOUR_TOKEN"`,
      },
      {
        title: "Publish a crate",
        code: "cargo publish --registry artifact-keeper",
      },
      {
        title: "Add a dependency",
        description: "In Cargo.toml:",
        code: `[dependencies]
my-crate = { version = "0.1", registry = "artifact-keeper" }`,
      },
    ],
  },
  {
    key: "helm",
    name: "Helm",
    description: "Kubernetes charts",
    steps: [
      {
        title: "Add Helm repository",
        code: `helm repo add artifact-keeper ${REGISTRY_URL}/api/v1/helm/
helm repo update`,
      },
      {
        title: "Push a chart",
        code: `helm push my-chart-0.1.0.tgz oci://${new URL(REGISTRY_URL).host}/helm/`,
      },
      {
        title: "Install a chart",
        code: "helm install my-release artifact-keeper/my-chart",
      },
    ],
  },
  {
    key: "nuget",
    name: "NuGet",
    description: ".NET packages",
    steps: [
      {
        title: "Add NuGet source",
        code: `dotnet nuget add source ${REGISTRY_URL}/api/v1/nuget/v3/index.json --name ArtifactKeeper --username YOUR_USERNAME --password YOUR_TOKEN`,
      },
      {
        title: "Push a package",
        code: `dotnet nuget push MyPackage.1.0.0.nupkg --source ArtifactKeeper --api-key YOUR_TOKEN`,
      },
      {
        title: "Install a package",
        code: "dotnet add package MyPackage --source ArtifactKeeper",
      },
    ],
  },
  {
    key: "go",
    name: "Go",
    description: "Go modules",
    steps: [
      {
        title: "Configure Go proxy",
        code: `export GOPROXY=${REGISTRY_URL}/api/v1/go,direct
export GONOSUMCHECK=*`,
      },
      {
        title: "Add a dependency",
        code: "go get example.com/my-module@latest",
      },
    ],
  },
];

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
        description: "Add CI/CD variables: ARTIFACT_KEEPER_TOKEN and ARTIFACT_KEEPER_URL.",
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
        description:
          "Store credentials in Jenkins Credential Manager.",
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

// -- CodeBlock component --

function CodeBlock({ code, className }: { code: string; className?: string }) {
  return (
    <div className="relative group">
      <pre
        className={`rounded-lg bg-muted border p-4 text-sm overflow-x-auto ${className ?? ""}`}
      >
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
  const [selectedFormat, setSelectedFormat] = useState<PackageFormat | null>(
    null
  );
  const [selectedPlatform, setSelectedPlatform] =
    useState<CICDPlatform | null>(null);

  const { data: repositoriesData } = useQuery({
    queryKey: ["repositories"],
    queryFn: () => repositoriesApi.list({ per_page: 100 }),
  });

  const repositories = repositoriesData?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Set Me Up"
        description="Configure your build tools and CI/CD pipelines to work with Artifact Keeper."
      />

      <Tabs defaultValue="package-managers">
        <TabsList>
          <TabsTrigger value="package-managers">
            <Package className="size-4" />
            Package Managers
          </TabsTrigger>
          <TabsTrigger value="cicd">
            <Rocket className="size-4" />
            CI/CD Platforms
          </TabsTrigger>
          <TabsTrigger value="repositories">
            <Wrench className="size-4" />
            By Repository
          </TabsTrigger>
        </TabsList>

        {/* -- Package Managers Tab -- */}
        <TabsContent value="package-managers" className="mt-6 space-y-6">
          <Card>
            <CardContent className="flex items-center justify-between py-4">
              <div>
                <h3 className="font-semibold">Quick Setup</h3>
                <p className="text-sm text-muted-foreground">
                  Get started with your preferred package manager
                </p>
              </div>
            </CardContent>
          </Card>

          <h3 className="text-lg font-semibold">Available Package Formats</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {PACKAGE_FORMATS.map((format) => (
              <Card
                key={format.key}
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => setSelectedFormat(format)}
              >
                <CardContent className="text-center py-6">
                  <div className="flex items-center justify-center mb-3">
                    <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10">
                      <Code className="size-6 text-primary" />
                    </div>
                  </div>
                  <p className="font-semibold text-sm">{format.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {format.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* -- CI/CD Platforms Tab -- */}
        <TabsContent value="cicd" className="mt-6 space-y-6">
          <Card>
            <CardContent className="flex items-center justify-between py-4">
              <div>
                <h3 className="font-semibold">CI/CD Integration</h3>
                <p className="text-sm text-muted-foreground">
                  Configure your CI/CD pipelines to publish and consume
                  artifacts
                </p>
              </div>
            </CardContent>
          </Card>

          <h3 className="text-lg font-semibold">Supported Platforms</h3>
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

        {/* -- By Repository Tab -- */}
        <TabsContent value="repositories" className="mt-6 space-y-4">
          <h3 className="text-lg font-semibold">Configure by Repository</h3>
          <p className="text-sm text-muted-foreground">
            Select a repository to get specific configuration instructions.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {repositories.map((repo) => {
              const format = PACKAGE_FORMATS.find(
                (f) => f.key === repo.format
              );
              return (
                <Card
                  key={repo.id}
                  className="cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => {
                    if (format) {
                      setSelectedFormat(format);
                    } else {
                      toast.info(
                        `Setup instructions for ${repo.format} format coming soon.`
                      );
                    }
                  }}
                >
                  <CardContent className="flex items-center gap-3 py-4">
                    <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                      <Code className="size-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">
                        {repo.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {repo.format.toUpperCase()} &middot; {repo.repo_type}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {repositories.length === 0 && (
              <Card className="col-span-full">
                <CardContent className="py-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    No repositories available. Create a repository first to get
                    configuration instructions.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* -- Format Setup Dialog -- */}
      <Dialog
        open={!!selectedFormat}
        onOpenChange={(o) => {
          if (!o) setSelectedFormat(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>
              {selectedFormat?.name} Setup
            </DialogTitle>
            <DialogDescription>
              Follow these steps to configure {selectedFormat?.name} to
              work with Artifact Keeper.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-6">
              {selectedFormat?.steps.map((step, i) => (
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
        <DialogContent className="sm:max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>
              {selectedPlatform?.name} Integration
            </DialogTitle>
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
