import { PlannedWrite, RepoSnapshot } from "../plugins/types";
import { serializeDocument } from "../core/md-document";
import { Artifacts, ToolAdapter } from "./types";
import { frontmatter, planMcpJsonWrite, writeOnce } from "./shared";

// Cursor — project rules under .cursor/rules/ (.mdc with frontmatter), commands under
// .cursor/commands/, MCP servers in .cursor/mcp.json (same shape as Claude's .mcp.json).
// Rules files are created once and never merged: Cursor users hand-tune .mdc files and
// the frontmatter would not survive a markdown-level merge.
export const cursorAdapter: ToolAdapter = {
  id: "cursor",
  displayName: "Cursor",
  hint: ".cursor/rules · .cursor/commands · .cursor/mcp.json",
  detect: (repo) => repo.exists(".cursor") || repo.exists(".cursorrules"),
  capabilities: { instructions: true, skills: true, commands: true, agents: false, settings: false, mcp: true, pdd: false },
  plan(a: Artifacts, repo: RepoSnapshot): PlannedWrite[] {
    const writes: PlannedWrite[] = [];

    if (a.instructions) {
      const doc = serializeDocument({
        title: `# ${a.instructions.displayName} — project instructions`,
        preamble: "",
        sections: a.instructions.sections.filter((s) => s.body.trim() !== ""),
      });
      writes.push(
        writeOnce(
          ".cursor/rules/project-instructions.mdc",
          `${frontmatter({ description: "Project-wide instructions", alwaysApply: "true" })}\n\n${doc}`,
          repo,
        ),
      );
    }

    // Skills map to agent-requested rules: attached when the description matches the task.
    for (const s of a.skills.filter((sk) => sk.condition !== false)) {
      writes.push(
        writeOnce(
          `.cursor/rules/${s.name}.mdc`,
          `${frontmatter({ description: s.description, alwaysApply: "false" })}\n\n${s.body}\n`,
          repo,
        ),
      );
    }

    for (const c of a.commands.filter((cm) => cm.condition !== false)) {
      writes.push(writeOnce(`.cursor/commands/${c.name}.md`, `# ${c.name}\n\n${c.body}\n`, repo));
    }

    const mcp = planMcpJsonWrite({ path: ".cursor/mcp.json", rootKey: "mcpServers", specs: a.mcpServers, repo });
    if (mcp) writes.push(mcp);

    return writes;
  },
};
