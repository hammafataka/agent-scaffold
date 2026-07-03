import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { RepoSnapshot } from "../src/plugins/types";
import { Artifacts, emptyArtifacts } from "../src/tools/types";
import { claudeAdapter } from "../src/tools/claude";
import { cursorAdapter } from "../src/tools/cursor";
import { copilotAdapter } from "../src/tools/copilot";
import { geminiAdapter } from "../src/tools/gemini";
import { agentsMdAdapter } from "../src/tools/agents-md";
import { windsurfAdapter } from "../src/tools/windsurf";
import { detectTools, resolveTools, combinedCapabilities } from "../src/tools/registry";
import { scanRepo } from "../src/core/repo-scanner";
import { buildPlan } from "../src/core/pipeline";

function fakeRepo(files: Record<string, string> = {}): RepoSnapshot {
  const names = Object.keys(files);
  return {
    root: "/fake",
    files: names,
    exists: (rel) => rel in files || names.some((f) => f.startsWith(`${rel}/`)),
    readFile: (rel) => files[rel] ?? null,
    glob: (re) => names.filter((f) => re.test(f)),
  };
}

function sampleArtifacts(): Artifacts {
  return {
    ...emptyArtifacts(),
    instructions: {
      displayName: "Node.js / TypeScript",
      sections: [
        { heading: "## Overview", body: "A demo app." },
        { heading: "## Stack", body: "TypeScript · Vite" },
        { heading: "## Gotchas", body: "" }, // blank optional section — dropped on create
      ],
    },
    skills: [{ name: "test", description: "Run tests.", body: "Run `pnpm test`." }],
    commands: [{ name: "verify", description: "Verify before commit.", body: "Run checks." }],
    agents: [{ name: "reviewer", description: "Reviews diffs.", body: "You review code." }],
    mcpServers: [
      { name: "context7", description: "Docs", config: { command: "npx", args: ["-y", "@upstash/context7-mcp"] } },
      {
        name: "github",
        description: "GitHub",
        config: { command: "npx", args: ["-y", "gh-mcp"], env: { TOKEN: "${GITHUB_TOKEN}" } },
      },
    ],
  };
}

describe("claude adapter", () => {
  it("emits the full layout and injects the PDD workflow before ## Stack", () => {
    const a = sampleArtifacts();
    a.pddSkills = [{ name: "tdd", description: "TDD.", body: "Red, green, refactor." }];
    a.pddWorkflow = { heading: "## Implementation workflow", body: "1. walk-and-talk" };
    const writes = claudeAdapter.plan(a, fakeRepo());
    const paths = writes.map((w) => w.path);
    expect(paths).toContain("CLAUDE.md");
    expect(paths).toContain(".claude/skills/test/SKILL.md");
    expect(paths).toContain(".claude/commands/verify.md");
    expect(paths).toContain(".claude/agents/reviewer.md");
    expect(paths).toContain(".mcp.json");
    expect(paths).toContain(".claude/skills/pdd/tdd/SKILL.md");
    const claude = writes.find((w) => w.path === "CLAUDE.md")!;
    expect(claude.content.indexOf("## Implementation workflow")).toBeLessThan(claude.content.indexOf("## Stack"));
    expect(claude.content).not.toContain("## Gotchas"); // blank section dropped
  });
});

describe("cursor adapter", () => {
  it("emits mdc rules, commands, and mcp config", () => {
    const writes = cursorAdapter.plan(sampleArtifacts(), fakeRepo());
    const rule = writes.find((w) => w.path === ".cursor/rules/project-instructions.mdc")!;
    expect(rule.content).toContain("alwaysApply: true");
    expect(rule.content).toContain("## Stack");
    const skill = writes.find((w) => w.path === ".cursor/rules/test.mdc")!;
    expect(skill.content).toContain("description: Run tests.");
    expect(skill.content).toContain("alwaysApply: false");
    expect(writes.some((w) => w.path === ".cursor/commands/verify.md")).toBe(true);
    const mcp = writes.find((w) => w.path === ".cursor/mcp.json")!;
    expect(JSON.parse(mcp.content).mcpServers.context7).toBeDefined();
    // No agents — cursor has no subagent concept.
    expect(writes.some((w) => w.path.includes("reviewer"))).toBe(false);
  });
});

describe("copilot adapter", () => {
  it("emits instructions, prompts, chatmodes, and vscode mcp with ${env:} syntax", () => {
    const writes = copilotAdapter.plan(sampleArtifacts(), fakeRepo());
    expect(writes.some((w) => w.path === ".github/copilot-instructions.md")).toBe(true);
    expect(writes.some((w) => w.path === ".github/instructions/test.instructions.md")).toBe(true);
    expect(writes.some((w) => w.path === ".github/prompts/verify.prompt.md")).toBe(true);
    expect(writes.some((w) => w.path === ".github/chatmodes/reviewer.chatmode.md")).toBe(true);
    const mcp = writes.find((w) => w.path === ".vscode/mcp.json")!;
    const json = JSON.parse(mcp.content);
    expect(json.servers.github.env.TOKEN).toBe("${env:GITHUB_TOKEN}");
  });

  it("merges into an existing copilot-instructions.md keeping user content", () => {
    const repo = fakeRepo({
      ".github/copilot-instructions.md": "# My app\n\n## Overview\nHAND WRITTEN\n",
    });
    const writes = copilotAdapter.plan(sampleArtifacts(), repo);
    const w = writes.find((x) => x.path === ".github/copilot-instructions.md")!;
    expect(w.action).toBe("update");
    expect(w.content).toContain("HAND WRITTEN"); // kept
    expect(w.content).toContain("## Stack"); // new section added
  });
});

