// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import {
  AwsUpstreamAuthFields,
  UPSTREAM_AUTH_TYPE_OPTIONS,
  buildUpstreamAuthPayload,
  isAwsUpstreamAuthType,
  isUpstreamAuthComplete,
  upstreamAuthTypeLabel,
  EMPTY_AWS_UPSTREAM_AUTH,
  type AwsUpstreamAuthValue,
  type UpstreamAuthFormValue,
} from "./upstream-auth-fields";

const form = (
  overrides: Partial<UpstreamAuthFormValue> = {},
): UpstreamAuthFormValue => ({
  username: "",
  password: "",
  aws: EMPTY_AWS_UPSTREAM_AUTH,
  ...overrides,
});

const aws = (overrides: Partial<AwsUpstreamAuthValue> = {}): AwsUpstreamAuthValue => ({
  ...EMPTY_AWS_UPSTREAM_AUTH,
  ...overrides,
});

describe("UPSTREAM_AUTH_TYPE_OPTIONS", () => {
  it("keeps the pre-1.10.0 types and adds the two AWS types", () => {
    expect(UPSTREAM_AUTH_TYPE_OPTIONS.map((o) => o.value)).toEqual([
      "none",
      "basic",
      "bearer",
      "aws_ecr",
      "aws_codeartifact",
    ]);
  });
});

describe("isAwsUpstreamAuthType", () => {
  it.each(["aws_ecr", "aws_codeartifact"])("is true for %s", (type) => {
    expect(isAwsUpstreamAuthType(type)).toBe(true);
  });

  it.each(["none", "basic", "bearer", null, undefined])(
    "is false for %s",
    (type) => {
      expect(isAwsUpstreamAuthType(type)).toBe(false);
    },
  );
});

describe("upstreamAuthTypeLabel", () => {
  it("labels every known type", () => {
    expect(upstreamAuthTypeLabel("basic")).toBe("Basic Auth");
    expect(upstreamAuthTypeLabel("bearer")).toBe("Bearer Token");
    expect(upstreamAuthTypeLabel("aws_ecr")).toBe("Amazon ECR");
    expect(upstreamAuthTypeLabel("aws_codeartifact")).toBe("AWS CodeArtifact");
  });

  it("degrades to the raw value for an unknown type and to empty for null", () => {
    expect(upstreamAuthTypeLabel("gcp_artifact_registry")).toBe(
      "gcp_artifact_registry",
    );
    expect(upstreamAuthTypeLabel(null)).toBe("");
  });
});

describe("buildUpstreamAuthPayload", () => {
  it("sends only the auth type for none", () => {
    expect(buildUpstreamAuthPayload("none", form())).toEqual({
      auth_type: "none",
    });
  });

  it("sends username + password for basic", () => {
    expect(
      buildUpstreamAuthPayload("basic", form({ username: "u", password: "p" })),
    ).toEqual({ auth_type: "basic", username: "u", password: "p" });
  });

  it("sends only the password for bearer", () => {
    const payload = buildUpstreamAuthPayload("bearer", form({ password: "t" }));
    expect(payload).toEqual({ auth_type: "bearer", password: "t" });
    expect(payload.username).toBeUndefined();
  });

  it("builds an aws_ecr block with a trimmed region and registry id", () => {
    expect(
      buildUpstreamAuthPayload(
        "aws_ecr",
        form({ aws: aws({ region: " us-east-1 ", registry_id: " 123456789012 " }) }),
      ),
    ).toEqual({
      auth_type: "aws_ecr",
      aws: { region: "us-east-1", registry_id: "123456789012" },
    });
  });

  it("omits an empty ECR registry id rather than sending a blank string", () => {
    const payload = buildUpstreamAuthPayload(
      "aws_ecr",
      form({ aws: aws({ region: "eu-west-1", registry_id: "   " }) }),
    );
    expect(payload.aws?.registry_id).toBeUndefined();
    expect(JSON.parse(JSON.stringify(payload))).toEqual({
      auth_type: "aws_ecr",
      aws: { region: "eu-west-1" },
    });
  });

  it("builds a full aws_codeartifact block with a numeric duration", () => {
    expect(
      buildUpstreamAuthPayload(
        "aws_codeartifact",
        form({
          aws: aws({
            region: "us-east-1",
            domain: "my-domain",
            domain_owner: "123456789012",
            duration_seconds: "3600",
          }),
        }),
      ),
    ).toEqual({
      auth_type: "aws_codeartifact",
      aws: {
        region: "us-east-1",
        domain: "my-domain",
        domain_owner: "123456789012",
        duration_seconds: 3600,
      },
    });
  });

  it("omits the optional CodeArtifact fields when they are blank", () => {
    const payload = buildUpstreamAuthPayload(
      "aws_codeartifact",
      form({ aws: aws({ region: "us-east-1", domain: "my-domain" }) }),
    );
    expect(JSON.parse(JSON.stringify(payload))).toEqual({
      auth_type: "aws_codeartifact",
      aws: { region: "us-east-1", domain: "my-domain" },
    });
  });

  it("drops a non-numeric duration instead of sending NaN", () => {
    const payload = buildUpstreamAuthPayload(
      "aws_codeartifact",
      form({
        aws: aws({
          region: "us-east-1",
          domain: "my-domain",
          duration_seconds: "twelve hours",
        }),
      }),
    );
    expect(payload.aws?.duration_seconds).toBeUndefined();
  });

  it("never mixes a password into an AWS payload", () => {
    const payload = buildUpstreamAuthPayload(
      "aws_ecr",
      form({ username: "u", password: "p", aws: aws({ region: "us-east-1" }) }),
    );
    expect(payload.password).toBeUndefined();
    expect(payload.username).toBeUndefined();
  });

  it("never attaches an aws block to a static auth type", () => {
    const payload = buildUpstreamAuthPayload(
      "basic",
      form({ username: "u", password: "p", aws: aws({ region: "us-east-1" }) }),
    );
    expect(payload.aws).toBeUndefined();
  });
});

