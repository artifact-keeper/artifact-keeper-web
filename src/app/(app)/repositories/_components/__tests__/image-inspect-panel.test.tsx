// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  CONTAINER_IMAGE_FORMATS,
  DockerfileView,
  ImageInspectView,
  isContainerImageFormat,
  manifestPathParts,
} from "../image-inspect-panel";
import { DOCKER_FAMILY_FORMATS } from "../artifact-browser-toggle";
import type { ImageInspect } from "@/types/image-builds";

const doc: ImageInspect = {
  reference: "ray/spike:0.1",
  digest: `sha256:${"ab".repeat(32)}`,
  platforms: [{ os: "linux", architecture: "amd64" }],
  size_bytes: 3_635_160,
  config: {
    env: { PATH: "/bin", BIFROST_SPIKE: "1" },
    entrypoint: [],
    cmd: ["/bin/sh"],
    user: "",
    working_dir: "",
    exposed_ports: [],
    labels: { "dev.bifrost-compute/env-spec": "{\"spike\":true}" },
  },
  history: [
    { created_by: "/bin/sh -c #(nop) ADD file:abc in /", empty_layer: false, layer_digest: "sha256:1", size_bytes: 3_600_000 },
    { created_by: "RUN /bin/sh -c echo hello > /hello # buildkit", empty_layer: false, layer_digest: "sha256:2", size_bytes: 160 },
    { created_by: "ENV BIFROST_SPIKE=1", empty_layer: true },
  ],
  layers: [
    { digest: "sha256:1", media_type: "application/vnd.oci.image.layer.v1.tar+gzip", size_bytes: 3_600_000 },
    { digest: "sha256:2", media_type: "application/vnd.oci.image.layer.v1.tar+gzip", size_bytes: 160 },
  ],
  provenance: null,
  source: "registry",
};

afterEach(cleanup);

describe("isContainerImageFormat", () => {
  it("is the Docker family minus the OCI formats that are not container images", () => {
    for (const f of CONTAINER_IMAGE_FORMATS) expect(DOCKER_FAMILY_FORMATS.has(f as never)).toBe(true);
    expect(isContainerImageFormat("docker")).toBe(true);
    expect(isContainerImageFormat("helm_oci")).toBe(false);
    expect(isContainerImageFormat(undefined)).toBe(false);
  });
});

describe("manifestPathParts", () => {
  it("splits a manifest artifact path into image and reference", () => {
    expect(manifestPathParts("v2/ray/team/manifests/2.56.0")).toEqual({ image: "ray/team", reference: "2.56.0" });
    expect(manifestPathParts("/v2/spike/manifests/sha256:abc")).toEqual({ image: "spike", reference: "sha256:abc" });
    expect(manifestPathParts("v2/spike/blobs/sha256:abc")).toBeNull();
  });
});

describe("DockerfileView", () => {
  it("reconstructs from history when there is no provenance", () => {
    render(<DockerfileView doc={doc} />);
    const list = screen.getByTestId("dockerfile-history");
    expect(list).toHaveTextContent("ADD file:abc in /");
    expect(list).toHaveTextContent("RUN echo hello > /hello");
    expect(list).toHaveTextContent("ENV BIFROST_SPIKE=1");
    expect(list).toHaveTextContent("3.43 MB");
  });

  it("prefers the real Dockerfile from a provenance attestation", () => {
    const attested: ImageInspect = {
      ...doc,
      provenance: {
        attestation_digest: `sha256:${"cd".repeat(32)}`,
        dockerfile: "FROM alpine:3.20\nRUN echo hello > /hello\n",
        dockerfile_name: "Dockerfile",
        builder_id: "buildkit",
      },
    };
    render(<DockerfileView doc={attested} />);
    expect(screen.getByTestId("dockerfile-real")).toHaveTextContent("FROM alpine:3.20");
    expect(screen.queryByTestId("dockerfile-history")).toBeNull();
  });
});

describe("ImageInspectView", () => {
  it("shows the overview and switches to layers and environment", async () => {
    const user = userEvent.setup();
    render(<ImageInspectView doc={doc} />);
    expect(screen.getByText("ray/spike:0.1")).toBeInTheDocument();
    expect(screen.getByText("linux/amd64")).toBeInTheDocument();
    expect(screen.getByText(/across 2 layers/)).toBeInTheDocument();
    expect(screen.getByText("root (unset)")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /Environment \(2\)/ }));
    expect(await screen.findByText("BIFROST_SPIKE")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /Labels \(1\)/ }));
    expect(await screen.findByText("dev.bifrost-compute/env-spec")).toBeInTheDocument();
  });
});
