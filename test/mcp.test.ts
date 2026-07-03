import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { planMcpWrite } from "../src/generators/mcp";
import { scanRepo } from "../src/core/repo-scanner";
import { buildPlan } from "../src/core/pipeline";
import { context7, atlassian, playwright } from "../src/catalog/mcp-servers";

const outputs = { instructions: false, skills: false, commands: false, agents: false, settings: false, mcp: true, pdd: false };

describe("planMcpWrite", () => {
  it("creates .mcp.json with the chosen servers", () => {
    const w = planMcpWrite([context7(), atlassian()], null)!;
    expect(w.path).toBe(".mcp.json");
    expect(w.action).toBe("create");
    const json = JSON.parse(w.content);
    expect(json.mcpServers.context7.command).toBe("npx");
    expect(json.mcpServers.atlassian.env.JIRA_PERSONAL_TOKEN).toBe("${JIRA_PERSONAL_TOKEN}");
  });

  it("never overwrites an existing server entry", () => {
    const existing = JSON.stringify({
      mcpServers: { context7: { command: "custom", args: ["my-fork"] } },
    });
    const w = planMcpWrite([context7(), playwright(true)], existing)!;
    expect(w.action).toBe("update");
    const json = JSON.parse(w.content);
    expect(json.mcpServers.context7.command).toBe("custom"); // user's entry kept
    expect(json.mcpServers.playwright).toBeDefined(); // new one added
  });

  it("returns null when everything is already configured", () => {
    const existing = JSON.stringify({ mcpServers: { context7: { command: "npx" } } });
    expect(planMcpWrite([context7()], existing)).toBeNull();
  });

  it("skips servers whose condition is false", () => {
    const w = planMcpWrite([{ ...playwright(true), condition: false }], null);
    expect(w).toBeNull();
  });
});

describe("MCP pipeline stage", () => {
  it("emits recommended servers for a frontend repo in --yes mode", async () => {
    const repo = scanRepo(join(__dirname, "fixtures", "vite-react"));
    const { writes } = await buildPlan(repo, { yes: true, outputs, ask: async () => "x" });
    const mcp = writes.find((w) => w.path === ".mcp.json")!;
    expect(mcp).toBeDefined();
    const json = JSON.parse(mcp.content);
    expect(json.mcpServers.context7).toBeDefined();
    expect(json.mcpServers.playwright).toBeDefined(); // frontend → recommended
    expect(json.mcpServers.atlassian).toBeUndefined(); // opt-in only
  });

  it("does not recommend playwright for a plain server repo", async () => {
    const repo = scanRepo(join(__dirname, "fixtures", "express-api"));
    const { writes } = await buildPlan(repo, { yes: true, outputs, ask: async () => "x" });
    const json = JSON.parse(writes.find((w) => w.path === ".mcp.json")!.content);
    expect(json.mcpServers.context7).toBeDefined();
    expect(json.mcpServers.playwright).toBeUndefined();
  });
});
