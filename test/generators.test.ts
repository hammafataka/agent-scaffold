import { describe, it, expect } from "vitest";
import { planSkillWrites } from "../src/generators/skills";
import { planCommandWrites } from "../src/generators/commands";
import { planAgentWrites } from "../src/generators/agents";
import { planSettingsWrite, planGuardScriptWrites } from "../src/generators/settings";

describe("generators", () => {
  it("skills: also writes reference files under the skill dir", () => {
    const writes = planSkillWrites(
      [
        {
          name: "java-architect",
          description: "Architect",
          body: "main",
          references: [{ path: "references/jpa.md", content: "jpa notes" }],
        },
      ],
      () => false,
    );
    const paths = writes.map((w) => w.path);
    expect(paths).toContain(".claude/skills/java-architect/SKILL.md");
    expect(paths).toContain(".claude/skills/java-architect/references/jpa.md");
    expect(writes.find((w) => w.path.endsWith("jpa.md"))!.content).toBe("jpa notes");
  });

  it("agents: emits one md per enabled spec, skips existing", () => {
    const writes = planAgentWrites(
      [
        { name: "code-reviewer", description: "Reviews code", body: "review!" },
        { name: "hidden", description: "no", body: "x", condition: false },
      ],
      () => false,
    );
    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe(".claude/agents/code-reviewer.md");
    expect(writes[0].content).toContain("description: Reviews code");
    expect(writes[0].content).toContain("review!");
    const existing = planAgentWrites([{ name: "x", description: "d", body: "b" }], () => true);
    expect(existing[0].action).toBe("skip");
  });

  it("skills: emits SKILL.md per enabled spec, frontmatter + body", () => {
    const writes = planSkillWrites(
      [
        { name: "run", description: "Run it", body: "do run" },
        { name: "hidden", description: "no", body: "x", condition: false },
      ],
      () => false,
    );
    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe(".claude/skills/run/SKILL.md");
    expect(writes[0].action).toBe("create");
    expect(writes[0].content).toContain("name: run");
    expect(writes[0].content).toContain("description: Run it");
    expect(writes[0].content).toContain("do run");
  });

  it("skills: marks existing files as skip", () => {
    const writes = planSkillWrites([{ name: "run", description: "Run it", body: "b" }], () => true);
    expect(writes[0].action).toBe("skip");
  });

  it("commands: emits one md per spec", () => {
    const writes = planCommandWrites([{ name: "build", description: "Build", body: "go" }], () => false);
    expect(writes[0].path).toBe(".claude/commands/build.md");
    expect(writes[0].content).toContain("description: Build");
    expect(writes[0].content).toContain("go");
  });

  it("settings: merges allowlist into existing JSON without dropping entries", () => {
    const existing = JSON.stringify({ permissions: { allow: ["Bash(ls:*)"] } });
    const w = planSettingsWrite([{ allow: ["Bash(./gradlew:*)"] }], existing)!;
    expect(w.action).toBe("update");
    const parsed = JSON.parse(w.content);
    expect(parsed.permissions.allow).toContain("Bash(ls:*)");
    expect(parsed.permissions.allow).toContain("Bash(./gradlew:*)");
  });

  it("settings: creates fresh JSON when none exists; null when nothing to add", () => {
    const w = planSettingsWrite([{ allow: ["Bash(./mvnw:*)"] }], null)!;
    expect(w.action).toBe("create");
    expect(planSettingsWrite([], null)).toBeNull();
  });

  it("settings: wires guard hooks (and emits even with an empty allow-list)", () => {
    const guard = {
      event: "PreToolUse",
      matcher: "Edit|Write",
      path: ".claude/hooks/guards/secret-scan.sh",
      command: 'bash "$CLAUDE_PROJECT_DIR/.claude/hooks/guards/secret-scan.sh"',
      content: "#!/usr/bin/env bash\nexit 0\n",
    };
    const w = planSettingsWrite([{ allow: [], guards: [guard] }], null)!;
    expect(w).not.toBeNull();
    const parsed = JSON.parse(w.content);
    expect(parsed.hooks.PreToolUse[0].matcher).toBe("Edit|Write");
    expect(parsed.hooks.PreToolUse[0].hooks[0].command).toBe(guard.command);

    // The script is emitted, skipped if it already exists.
    const fresh = planGuardScriptWrites([{ allow: [], guards: [guard] }], () => false);
    expect(fresh[0].path).toBe(guard.path);
    expect(fresh[0].action).toBe("create");
    const present = planGuardScriptWrites([{ allow: [], guards: [guard] }], () => true);
    expect(present[0].action).toBe("skip");
  });
});
