import { describe, it, expect } from "vitest";
import { springSections } from "../src/plugins/spring-boot/sections";
import { genericPlugin } from "../src/plugins/generic/index";

const facts = {
  buildTool: "gradle", springBootVersion: "3.3.0", javaVersion: "21",
  hasWeb: true, hasJpa: true, hasSecurity: false, migrationTool: "flyway",
  runCmd: "./gradlew bootRun", buildCmd: "./gradlew clean build", testCmd: "./gradlew test",
  activeProfile: "dev",
};

describe("option-based sections (Spring Boot)", () => {
  it("Never do is a multiselect with curated rule options", () => {
    const never = springSections(facts).find((s) => s.heading === "## Never do")!;
    const f = never.fields[0];
    expect(f.kind).toBe("multiselect");
    expect(f.options!.map((o) => o.value)).toContain("Don't weaken `SecurityConfig`");
    expect(f.options!.length).toBeGreaterThanOrEqual(5);
  });

  it("Code conventions and API conventions are multiselect checklists", () => {
    const secs = springSections(facts);
    for (const h of ["## Code conventions", "## API conventions", "## Git workflow"]) {
      const f = secs.find((s) => s.heading === h)!.fields[0];
      expect(f.kind).toBe("multiselect");
      expect(f.options!.length).toBeGreaterThan(0);
    }
  });

  it("Dependencies is a single-select with a detected default", () => {
    const dep = springSections(facts).find((s) => s.heading === "## Dependencies")!.fields[0];
    expect(dep.kind).toBe("select");
    const detected = dep.options!.find((o) => o.detected);
    expect(detected?.value).toBe("Don't add dependencies without asking first.");
    expect(dep.detectedValue).toBe("Don't add dependencies without asking first.");
  });

  it("Config & profiles pre-checks the detected active profile", () => {
    const cfg = springSections(facts).find((s) => s.heading === "## Config & profiles")!.fields[0];
    expect(cfg.kind).toBe("multiselect");
    const profileOpt = cfg.options!.find((o) => o.value.includes("dev"));
    expect(profileOpt?.detected).toBe(true);
    // detected option flows into the --yes default as a bullet line
    expect(cfg.detectedValue).toContain("dev");
  });

  it("Tests is a checklist that pre-checks the detected run command", () => {
    const t = springSections(facts).find((s) => s.heading === "## Tests")!.fields[0];
    expect(t.kind).toBe("multiselect");
    const runOpt = t.options!.find((o) => o.value.includes("./gradlew test"));
    expect(runOpt?.detected).toBe(true);
    expect(t.options!.some((o) => o.value.includes("Testcontainers"))).toBe(true);
  });

  it("DB migration is a single-select with the detected tool pre-selected", () => {
    const sec = springSections(facts).find((s) => s.heading === "## DB migration")!;
    const f = sec.fields[0];
    expect(f.kind).toBe("select");
    const detected = f.options!.find((o) => o.detected);
    expect(detected?.label).toBe("Flyway");
    expect(f.detectedValue).toContain("Flyway");
  });

  it("DB migration pre-selects manual-sql with path and prefix pattern when detected", () => {
    const manual = { ...facts, migrationTool: "manual-sql", sqlDir: "docs/sql", sqlPrefix: "fcm" };
    const f = springSections(manual).find((s) => s.heading === "## DB migration")!.fields[0];
    const detected = f.options!.find((o) => o.detected);
    expect(detected?.label).toContain("fcm-<VERSION>.sql");
    expect(detected?.label).toContain("fcm<VERSION>-to-<NEW>.diff.sql");
    expect(detected?.value).toContain("docs/sql");
    expect(detected?.value).toContain("fcm-<VERSION>.sql");
  });

  it("Persistence section has JPA rules but no migration tool options", () => {
    const pf = springSections(facts).find((s) => s.heading === "## Persistence")!.fields[0];
    expect(pf.kind).toBe("multiselect");
    expect(pf.options!.find((o) => o.detected)?.value).toContain("JPA");
    expect(pf.options!.some((o) => o.value.toLowerCase().includes("flyway"))).toBe(false);
    expect(pf.options!.some((o) => o.value.toLowerCase().includes("liquibase"))).toBe(false);
  });

  it("prose sections stay free-text", () => {
    const secs = springSections(facts);
    for (const h of ["## Overview", "## Gotchas"]) {
      expect(secs.find((s) => s.heading === h)!.fields[0].kind).toBe("multiline");
    }
  });

  it("Architecture is a checklist and pre-checks a detected layered structure", () => {
    const f = springSections({ ...facts, layering: "layered" }).find((s) => s.heading === "## Architecture")!.fields[0];
    expect(f.kind).toBe("multiselect");
    const layered = f.options!.find((o) => o.value.startsWith("Layered"));
    expect(layered?.detected).toBe(true);
    // without detection, nothing is pre-checked
    const f2 = springSections(facts).find((s) => s.heading === "## Architecture")!.fields[0];
    expect(f2.options!.some((o) => o.detected)).toBe(false);
  });
});

describe("option-based sections (generic)", () => {
  it("Code conventions and Never do become checklists, prose stays text", () => {
    const secs = genericPlugin.sections({});
    expect(secs.find((s) => s.heading === "## Code conventions")!.fields[0].kind).toBe("multiselect");
    expect(secs.find((s) => s.heading === "## Never do")!.fields[0].kind).toBe("multiselect");
    expect(secs.find((s) => s.heading === "## Overview")!.fields[0].kind).toBe("multiline");
  });
});
