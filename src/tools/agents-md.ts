import { PlannedWrite, RepoSnapshot } from "../plugins/types";
import { Artifacts, ToolAdapter } from "./types";
import { planInstructionsWrite } from "./shared";

// The AGENTS.md open standard — read by OpenAI Codex, OpenCode, Zed, Jules, Amp, and a
// growing list of tools (Cursor and Gemini can be pointed at it too). One markdown file
// at the repo root; everything else those tools configure lives in global/user config,
// so instructions are the only project-level artifact.
export const agentsMdAdapter: ToolAdapter = {
  id: "agents-md",
  displayName: "AGENTS.md",
  hint: "the open standard — Codex, OpenCode, Zed, Jules, Amp …",
  detect: (repo) => repo.exists("AGENTS.md") || repo.exists("opencode.json") || repo.exists(".opencode"),
  capabilities: { instructions: true, skills: false, commands: false, agents: false, settings: false, mcp: false, pdd: false },
  plan(a: Artifacts, repo: RepoSnapshot): PlannedWrite[] {
    if (!a.instructions) return [];
    return [
      planInstructionsWrite(
        "AGENTS.md",
        `# ${a.instructions.displayName} — agent instructions`,
        a.instructions.sections,
        repo,
      ),
    ];
  },
};
