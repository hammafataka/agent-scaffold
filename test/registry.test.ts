import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { scanRepo } from "../src/core/repo-scanner";
import { selectPlugin, PLUGINS } from "../src/plugins/registry";

describe("registry", () => {
  it("picks Spring Boot for a spring repo", () => {
    const repo = scanRepo(join(__dirname, "fixtures", "gradle-app"));
    const { plugin, detection } = selectPlugin(repo, PLUGINS);
    expect(plugin.id).toBe("spring-boot");
    expect(detection.facts.buildTool).toBe("gradle");
  });

  it("falls back to generic when nothing clears the threshold", () => {
    const repo = { root: "/x", files: ["README.md"], exists: () => false, readFile: () => null, glob: () => [] };
    const { plugin } = selectPlugin(repo, PLUGINS);
    expect(plugin.id).toBe("generic");
  });
});
