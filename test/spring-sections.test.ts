import { describe, it, expect } from "vitest";
import { springSections } from "../src/plugins/spring-boot/sections";

describe("springSections", () => {
  const facts = {
    buildTool: "gradle", springBootVersion: "3.3.0", javaVersion: "21",
    hasWeb: true, hasJpa: true, hasSecurity: false, migrationTool: "flyway",
    runCmd: "./gradlew bootRun", buildCmd: "./gradlew clean build", testCmd: "./gradlew test",
  };

  it("pre-fills detectable fields and renders the Stack section", () => {
    const sections = springSections(facts);
    const stack = sections.find((s) => s.heading === "## Stack")!;
    const stackField = stack.fields.find((f) => f.key === "stack")!;
    expect(stackField.detectedValue).toContain("Spring Boot 3.3.0");
    expect(stackField.detectedValue).toContain("Java 21");
    expect(stack.render({ stack: stackField.detectedValue! })).toContain("Spring Boot 3.3.0");
  });

  it("leaves Overview/Never do as required, unprefilled prompts", () => {
    const sections = springSections(facts);
    const overview = sections.find((s) => s.heading === "## Overview")!;
    expect(overview.fields[0].required).toBe(true);
    expect(overview.fields[0].detectedValue).toBeUndefined();
    const never = sections.find((s) => s.heading === "## Never do")!;
    expect(never.fields[0].detectedValue).toBeUndefined();
  });

  it("omits the Modules section for a single-module project", () => {
    const sections = springSections(facts);
    expect(sections.find((s) => s.heading === "## Modules")).toBeUndefined();
    const stack = sections.find((s) => s.heading === "## Stack")!;
    // Single-module: plain build tool name, no "multi-module" qualifier.
    expect(stack.fields[0].detectedValue).not.toContain("multi-module");
  });

  it("adds a Modules section and a multi-module Stack line for multi-module projects", () => {
    const sections = springSections({
      ...facts,
      moduleCount: 3,
      modules: "accounts,jpa,worker",
      bootModule: "worker",
    });
    const stack = sections.find((s) => s.heading === "## Stack")!;
    expect(stack.fields[0].detectedValue).toContain("multi-module (3 modules)");

    const modules = sections.find((s) => s.heading === "## Modules")!;
    expect(modules).toBeDefined();
    // One optional purpose field per module, keyed mod_<name>.
    expect(modules.fields.map((f) => f.key)).toEqual(["mod_accounts", "mod_jpa", "mod_worker"]);
    expect(modules.fields.every((f) => f.required === false)).toBe(true);

    // With no purposes (e.g. --yes): names render, boot module marked.
    const bare = modules.render({});
    expect(bare).toContain("`worker` (application)");
    expect(bare).toContain("`accounts`");
    expect(bare).toContain("`jpa`");

    // With a purpose given, it is appended after the name.
    const withPurpose = modules.render({ mod_accounts: "account domain", mod_worker: "main app" });
    expect(withPurpose).toContain("`worker` (application) — main app");
    expect(withPurpose).toContain("`accounts` — account domain");

    // Modules appears right after Stack.
    const headings = sections.map((s) => s.heading);
    expect(headings.indexOf("## Modules")).toBe(headings.indexOf("## Stack") + 1);
  });

  it("offers an optional Behavior checklist after Overview and a High-blast-radius section", () => {
    const sections = springSections(facts);
    const headings = sections.map((s) => s.heading);
    expect(headings.indexOf("## Behavior")).toBe(headings.indexOf("## Overview") + 1);
    const behavior = sections.find((s) => s.heading === "## Behavior")!;
    expect(behavior.fields[0].kind).toBe("multiselect");
    expect(behavior.fields[0].required).toBe(false);
    expect(behavior.fields[0].options!.some((o) => o.value.includes("never Mermaid"))).toBe(true);

    const highBlast = sections.find((s) => s.heading === "## High-blast-radius areas")!;
    expect(highBlast).toBeDefined();
    expect(highBlast.fields[0].required).toBe(false);
  });

  it("includes DB migration (select) and Persistence (checklist) when migration is set", () => {
    const sections = springSections(facts);
    const migration = sections.find((s) => s.heading === "## DB migration")!;
    expect(migration.fields[0].kind).toBe("select");
    expect(migration.fields[0].detectedValue).toContain("Flyway");
    const persistence = sections.find((s) => s.heading === "## Persistence")!;
    expect(persistence.fields[0].kind).toBe("multiselect");
    expect(persistence.fields[0].options!.some((o) => o.value.includes("Flyway"))).toBe(false);
  });
});
