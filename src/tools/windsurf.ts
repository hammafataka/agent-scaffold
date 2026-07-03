import { PlannedWrite, RepoSnapshot } from "../plugins/types";
import { serializeDocument } from "../core/md-document";
import { Artifacts, ToolAdapter } from "./types";
import { writeOnce } from "./shared";

// Windsurf — rules under .windsurf/rules/ (plain markdown; activation mode is configured
// in the Windsurf UI) and workflows under .windsurf/workflows/. MCP config is global-only
// (~/.codeium/windsurf/), so no project-level MCP artifact.
export const windsurfAdapter: ToolAdapter = {
  id: "windsurf",
  displayName: "Windsurf",
  hint: ".windsurf/rules · .windsurf/workflows",
  detect: (repo) => repo.exists(".windsurf") || repo.exists(".windsurfrules"),
  capabilities: { instructions: true, skills: true, commands: true, agents: false, settings: false, mcp: false, pdd: false },
  plan(a: Artifacts, repo: RepoSnapshot): PlannedWrite[] {
    const writes: PlannedWrite[] = [];

    if (a.instructions) {
      const doc = serializeDocument({
        title: `# ${a.instructions.displayName} — project instructions`,
        preamble: "",
        sections: a.instructions.sections.filter((s) => s.body.trim() !== ""),
      });
      writes.push(writeOnce(".windsurf/rules/project-instructions.md", doc, repo));
    }

    for (const s of a.skills.filter((sk) => sk.condition !== false)) {
      writes.push(writeOnce(`.windsurf/rules/${s.name}.md`, `# ${s.name}\n\n> ${s.description}\n\n${s.body}\n`, repo));
    }

    for (const c of a.commands.filter((cm) => cm.condition !== false)) {
      writes.push(writeOnce(`.windsurf/workflows/${c.name}.md`, `# ${c.name}\n\n> ${c.description}\n\n${c.body}\n`, repo));
    }

    return writes;
  },
};
