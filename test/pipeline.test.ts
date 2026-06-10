import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { scanRepo } from "../src/core/repo-scanner";
import { buildPlan } from "../src/core/pipeline";

const repo = scanRepo(join(__dirname, "fixtures", "gradle-app"));

const allOutputs = { claudeMd: true, skills: true, commands: true, agents: true, settings: true, pdd: false };

describe("buildPlan", () => {
  it("produces a CLAUDE.md plan from detected + answered fields", async () => {
    const { plugin, writes } = await buildPlan(repo, {
      yes: true,
      outputs: allOutputs,
      ask: async (f) => `ANSWER:${f.key}`,
    });
    expect(plugin.id).toBe("spring-boot");

    const claude = writes.find((w) => w.path === "CLAUDE.md")!;
    expect(claude.action).toBe("create");
    expect(claude.content).toContain("## Build & run");
    expect(claude.content).toContain("./gradlew bootRun"); // detected
    expect(claude.content).toContain("ANSWER:overview"); // prompted (no detected value)

    expect(writes.some((w) => w.path === ".claude/skills/run/SKILL.md")).toBe(true);
    expect(writes.some((w) => w.path === ".claude/commands/build.md")).toBe(true);
    expect(writes.some((w) => w.path === ".claude/settings.json")).toBe(true);
  });

  it("merges into an existing CLAUDE.md, keeping user content", async () => {
    const repoWithClaude = {
      ...repo,
      exists: (rel: string) => rel === "CLAUDE.md" || repo.exists(rel),
      readFile: (rel: string) =>
        rel === "CLAUDE.md" ? "# App\n\n## Overview\nMY SERVICE\n" : repo.readFile(rel),
    };
    const { writes } = await buildPlan(repoWithClaude, {
      yes: true,
      outputs: { claudeMd: true, skills: false, commands: false, agents: false, settings: false, pdd: false },
      ask: async (f) => `ANSWER:${f.key}`,
    });
    const claude = writes.find((w) => w.path === "CLAUDE.md")!;
    expect(claude.action).toBe("update");
    expect(claude.content).toContain("MY SERVICE"); // user kept
    expect(claude.content).not.toContain("ANSWER:overview"); // not overwritten
    expect(claude.content).toContain("## Build & run"); // new section appended
  });

  it("per-item selection: only the chosen skills are written", async () => {
    const seen: string[] = [];
    const { writes } = await buildPlan(repo, {
      yes: false,
      outputs: { claudeMd: false, skills: true, commands: false, agents: false, settings: false, pdd: false },
      ask: async () => "x",
      chooseItems: async (kind, items) => {
        seen.push(`${kind}:${items.map((i) => i.name).join(",")}`);
        return ["run"]; // pick only the run skill
      },
    });
    const skillPaths = writes.filter((w) => w.path.endsWith("SKILL.md")).map((w) => w.path);
    expect(skillPaths).toEqual([".claude/skills/run/SKILL.md"]);
    expect(seen[0]).toContain("skills:run,test");
  });

  it("respects output toggles", async () => {
    const { writes } = await buildPlan(repo, {
      yes: true,
      outputs: { claudeMd: true, skills: false, commands: false, agents: false, settings: false, pdd: false },
      ask: async () => "x",
    });
    expect(writes.every((w) => w.path === "CLAUDE.md")).toBe(true);
  });

  it("announces one stage per enabled output, numbered against the total", async () => {
    const stages: string[] = [];
    await buildPlan(repo, {
      yes: true,
      outputs: allOutputs,
      ask: async (f) => `ANSWER:${f.key}`,
      onStage: (title, index, total) => stages.push(`${index}/${total} ${title}`),
    });
    expect(stages).toEqual([
      "1/5 CLAUDE.md",
      "2/5 Skills",
      "3/5 Slash commands",
      "4/5 Agents",
      "5/5 Settings",
    ]);
  });

  it("DB migration choice flows into skill generation (flyway repo → user picks manual-sql)", async () => {
    // gradle-app has Flyway detected, but user overrides to manual-sql in the section prompt
    const { writes } = await buildPlan(repo, {
      yes: false,
      outputs: { claudeMd: true, skills: true, commands: false, agents: false, settings: false, pdd: false },
      ask: async (f) => {
        if (f.key === "dbMigration") {
          // pick the manual-sql option value
          return "Manual SQL diff-file migrations — a full snapshot per release plus an incremental diff from the previous version";
        }
        return f.detectedValue ?? `ANSWER:${f.key}`;
      },
    });
    const migSkill = writes.find((w) => w.path === ".claude/skills/add-migration/SKILL.md");
    expect(migSkill).toBeDefined();
    // Override took effect: manual-SQL guidance, not Flyway.
    expect(migSkill?.content.toLowerCase()).toContain("snapshot");
    expect(migSkill?.content.toLowerCase()).toContain("diff");
    expect(migSkill?.content).not.toContain("Flyway");
    // No fabricated paths / leaked placeholders when none were detected.
    expect(migSkill?.content).not.toContain("<prefix>");
    expect(migSkill?.content).not.toContain("docs/sql");
  });

  it("manual-sql: sqlDir and sqlPrefix are prompted and flow into skills", async () => {
    // Synthetic Spring Boot repo with manual SQL files (no Flyway/Liquibase).
    const sqlFiles = ["docs/sql/fcm-1.1.13.sql", "docs/sql/fcm1.1.13-to-1.1.14.diff.sql"];
    const allFiles = ["build.gradle.kts", "gradlew", ...sqlFiles];
    const sqlRepo = {
      root: "/test-sql",
      files: allFiles,
      exists: (rel: string) => allFiles.includes(rel),
      readFile: (rel: string) =>
        rel === "build.gradle.kts"
          ? "id(\"org.springframework.boot\") version \"3.3.0\"\njavaVersion = JavaVersion.VERSION_21"
          : null,
      glob: (re: RegExp) => allFiles.filter((f) => re.test(f)),
    };
    const asked: string[] = [];
    const { writes } = await buildPlan(sqlRepo, {
      yes: false,
      outputs: { claudeMd: true, skills: true, commands: false, agents: false, settings: false, pdd: false },
      ask: async (f) => {
        asked.push(f.key);
        // Return a custom path for sqlDir, blank for optional sqlPrefix
        if (f.key === "sqlDir") return "custom/migrations";
        if (f.key === "sqlPrefix") return "myapp";
        return f.detectedValue ?? `ANSWER:${f.key}`;
      },
    });
    // The path/prefix fields were prompted
    expect(asked).toContain("sqlDir");
    expect(asked).toContain("sqlPrefix");
    // The add-migration skill body uses the confirmed sqlDir
    const migrationSkill = writes.find((w) => w.path === ".claude/skills/add-migration/SKILL.md");
    expect(migrationSkill?.content).toContain("custom/migrations");
    expect(migrationSkill?.content).toContain("myapp");
  });

  it("injects the Implementation workflow section only when PDD is enabled", async () => {
    const withPdd = await buildPlan(repo, {
      yes: true,
      outputs: { ...allOutputs, pdd: true },
      ask: async (f) => `ANSWER:${f.key}`,
    });
    const claudePdd = withPdd.writes.find((w) => w.path === "CLAUDE.md")!;
    expect(claudePdd.content).toContain("## Implementation workflow");
    expect(claudePdd.content).toContain(".claude/skills/pdd/write-prd/SKILL.md");
    // The PDD skills are installed under the pdd/ prefix.
    expect(withPdd.writes.some((w) => w.path === ".claude/skills/pdd/tdd/SKILL.md")).toBe(true);
    // Workflow lands before the Stack section.
    expect(claudePdd.content.indexOf("## Implementation workflow")).toBeLessThan(
      claudePdd.content.indexOf("## Stack"),
    );

    const noPdd = await buildPlan(repo, {
      yes: true,
      outputs: allOutputs, // pdd: false
      ask: async (f) => `ANSWER:${f.key}`,
    });
    const claudeNo = noPdd.writes.find((w) => w.path === "CLAUDE.md")!;
    expect(claudeNo.content).not.toContain("## Implementation workflow");
  });

  it("ships guard scripts alongside settings.json", async () => {
    const { writes } = await buildPlan(repo, {
      yes: true,
      outputs: { claudeMd: false, skills: false, commands: false, agents: false, settings: true, pdd: false },
      ask: async (f) => `ANSWER:${f.key}`,
    });
    expect(writes.some((w) => w.path === ".claude/settings.json")).toBe(true);
    expect(writes.some((w) => w.path === ".claude/hooks/guards/protected-paths.sh")).toBe(true);
    expect(writes.some((w) => w.path === ".claude/hooks/guards/secret-scan.sh")).toBe(true);
    const settings = writes.find((w) => w.path === ".claude/settings.json")!;
    expect(settings.content).toContain("PreToolUse");
  });

  it("counts total stages only from enabled outputs", async () => {
    const stages: string[] = [];
    await buildPlan(repo, {
      yes: true,
      outputs: { claudeMd: true, skills: false, commands: false, agents: false, settings: true, pdd: false },
      ask: async (f) => `ANSWER:${f.key}`,
      onStage: (title, index, total) => stages.push(`${index}/${total} ${title}`),
    });
    expect(stages).toEqual(["1/2 CLAUDE.md", "2/2 Settings"]);
  });
});