describe("isUpstreamAuthComplete", () => {
  it("accepts none with an empty form", () => {
    expect(isUpstreamAuthComplete("none", form())).toBe(true);
  });

  it("requires both fields for basic and the token for bearer", () => {
    expect(isUpstreamAuthComplete("basic", form({ username: "u" }))).toBe(false);
    expect(isUpstreamAuthComplete("basic", form({ password: "p" }))).toBe(false);
    expect(
      isUpstreamAuthComplete("basic", form({ username: "u", password: "p" })),
    ).toBe(true);
    expect(isUpstreamAuthComplete("bearer", form())).toBe(false);
    expect(isUpstreamAuthComplete("bearer", form({ password: "t" }))).toBe(true);
  });

  it("requires only a region for aws_ecr", () => {
    expect(isUpstreamAuthComplete("aws_ecr", form())).toBe(false);
    expect(
      isUpstreamAuthComplete("aws_ecr", form({ aws: aws({ region: "us-east-1" }) })),
    ).toBe(true);
  });

  it("requires region and domain for aws_codeartifact", () => {
    expect(
      isUpstreamAuthComplete(
        "aws_codeartifact",
        form({ aws: aws({ region: "us-east-1" }) }),
      ),
    ).toBe(false);
    expect(
      isUpstreamAuthComplete(
        "aws_codeartifact",
        form({ aws: aws({ region: "us-east-1", domain: "my-domain" }) }),
      ),
    ).toBe(true);
  });

  it("rejects an auth type this UI does not know", () => {
    expect(isUpstreamAuthComplete("gcp_artifact_registry", form())).toBe(false);
  });
});

describe("<AwsUpstreamAuthFields />", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders nothing for the static auth types", () => {
    const { container } = render(
      <AwsUpstreamAuthFields
        authType="basic"
        value={EMPTY_AWS_UPSTREAM_AUTH}
        onChange={vi.fn()}
        idPrefix="edit-upstream"
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows region + registry id (and no CodeArtifact fields) for aws_ecr", () => {
    render(
      <AwsUpstreamAuthFields
        authType="aws_ecr"
        value={EMPTY_AWS_UPSTREAM_AUTH}
        onChange={vi.fn()}
        idPrefix="edit-upstream"
      />,
    );
    expect(screen.getByLabelText("AWS region")).toBeTruthy();
    expect(screen.getByLabelText("Registry ID (optional)")).toBeTruthy();
    expect(screen.queryByLabelText("CodeArtifact domain")).toBeNull();
    expect(screen.queryByLabelText("Token lifetime (optional)")).toBeNull();
  });

  it("shows the CodeArtifact fields (and no registry id) for aws_codeartifact", () => {
    render(
      <AwsUpstreamAuthFields
        authType="aws_codeartifact"
        value={EMPTY_AWS_UPSTREAM_AUTH}
        onChange={vi.fn()}
        idPrefix="edit-upstream"
      />,
    );
    expect(screen.getByLabelText("AWS region")).toBeTruthy();
    expect(screen.getByLabelText("CodeArtifact domain")).toBeTruthy();
    expect(screen.getByLabelText("Domain owner (optional)")).toBeTruthy();
    expect(screen.getByLabelText("Token lifetime (optional)")).toBeTruthy();
    expect(screen.queryByLabelText("Registry ID (optional)")).toBeNull();
  });

  it("reports that no credential is stored for either provider", () => {
    render(
      <AwsUpstreamAuthFields
        authType="aws_ecr"
        value={EMPTY_AWS_UPSTREAM_AUTH}
        onChange={vi.fn()}
        idPrefix="edit-upstream"
      />,
    );
    expect(screen.getByText(/no credential is stored/i)).toBeTruthy();
  });

  it("emits the whole value on every field change", () => {
    const onChange = vi.fn();
    render(
      <AwsUpstreamAuthFields
        authType="aws_codeartifact"
        value={aws({ region: "us-east-1" })}
        onChange={onChange}
        idPrefix="edit-upstream"
      />,
    );

    fireEvent.change(screen.getByLabelText("CodeArtifact domain"), {
      target: { value: "my-domain" },
    });
    expect(onChange).toHaveBeenCalledWith(
      aws({ region: "us-east-1", domain: "my-domain" }),
    );

    fireEvent.change(screen.getByLabelText("Token lifetime (optional)"), {
      target: { value: "3600" },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      aws({ region: "us-east-1", duration_seconds: "3600" }),
    );
  });

  it("prefixes every field id so create and edit surfaces stay distinct", () => {
    render(
      <AwsUpstreamAuthFields
        authType="aws_ecr"
        value={EMPTY_AWS_UPSTREAM_AUTH}
        onChange={vi.fn()}
        idPrefix="edit-upstream"
      />,
    );
    expect(screen.getByLabelText("AWS region").id).toBe("edit-upstream-aws-region");
    expect(screen.getByLabelText("Registry ID (optional)").id).toBe(
      "edit-upstream-aws-registry-id",
    );
  });
});
