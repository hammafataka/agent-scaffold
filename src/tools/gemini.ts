import { PlannedWrite, RepoSnapshot } from "../plugins/types";
import { Artifacts, ToolAdapter } from "./types";
import { planInstructionsWrite, planMcpJsonWrite, writeOnce } from "./shared";

// TOML multi-line literal string. Literal ('''…''') so markdown bodies need no escaping;
// the (unlikely) ''' inside a body is broken up to keep the TOML valid.
function tomlMultiline(text: string): string {
  return `'''\n${text.replace(/'''/g, "''\\''")}\n'''`;
}

// Gemini CLI — context in GEMINI.md (plain markdown, merged like CLAUDE.md), custom
// slash commands as TOML under .gemini/commands/, MCP servers inside .gemini/settings.json.
export const geminiAdapter: ToolAdapter = {
  id: "gemini",
  displayName: "Gemini CLI",
  hint: "GEMINI.md · .gemini/commands · .gemini/settings.json",
  detect: (repo) => repo.exists("GEMINI.md") || repo.exists(".gemini"),
  capabilities: { instructions: true, skills: false, commands: true, agents: false, settings: false, mcp: true, pdd: false },
  plan(a: Artifacts, repo: RepoSnapshot): PlannedWrite[] {
    const writes: PlannedWrite[] = [];

    if (a.instructions) {
      writes.push(
        planInstructionsWrite(
          "GEMINI.md",
          `# ${a.instructions.displayName} — agent instructions`,
          a.instructions.sections,
          repo,
        ),
      );
    }

    for (const c of a.commands.filter((cm) => cm.condition !== false)) {
      const toml = `description = ${JSON.stringify(c.description)}\nprompt = ${tomlMultiline(c.body)}\n`;
      writes.push(writeOnce(`.gemini/commands/${c.name}.toml`, toml, repo));
    }

    const mcp = planMcpJsonWrite({ path: ".gemini/settings.json", rootKey: "mcpServers", specs: a.mcpServers, repo });
    if (mcp) writes.push(mcp);

    return writes;
  },
};