describe("gemini adapter", () => {
  it("emits GEMINI.md, TOML commands, and mcp inside settings.json", () => {
    const writes = geminiAdapter.plan(sampleArtifacts(), fakeRepo());
    expect(writes.some((w) => w.path === "GEMINI.md")).toBe(true);
    const cmd = writes.find((w) => w.path === ".gemini/commands/verify.toml")!;
    expect(cmd.content).toContain('description = "Verify before commit."');
    expect(cmd.content).toContain("prompt = '''");
    const mcp = writes.find((w) => w.path === ".gemini/settings.json")!;
    expect(JSON.parse(mcp.content).mcpServers.context7).toBeDefined();
  });

  it("preserves other keys in an existing .gemini/settings.json", () => {
    const repo = fakeRepo({ ".gemini/settings.json": '{"theme":"dark"}' });
    const writes = geminiAdapter.plan(sampleArtifacts(), repo);
    const json = JSON.parse(writes.find((w) => w.path === ".gemini/settings.json")!.content);
    expect(json.theme).toBe("dark");
    expect(json.mcpServers.context7).toBeDefined();
  });
});

describe("agents-md adapter", () => {
  it("emits only AGENTS.md", () => {
    const writes = agentsMdAdapter.plan(sampleArtifacts(), fakeRepo());
    expect(writes.map((w) => w.path)).toEqual(["AGENTS.md"]);
    expect(writes[0].content).toContain("# Node.js / TypeScript — agent instructions");
  });
});

describe("windsurf adapter", () => {
  it("emits rules and workflows, no mcp", () => {
    const writes = windsurfAdapter.plan(sampleArtifacts(), fakeRepo());
    expect(writes.some((w) => w.path === ".windsurf/rules/project-instructions.md")).toBe(true);
    expect(writes.some((w) => w.path === ".windsurf/rules/test.md")).toBe(true);
    expect(writes.some((w) => w.path === ".windsurf/workflows/verify.md")).toBe(true);
    expect(writes.some((w) => w.path.includes("mcp"))).toBe(false);
  });
});

describe("tool registry", () => {
  it("detects tools from their config footprints", () => {
    const repo = fakeRepo({
      "CLAUDE.md": "x",
      ".cursor/rules/a.mdc": "x",
      "AGENTS.md": "x",
      ".github/copilot-instructions.md": "x",
    });
    const ids = detectTools(repo);
    expect(ids).toContain("claude");
    expect(ids).toContain("cursor");
    expect(ids).toContain("agents-md");
    expect(ids).toContain("copilot");
    expect(ids).not.toContain("gemini");
    expect(ids).not.toContain("windsurf");
  });

  it("rejects unknown tool ids", () => {
    expect(() => resolveTools(["claude", "nope"])).toThrow(/Unknown tool "nope"/);
  });

  it("combines capabilities across tools", () => {
    const caps = combinedCapabilities(resolveTools(["agents-md", "gemini"]));
    expect(caps.instructions).toBe(true);
    expect(caps.commands).toBe(true); // gemini
    expect(caps.skills).toBe(false); // neither
    expect(caps.settings).toBe(false);
  });
});

describe("multi-tool buildPlan", () => {
  const outputs = { instructions: false, skills: true, commands: true, agents: true, settings: false, mcp: true, pdd: false };

  it("emits each tool's layout from one interview", async () => {
    const repo = scanRepo(join(__dirname, "fixtures", "vite-react"));
    const { writes } = await buildPlan(repo, {
      yes: true,
      outputs,
      tools: ["claude", "cursor", "copilot"],
      ask: async () => "x",
    });
    const paths = writes.map((w) => w.path);
    expect(paths).toContain(".claude/skills/test/SKILL.md");
    expect(paths).toContain(".cursor/rules/test.mdc");
    expect(paths).toContain(".github/instructions/test.instructions.md");
    expect(paths).toContain(".mcp.json");
    expect(paths).toContain(".cursor/mcp.json");
    expect(paths).toContain(".vscode/mcp.json");
    // No duplicate paths across adapters.
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("skips stages no selected tool can express", async () => {
    const repo = scanRepo(join(__dirname, "fixtures", "vite-react"));
    const stages: string[] = [];
    const { writes } = await buildPlan(repo, {
      yes: true,
      outputs: { ...outputs, settings: true },
      tools: ["agents-md"], // instructions-only tool
      ask: async () => "x",
      onStage: (t) => stages.push(t),
    });
    expect(stages).toEqual([]); // skills/commands/agents/settings/mcp all inexpressible
    expect(writes).toEqual([]);
  });
});
