import { StackPlugin, Facts, McpServerSpec } from "../types";
import { detectNodeTs } from "./detect";
import { nodeTsSections } from "./sections";
import { nodeTsSettings } from "./settings";
import { nodeSkills } from "../../catalog/node-skills";
import { nodeCommands } from "../../catalog/node-commands";
import { nodeAgents } from "../../catalog/node-agents";
import { atlassian, context7, github, playwright, postgres } from "../../catalog/mcp-servers";

// Summary lines for the CLI's "Detected" note.
function nodeDescribe(facts: Facts): string[] {
  const lines: string[] = [];
  const stack = [
    facts.isTypeScript ? "TypeScript" : "JavaScript",
    facts.nodeVersion ? `Node ${facts.nodeVersion}` : null,
    facts.nodeFramework ? String(facts.nodeFramework) : null,
    facts.projectType ? String(facts.projectType) : null,
    facts.packageManager ? String(facts.packageManager) : null,
  ].filter(Boolean);
  lines.push(stack.join("  ·  "));
  if (facts.monorepoTool) lines.push(`Monorepo: ${facts.monorepoTool} (${facts.packageCount ?? "?"} packages)`);
  if (facts.orm) lines.push(`ORM: ${facts.orm}`);
  const quality = [facts.testRunner, facts.e2eRunner, facts.linter, facts.formatter].filter(Boolean);
  if (quality.length) lines.push(`Tooling: ${quality.join(", ")}`);
  if (facts.runCmd) lines.push(`Run: ${facts.runCmd}`);
  if (facts.testCmd) lines.push(`Test: ${facts.testCmd}`);
  return lines;
}

function nodeMcpServers(facts: Facts): McpServerSpec[] {
  return [
    context7(true),
    // Browser automation is the natural verify-loop for a frontend.
    { ...playwright(facts.isFrontend === true), condition: facts.isFrontend === true },
    { ...postgres(false), condition: facts.orm !== undefined && facts.orm !== "mongoose" },
    atlassian(false),
    github(false),
  ];
}

export const nodeTsPlugin: StackPlugin = {
  id: "node-ts",
  displayName: "Node.js / TypeScript",
  detect: detectNodeTs,
  describe: nodeDescribe,
  sections: nodeTsSections,
  skills: nodeSkills,
  commands: nodeCommands,
  agents: nodeAgents,
  settings: nodeTsSettings,
  mcpServers: nodeMcpServers,
};
