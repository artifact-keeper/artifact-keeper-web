"use client";

import type { Repository, RepositoryType } from "@/types";

import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { CopyButton } from "@/components/common/copy-button";

// -- types --

export interface SetupStep {
  title: string;
  code: string;
  description?: string;
}

/** A single client variant for a repository format (e.g. Maven vs. Gradle for a
 *  JVM repo). The Setup dialog renders one tab per variant when present. */
interface SetupClientVariant {
  key: string;
  label: string;
  steps: SetupStep[];
}

/** Setup content for a repository — either a flat list of steps (most formats)
 *  or a set of client-tool variants (e.g. JVM repos serve Maven, Gradle Groovy,
 *  Gradle Kotlin DSL, and SBT clients from the same wire format). */
type RepoSetupContent =
  | { kind: "steps"; steps: SetupStep[] }
  | { kind: "variants"; variants: SetupClientVariant[]; defaultKey: string };

// -- helpers --

// SSR-safe placeholders that are obviously non-functional so the prerendered
// HTML doesn't ship with a real-looking domain (`artifacts.example.com`)
// that a user might copy into a config file before the client hydrates and
// rewrites them. After hydration `typeof window !== "undefined"` flips and
// the snippets contain the live origin (#362).
const REGISTRY_URL_PLACEHOLDER = "__REPLACE_WITH_REGISTRY_URL__";
const REGISTRY_HOST_PLACEHOLDER = "__REPLACE_WITH_REGISTRY_HOST__";

const REGISTRY_URL =
  typeof window !== "undefined"
    ? window.location.origin
    : REGISTRY_URL_PLACEHOLDER;

const REGISTRY_HOST =
  typeof window !== "undefined"
    ? window.location.host
    : REGISTRY_HOST_PLACEHOLDER;

/**
 * Sanitize a repo key into a Gradle/SBT-friendly camelCase identifier for
 * property names. Repo keys like `my-jvm-repo` are legal in `gradle.properties`
 * (the file format permits hyphens and dots), but they look wrong to readers
 * who assume identifier rules apply. Convert kebab/dot/underscore-case to
 * camelCase and strip any remaining non-alphanumerics. URLs and `<id>` slots
 * keep the raw key — only property names need this. (#362)
 */
export function repoKeyToGradleId(key: string): string {
  if (!key) return "repo";
  const camel = key.replace(/[-._\s]+(.)/g, (_, c: string) => c.toUpperCase());
  const cleaned = camel.replace(/[^a-zA-Z0-9]/g, "");
  return cleaned.length > 0 ? cleaned : "repo";
}

/** Build the JVM client variants (Maven, Gradle Groovy DSL, Gradle Kotlin DSL,
 *  SBT). All four clients consume the same Maven-format wire repository, so we
 *  surface tabs for each. */
