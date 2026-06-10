import { describe, it, expect } from "vitest";
import { genericPlugin } from "../src/plugins/generic/index";

describe("genericPlugin", () => {
  it("always returns low non-zero confidence", () => {
    const r = genericPlugin.detect({
      root: "/x", files: [], exists: () => false, readFile: () => null, glob: () => [],
    });
    expect(r.confidence).toBeGreaterThan(0);
    expect(r.confidence).toBeLessThan(0.2);
  });

  it("offers prompt-only sections with required fields", () => {
    const sections = genericPlugin.sections({});
    expect(sections.map((s) => s.heading)).toContain("## Overview");
    const overview = sections.find((s) => s.heading === "## Overview")!;
    expect(overview.fields[0].required).toBe(true);
    expect(overview.fields[0].detectedValue).toBeUndefined();
    expect(overview.render({ overview: "hi" })).toContain("hi");
  });

  it("emits no skills/commands/settings", () => {
    expect(genericPlugin.skills({})).toEqual([]);
    expect(genericPlugin.commands({})).toEqual([]);
    expect(genericPlugin.settings({})).toEqual([]);
  });
});
