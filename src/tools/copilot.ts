import { McpServerSpec, PlannedWrite, RepoSnapshot } from "../plugins/types";
import { Artifacts, ToolAdapter } from "./types";
import { frontmatter, planInstructionsWrite, planMcpJsonWrite, writeOnce } from "./shared";

// Rewrite ${VAR} placeholders to VS Code's ${env:VAR} syntax in env values and args.
function toVsCodeEnv(config: McpServerSpec["config"]): Record<string, unknown> {
  const sub = (v: string) => v.replace(/\$\{(\w+)\}/g, "${env:$1}");
  const out: Record<string, unknown> = { command: config.command };
  if (config.args) out.args = config.args.map(sub);
  if (config.env) out.env = Object.fromEntries(Object.entries(config.env).map(([k, v]) => [k, sub(v)]));
  return out;
}

// GitHub Copilot (VS Code) — repo-wide instructions in .github/copilot-instructions.md
// (plain markdown, merged like CLAUDE.md), scoped instruction files, reusable prompts,
// custom chat modes for the agent personas, and MCP servers in .vscode/mcp.json.
export const copilotAdapter: ToolAdapter = {
  id: "copilot",
  displayName: "GitHub Copilot",
  hint: ".github/copilot-instructions.md · prompts · chatmodes · .vscode/mcp.json",
  detect: (repo) =>
    repo.exists(".github/copilot-instructions.md") ||
    repo.exists(".github/instructions") ||
    repo.exists(".github/prompts"),
  capabilities: { instructions: true, skills: true, commands: true, agents: true, settings: false, mcp: true, pdd: false },
  plan(a: Artifacts, repo: RepoSnapshot): PlannedWrite[] {
    const writes: PlannedWrite[] = [];

    if (a.instructions) {
      writes.push(
        planInstructionsWrite(
          ".github/copilot-instructions.md",
          `# ${a.instructions.displayName} — project instructions`,
          a.instructions.sections,
          repo,
        ),
      );
    }

    // Skills → instruction files. applyTo "**" keeps them always-available; the
    // description tells Copilot (and the reader) when they matter.
    for (const s of a.skills.filter((sk) => sk.condition !== false)) {
      writes.push(
        writeOnce(
          `.github/instructions/${s.name}.instructions.md`,
          `${frontmatter({ description: s.description, applyTo: '"**"' })}\n\n${s.body}\n`,
          repo,
        ),
      );
    }

    for (const c of a.commands.filter((cm) => cm.condition !== false)) {
      writes.push(
        writeOnce(
          `.github/prompts/${c.name}.prompt.md`,
          `${frontmatter({ description: c.description })}\n\n${c.body}\n`,
          repo,
        ),
      );
    }

    // Agents → custom chat modes (a persona + instructions the user can switch to).
    for (const ag of a.agents.filter((x) => x.condition !== false)) {
      writes.push(
        writeOnce(
          `.github/chatmodes/${ag.name}.chatmode.md`,
          `${frontmatter({ description: ag.description })}\n\n${ag.body}\n`,
          repo,
        ),
      );
    }

    const mcp = planMcpJsonWrite({
      path: ".vscode/mcp.json",
      rootKey: "servers",
      specs: a.mcpServers,
      repo,
      transform: toVsCodeEnv,
    });
    if (mcp) writes.push(mcp);

    return writes;
  },
};
