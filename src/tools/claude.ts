import { PlannedWrite, RepoSnapshot } from "../plugins/types";
import { Section } from "../core/md-document";
import { Artifacts, ToolAdapter } from "./types";
import { planInstructionsWrite } from "./shared";
import { planSkillWrites } from "../generators/skills";
import { planCommandWrites } from "../generators/commands";
import { planAgentWrites } from "../generators/agents";
import { planSettingsWrite, planGuardScriptWrites } from "../generators/settings";
import { planMcpWrite } from "../generators/mcp";

function instructionsTitle(displayName: string): string {
  return `# ${displayName} — agent instructions`;
}

// Claude Code — the full-fidelity target: CLAUDE.md, .claude/{skills,commands,agents},
// settings.json with permissions + guard hooks, project .mcp.json, and the PDD skills.
export const claudeAdapter: ToolAdapter = {
  id: "claude",
  displayName: "Claude Code",
  hint: "CLAUDE.md · .claude/ · .mcp.json",
  detect: (repo) => repo.exists("CLAUDE.md") || repo.exists(".claude"),
  capabilities: { instructions: true, skills: true, commands: true, agents: true, settings: true, mcp: true, pdd: true },
  plan(a: Artifacts, repo: RepoSnapshot): PlannedWrite[] {
    const exists = (p: string) => repo.exists(p);
    const writes: PlannedWrite[] = [];

    if (a.instructions) {
      // The PDD workflow section references .claude/skills/pdd/ paths, so it's injected
      // here (per-tool) rather than into the shared artifact. It lands right before
      // "## Stack" — same placement the pipeline used before the multi-tool split.
      const sections: Section[] = [...a.instructions.sections];
      if (a.pddWorkflow) {
        const stackIdx = sections.findIndex((s) => s.heading === "## Stack");
        const at = stackIdx === -1 ? Math.min(1, sections.length) : stackIdx;
        sections.splice(at, 0, { heading: a.pddWorkflow.heading, body: a.pddWorkflow.body });
      }
      writes.push(planInstructionsWrite("CLAUDE.md", instructionsTitle(a.instructions.displayName), sections, repo));
    }

    writes.push(...planSkillWrites(a.skills, exists));
    writes.push(...planCommandWrites(a.commands, exists));
    writes.push(...planAgentWrites(a.agents, exists));

    if (a.permissions.length > 0) {
      const existing = repo.exists(".claude/settings.json") ? repo.readFile(".claude/settings.json") : null;
      const w = planSettingsWrite(a.permissions, existing);
      if (w) writes.push(w);
      writes.push(...planGuardScriptWrites(a.permissions, exists));
    }

    if (a.mcpServers.length > 0) {
      const existing = repo.exists(".mcp.json") ? repo.readFile(".mcp.json") : null;
      const w = planMcpWrite(a.mcpServers, existing);
      if (w) writes.push(w);
    }

    writes.push(...planSkillWrites(a.pddSkills, exists, "pdd"));
    return writes;
  },
};
