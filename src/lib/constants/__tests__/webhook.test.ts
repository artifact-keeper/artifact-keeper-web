import { describe, it, expect } from "vitest";
import {
  PAYLOAD_TEMPLATE_PRESETS,
  type PayloadTemplatePreset,
} from "../webhook";

describe("PayloadTemplatePreset type", () => {
  it("each preset satisfies the PayloadTemplatePreset interface", () => {
    for (const preset of PAYLOAD_TEMPLATE_PRESETS) {
      const typed: PayloadTemplatePreset = preset;
      expect(typed.id).toBeDefined();
      expect(typeof typed.id).toBe("string");
      expect(typeof typed.name).toBe("string");
      expect(typeof typed.description).toBe("string");
      expect(typeof typed.template).toBe("string");
    }
  });
});

describe("PAYLOAD_TEMPLATE_PRESETS", () => {
  it("has unique IDs", () => {
    const ids = PAYLOAD_TEMPLATE_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes the five expected presets in order", () => {
    const ids = PAYLOAD_TEMPLATE_PRESETS.map((p) => p.id);
    expect(ids).toEqual(["default", "slack", "discord", "teams", "custom"]);
  });

  it("default preset includes all standard variables", () => {
    const def = PAYLOAD_TEMPLATE_PRESETS.find((p) => p.id === "default")!;
    expect(def.template).toContain("{{event}}");
    expect(def.template).toContain("{{timestamp}}");
    expect(def.template).toContain("{{artifact.name}}");
    expect(def.template).toContain("{{artifact.version}}");
    expect(def.template).toContain("{{artifact.repository}}");
    expect(def.template).toContain("{{artifact.format}}");
    expect(def.template).toContain("{{actor.username}}");
    expect(def.template).toContain("{{actor.email}}");
  });

  it("slack preset includes text and blocks fields", () => {
    const slack = PAYLOAD_TEMPLATE_PRESETS.find((p) => p.id === "slack")!;
    expect(slack.template).toContain('"text"');
    expect(slack.template).toContain('"blocks"');
  });

  it("discord preset includes embeds with color", () => {
    const discord = PAYLOAD_TEMPLATE_PRESETS.find((p) => p.id === "discord")!;
    expect(discord.template).toContain('"embeds"');
    expect(discord.template).toContain('"color"');
    expect(discord.template).toContain("5814783");
  });

  it("teams preset uses MessageCard schema", () => {
    const teams = PAYLOAD_TEMPLATE_PRESETS.find((p) => p.id === "teams")!;
    expect(teams.template).toContain("MessageCard");
    expect(teams.template).toContain("http://schema.org/extensions");
  });

  it("custom preset has empty template string", () => {
    const custom = PAYLOAD_TEMPLATE_PRESETS.find((p) => p.id === "custom")!;
    expect(custom.template).toBe("");
  });
});