function getJvmClientVariants(repoKey: string): SetupClientVariant[] {
  const repoUrl = `${REGISTRY_URL}/maven/${repoKey}/`;
  // Keep `repoKey` in URLs and `<id>` slots; sanitize for Gradle property
  // names so `my-jvm-repo` doesn't emit `my-jvm-repoUsername` (#362).
  const gradleId = repoKeyToGradleId(repoKey);
  const gradleCredentials: SetupStep = {
    title: "Configure credentials",
    description: "Add to ~/.gradle/gradle.properties:",
    code: `${gradleId}Username=YOUR_USERNAME
${gradleId}Password=YOUR_TOKEN`,
  };
  const gradlePublish: SetupStep = { title: "Publish artifacts", code: "gradle publish" };

  return [
    {
      key: "maven",
      label: "Maven",
      steps: [
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
    <url>${repoUrl}</url>
  </repository>
</repositories>
<dependency>
  <groupId>com.example</groupId>
  <artifactId>your-artifact</artifactId>
  <version>1.0.0</version>
</dependency>`,
        },
        { title: "Deploy artifacts", code: "mvn deploy" },
      ],
    },
    {
      key: "gradle-groovy",
      label: "Gradle (Groovy)",
      steps: [
        gradleCredentials,
        {
          title: "Add repository to build.gradle",
          code: `repositories {
    maven {
        url '${repoUrl}'
        credentials {
            username = project.findProperty('${gradleId}Username')
            password = project.findProperty('${gradleId}Password')
        }
    }
}
dependencies {
    implementation 'com.example:your-artifact:1.0.0'
}`,
        },
        gradlePublish,
      ],
    },
    {
      key: "gradle-kotlin",
      label: "Gradle (Kotlin)",
      steps: [
        gradleCredentials,
        {
          title: "Add repository to build.gradle.kts",
          code: `repositories {
    maven {
        url = uri("${repoUrl}")
        credentials {
            username = project.findProperty("${gradleId}Username") as String?
            password = project.findProperty("${gradleId}Password") as String?
        }
    }
}
dependencies {
    implementation("com.example:your-artifact:1.0.0")
}`,
        },
        gradlePublish,
      ],
    },
    {
      key: "sbt",
      label: "SBT",
      steps: [
        {
          title: "Configure credentials",
          description: "Add to ~/.sbt/.credentials:",
          code: `realm=Artifact Keeper
host=${REGISTRY_HOST}
user=YOUR_USERNAME
password=YOUR_TOKEN`,
        },
        {
          title: "Add resolver to build.sbt",
          code: `credentials += Credentials(Path.userHome / ".sbt" / ".credentials")
resolvers += "${repoKey}" at "${repoUrl}"
libraryDependencies += "com.example" %% "your-artifact" % "1.0.0"`,
        },
        { title: "Publish artifacts", code: "sbt publish" },
      ],
    },
  ];
}

/** Default JVM-variant tab keyed by the repo's declared format. A "Gradle" repo
 *  opens on Gradle (Groovy DSL is the more common variant in the wild) so the
 *  user doesn't have to click an extra tab to reach their tooling. */
const JVM_DEFAULT_VARIANT: Record<"maven" | "gradle" | "sbt", string> = {
  maven: "maven",
  gradle: "gradle-groovy",
  sbt: "sbt",
};

/** Build the npm-registry client variants (Npm, Yarn (v2+), Pnpm, Bun). All
 *  consume the same npm-registry wire format. Yarn Classic (v1) reads `.npmrc`
 *  like npm/pnpm/Bun, so v1 users can follow the Npm tab.
 *
 *  The config shape depends on the repo type:
 *    - remote/virtual: the repo proxies (or aggregates) upstream registries,
 *      so we configure it as the *default* registry. Every install — scoped
 *      or not — flows through it. Scoped routing (`@foo:registry=...`) would
 *      only catch `@foo/*` packages and miss everything else.
 *    - local/staging: the repo hosts packages you publish, typically under a
 *      scope. Scoped routing leaves public packages to the public npm
 *      registry while routing `@scope/*` to the artifact keeper.
 */
function getNpmClientVariants(
  repoKey: string,
  repoType: RepositoryType,
): SetupClientVariant[] {
  const registryUrl = `${REGISTRY_URL}/npm/${repoKey}/`;
  const authLine = `//${REGISTRY_HOST}/npm/${repoKey}/:_authToken=YOUR_TOKEN`;
  const isProxy = repoType === "remote" || repoType === "virtual";

  // .npmrc — read by pnpm and Bun. For proxies we set the *default* registry
  // (every install flows through the repo); for hosted repos we scope-route
  // so only `@key/*` packages hit the artifact keeper.
  const npmrcConfig = isProxy
    ? `registry=${registryUrl}
${authLine}`
    : `@${repoKey}:registry=${registryUrl}
${authLine}`;

  // npm CLI form — same proxy-vs-scope split, expressed as `npm config set`.
  const npmCliConfig = isProxy
    ? `npm config set registry ${registryUrl}
npm config set //${REGISTRY_HOST}/npm/${repoKey}/:_authToken YOUR_TOKEN`
    : `npm config set @${repoKey}:registry ${registryUrl}
npm config set //${REGISTRY_HOST}/npm/${repoKey}/:_authToken YOUR_TOKEN`;

  // .yarnrc.yml — same proxy-vs-scope reasoning as .npmrc.
  const yarnrcConfig = isProxy
    ? `npmRegistryServer: "${registryUrl}"

npmRegistries:
  "${registryUrl}":
    npmAlwaysAuth: true
    npmAuthToken: "YOUR_TOKEN"`
    : `npmScopes:
  ${repoKey}:
    npmRegistryServer: "${registryUrl}"

npmRegistries:
  "${registryUrl}":
    npmAlwaysAuth: true
    npmAuthToken: "YOUR_TOKEN"`;

  const installExample = isProxy ? "<package-name>" : `@${repoKey}/<package-name>`;

  return [
    {
      key: "npm",
      label: "Npm",
      steps: [
        {
          title: "Configure registry",
          description: "Run:",
          code: npmCliConfig,
        },
        { title: "Install a package", code: `npm install ${installExample}` },
        { title: "Publish a package", code: `npm publish --registry ${registryUrl}` },
      ],
    },
    {
      key: "yarn-berry",
      label: "Yarn (v2+)",
      steps: [
        {
          title: "Configure registry",
          description: "Add to .yarnrc.yml (project root):",
          code: yarnrcConfig,
        },
        { title: "Install a package", code: `yarn add ${installExample}` },
        { title: "Publish a package", code: "yarn npm publish" },
      ],
    },
    {
      key: "pnpm",
      label: "Pnpm",
      steps: [
        {
          title: "Configure registry",
          description: "Add to ~/.npmrc:",
          code: npmrcConfig,
        },
        { title: "Install a package", code: `pnpm add ${installExample}` },
        { title: "Publish a package", code: `pnpm publish --registry ${registryUrl}` },
      ],
    },
    {
      key: "bun",
      label: "Bun",
      steps: [
        {
          title: "Configure registry",
          description: "Add to ~/.npmrc:",
          code: npmrcConfig,
        },
        { title: "Install a package", code: `bun add ${installExample}` },
        { title: "Publish a package", code: `bun publish --registry ${registryUrl}` },
      ],
    },
  ];
}

/** Default npm-variant tab keyed by the repo's declared format. */
const NPM_DEFAULT_VARIANT: Record<"npm" | "yarn" | "pnpm", string> = {
  npm: "npm",
  yarn: "yarn-berry",
  pnpm: "pnpm",
};

/** Build the PyPI-Simple client variants (pip, Poetry, uv, Pipenv, twine). All
 *  consume the same PyPI Simple wire format; twine is upload-only with its own
 *  .pypirc config so it gets its own tab rather than being mixed into pip. */
function getPypiClientVariants(repoKey: string): SetupClientVariant[] {
  const simpleUrl = `${REGISTRY_URL}/pypi/${repoKey}/simple/`;
  const uploadUrl = `${REGISTRY_URL}/pypi/${repoKey}/`;
  // uv reads UV_INDEX_<NAME>_USERNAME/PASSWORD where <NAME> uppercases the
  // index name and non-alphanumerics become underscores (e.g. "my-pypi" → MY_PYPI).
  const uvEnvName = repoKey.toUpperCase().replace(/[^A-Z0-9]/g, "_");

  return [
    {
      key: "pip",
      label: "Pip",
      steps: [
        {
          title: "Configure index",
          description: "Add to ~/.pip/pip.conf:",
          code: `[global]
index-url = ${simpleUrl}
trusted-host = ${REGISTRY_HOST}`,
        },
        {
          title: "Install a package",
          code: `pip install --index-url ${simpleUrl} <package-name>`,
        },
      ],
    },
    {
      key: "poetry",
      label: "Poetry",
      steps: [
        {
          title: "Configure source",
          description:
            "Run. Use `__token__` as the username for access tokens not scoped to a user; otherwise use your login:",
          code: `poetry source add ${repoKey} ${simpleUrl}
poetry config http-basic.${repoKey} __token__ YOUR_TOKEN`,
        },
        {
          title: "Install a package",
          code: `poetry add --source ${repoKey} <package-name>`,
        },
        {
          title: "Publish a package",
          code: `poetry publish --repository ${repoKey}`,
        },
      ],
    },
    {
      key: "uv",
      label: "Uv",
      steps: [
        {
          title: "Configure index",
          description: "Add to pyproject.toml:",
          code: `[[tool.uv.index]]
name = "${repoKey}"
url = "${simpleUrl}"`,
        },
        {
          title: "Set credentials",
          description:
            "uv reads credentials from environment variables (name uppercased, non-alphanumerics → _). Use `__token__` as the username for unscoped access tokens:",
          code: `export UV_INDEX_${uvEnvName}_USERNAME=__token__
export UV_INDEX_${uvEnvName}_PASSWORD=YOUR_TOKEN`,
        },
        { title: "Install a package", code: "uv add <package-name>" },
      ],
    },
    {
      key: "pipenv",
      label: "Pipenv",
      steps: [
        {
          title: "Configure source",
          description:
            "Add to Pipfile. Use `__token__` as the username for an access token; otherwise use your login:",
          code: `[[source]]
name = "${repoKey}"
url = "https://__token__:YOUR_TOKEN@${REGISTRY_HOST}/pypi/${repoKey}/simple/"
verify_ssl = true`,
        },
        { title: "Install a package", code: "pipenv install <package-name>" },
      ],
    },
    {
      key: "twine",
      label: "Twine",
      steps: [
        {
          title: "Configure repository",
          description:
            "Add to ~/.pypirc. Use `__token__` as the username for an access token; otherwise use your login:",
          code: `[distutils]
index-servers =
    ${repoKey}

[${repoKey}]
repository = ${uploadUrl}
username = __token__
password = YOUR_TOKEN`,
        },
        {
          title: "Upload a distribution",
          code: `twine upload --repository ${repoKey} dist/*`,
        },
      ],
    },
  ];
}

/** Default PyPI-variant tab keyed by the repo's declared format. */
const PYPI_DEFAULT_VARIANT: Record<"pypi" | "poetry", string> = {
  pypi: "pip",
  poetry: "poetry",
};

/** Generate repo-specific setup content based on format. JVM, npm, and PyPI
 *  formats return a set of client variants (rendered as tabs); all other
 *  formats return a flat list of steps. */
function getRepoSetupContent(repo: Repository): RepoSetupContent {
  if (repo.format === "maven" || repo.format === "gradle" || repo.format === "sbt") {
    return {
      kind: "variants",
      variants: getJvmClientVariants(repo.key),
      defaultKey: JVM_DEFAULT_VARIANT[repo.format],
    };
  }
  if (repo.format === "npm" || repo.format === "yarn" || repo.format === "pnpm") {
    return {
      kind: "variants",
      variants: getNpmClientVariants(repo.key, repo.repo_type),
      defaultKey: NPM_DEFAULT_VARIANT[repo.format],
    };
  }
  if (repo.format === "pypi" || repo.format === "poetry") {
    return {
      kind: "variants",
      variants: getPypiClientVariants(repo.key),
      defaultKey: PYPI_DEFAULT_VARIANT[repo.format],
    };
  }
  return { kind: "steps", steps: getRepoSetupSteps(repo) };
}

/** Generate repo-specific setup steps for non-JVM formats. */
function getRepoSetupSteps(repo: Repository): SetupStep[] {
  const repoKey = repo.key;

  switch (repo.format) {
    case "conda":
      // Conda has its own wire format (repodata.json), not PyPI Simple — it
      // belongs with format-specific tooling, not the pypi-variants group.
      // TODO: replace this pip-style placeholder with real conda channel setup.
      return [
        {
          title: "Configure pip",
          description: "Add to ~/.pip/pip.conf or ~/.config/pip/pip.conf:",
          code: `[global]
index-url = ${REGISTRY_URL}/pypi/${repoKey}/simple/
trusted-host = ${REGISTRY_HOST}`,
        },
        {
          title: "Install a package",
          code: `pip install --index-url ${REGISTRY_URL}/pypi/${repoKey}/simple/ <package-name>`,
        },
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
    case "incus":
    case "lxc":
      return [
        {
          title: "Add as SimpleStreams remote",
          code: `incus remote add ${repoKey} ${REGISTRY_URL}/incus/${repoKey} \\
  --protocol simplestreams --public`,
        },
        {
          title: "Upload an image",
          code: `curl -X PUT -u admin:password \\
  -H "Content-Type: application/x-xz" \\
  --data-binary @image.tar.xz \\
  ${REGISTRY_URL}/incus/${repoKey}/images/ubuntu-noble/20240215/incus.tar.xz`,
        },
        {
          title: "List images",
          code: `incus image list ${repoKey}:`,
        },
        {
          title: "Launch a container",
          code: `incus launch ${repoKey}:ubuntu-noble my-container`,
        },
      ];
    case "cargo":
      return [
        {
          title: "Configure Cargo",
          description: "Add to ~/.cargo/config.toml:",
          code: `[registries.${repoKey}]
index = "${REGISTRY_URL}/cargo/${repoKey}/index"
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
          code: `helm repo add ${repoKey} ${REGISTRY_URL}/helm/${repoKey}/
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
          code: `dotnet nuget add source ${REGISTRY_URL}/nuget/${repoKey}/v3/index.json \\
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
    case "pub":
      return [
        {
          title: "Point the Dart client at this repository",
          description:
            "dart and flutter read the registry location from PUB_HOSTED_URL:",
          code: `export PUB_HOSTED_URL=${REGISTRY_URL}/pub/${repoKey}`,
        },
        {
          title: "Authenticate",
          code: `dart pub token add ${REGISTRY_URL}/pub/${repoKey}`,
        },
        {
          title: "Add a dependency",
          description: "In pubspec.yaml:",
          code: `dependencies:
  my_package:
    hosted: ${REGISTRY_URL}/pub/${repoKey}
    version: ^1.0.0`,
        },
        {
          title: "Resolve dependencies",
          code: `dart pub get   # or: flutter pub get`,
        },
        {
          title: "Publish a package",
          code: `dart pub publish`,
        },
      ];
    case "go":
      return [
        {
          title: "Configure Go proxy",
          code: `export GOPROXY=${REGISTRY_URL}/go/${repoKey},direct
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
          code: `source "${REGISTRY_URL}/gems/${repoKey}/"`,
        },
        {
          title: "Push a gem",
          code: `gem push my-gem-0.1.0.gem --host ${REGISTRY_URL}/gems/${repoKey}/`,
        },
      ];
    case "debian":
      return [
        {
          title: "Add repository signing key",
          code: `sudo mkdir -m 0755 -p /etc/apt/keyrings
sudo curl -Lo /etc/apt/keyrings/artifact-keeper.gpg.asc ${REGISTRY_URL}/debian/${repoKey}/gpg-key.asc`,
        },
        {
          title: "Add APT repository (single-line, old)",
          description: "Add to /etc/apt/sources.list.d/artifact-keeper.list:",
          code: `deb [signed-by=/etc/apt/keyrings/artifact-keeper.gpg.asc] ${REGISTRY_URL}/debian/${repoKey}/ stable main`,
        },
        {
          title: "Add APT repository (DEB822, modern)",
          description: "Add to /etc/apt/sources.list.d/artifact-keeper.sources:",
          code: `Types: deb
URIs: ${REGISTRY_URL}/debian/${repoKey}
Suites: stable
Components: main
Signed-By: /etc/apt/keyrings/artifact-keeper.gpg.asc`,
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
baseurl=${REGISTRY_URL}/rpm/${repoKey}/
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
    url = "${REGISTRY_URL}/terraform/${repoKey}/"
  }
}`,
        },
      ];
    case "composer":
      return [
        {
          title: "Add Composer repository",
          code: `composer config repositories.${repoKey} composer ${REGISTRY_URL}/composer/${repoKey}/`,
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
          code: `${REGISTRY_URL}/alpine/${repoKey}/`,
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
          code: `curl -O ${REGISTRY_URL}/api/v1/repositories/${repoKey}/download/my-file.tar.gz`,
        },
      ];
  }
}

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

// -- StepsList component (numbered step list with code blocks) --

export function StepsList({ steps }: { steps: SetupStep[] }) {
  return (
    <div className="space-y-6">
      {steps.map((step, i) => (
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
  );
}

// -- RepoSetupGuide component --

/** Format-aware client-setup instructions for one repository: client-variant
 *  tabs (JVM/npm/PyPI) or a flat step list. Used by the Setup page and the
 *  per-repo Setup tab (#560). */
export function RepoSetupGuide({ repo }: { repo: Repository }) {
  const content = getRepoSetupContent(repo);

  if (content.kind === "variants") {
    return (
      <Tabs defaultValue={content.defaultKey}>
        {/* h-auto + flex-wrap: 4 JVM client labels overflow at ~360px;
            let them wrap to a second row on narrow viewports. */}
        <TabsList className="h-auto flex-wrap">
          {content.variants.map((variant) => (
            <TabsTrigger key={variant.key} value={variant.key}>
              {variant.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {content.variants.map((variant) => (
          <TabsContent key={variant.key} value={variant.key} className="mt-4">
            <StepsList steps={variant.steps} />
          </TabsContent>
        ))}
      </Tabs>
    );
  }

  return <StepsList steps={content.steps} />;
}
