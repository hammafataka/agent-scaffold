import { describe, it, expect } from "vitest";
import { springSkills } from "../src/catalog/skills";
import { springCommands } from "../src/catalog/commands";
import { springSettings } from "../src/plugins/spring-boot/settings";

const facts = {
  buildTool: "gradle", runCmd: "./gradlew bootRun", buildCmd: "./gradlew clean build",
  testCmd: "./gradlew test", migrationTool: "flyway",
};

describe("spring extras", () => {
  it("skills include run/test, and add-migration only with a migration tool", () => {
    const names = springSkills(facts).filter((s) => s.condition !== false).map((s) => s.name);
    expect(names).toContain("run");
    expect(names).toContain("test");
    expect(names).toContain("add-migration");
    const noMig = springSkills({ ...facts, migrationTool: "none" })
      .filter((s) => s.condition !== false).map((s) => s.name);
    expect(noMig).not.toContain("add-migration");
  });

  it("run skill body references the detected run command", () => {
    const run = springSkills(facts).find((s) => s.name === "run")!;
    expect(run.body).toContain("./gradlew bootRun");
  });

  it("add-migration documents the manual-sql diff convention with the detected dir/prefix", () => {
    const manual = { ...facts, migrationTool: "manual-sql", sqlDir: "docs/sql", sqlPrefix: "fcm" };
    const skills = springSkills(manual).filter((s) => s.condition !== false);
    const mig = skills.find((s) => s.name === "add-migration")!;
    expect(mig.body).toContain("docs/sql");
    expect(mig.body).toContain(".diff.sql");
    expect(mig.body).toContain("fcm");
  });

  it("commands include build and verify", () => {
    const names = springCommands(facts).map((c) => c.name);
    expect(names).toEqual(["build", "verify"]);
    expect(springCommands(facts).find((c) => c.name === "build")!.body).toContain("./gradlew clean build");
  });

  it("settings allowlist the detected wrapper", () => {
    const perms = springSettings(facts);
    expect(perms[0].allow).toContain("Bash(./gradlew:*)");
  });

  it("settings ship PreToolUse guard scripts", () => {
    const guards = springSettings(facts)[0].guards!;
    expect(guards.map((g) => g.path)).toEqual([
      ".claude/hooks/guards/protected-paths.sh",
      ".claude/hooks/guards/secret-scan.sh",
    ]);
    expect(guards.every((g) => g.event === "PreToolUse")).toBe(true);
    expect(guards.every((g) => g.matcher.includes("Write"))).toBe(true);
  });
});
