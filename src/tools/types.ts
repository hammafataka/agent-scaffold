import {
  AgentSpec,
  CommandSpec,
  McpServerSpec,
  PermissionSpec,
  PlannedWrite,
  RepoSnapshot,
  SkillSpec,
} from "../plugins/types";
import { Section } from "../core/md-document";

// Canonical, tool-agnostic output of the interview pipeline. Stack plugins produce these;
// each ToolAdapter translates them into its tool's file layout (CLAUDE.md vs AGENTS.md vs
// .cursor/rules/, .claude/commands/ vs .github/prompts/, …).
export interface Artifacts {
  // The interview-built instructions document (title comes from the stack display name).
  instructions?: { displayName: string; sections: Section[] };
  skills: SkillSpec[];
  commands: CommandSpec[];
  agents: AgentSpec[];
  permissions: PermissionSpec[];
  mcpServers: McpServerSpec[];
  // PDD methodology (Claude-skill based): the skills plus the workflow section that
  // references their install paths. Only adapters with `pdd` capability emit these.
  pddSkills: SkillSpec[];
  pddWorkflow?: { heading: string; body: string };
}

export function emptyArtifacts(): Artifacts {
  return { skills: [], commands: [], agents: [], permissions: [], mcpServers: [], pddSkills: [] };
}

// What a tool can express. Drives which pipeline stages run for a given tool selection
// (a stage runs when at least one selected tool supports it).
export interface ToolCapabilities {
  instructions: boolean;
  skills: boolean;
  commands: boolean;
  agents: boolean;
  settings: boolean;
  mcp: boolean;
  pdd: boolean;
}

export interface ToolAdapter {
  id: string; // e.g. "claude", "cursor" — used by --tools
  displayName: string;
  hint: string; // shown next to the name in the tool picker (where files land)
  // True when the repo already carries this tool's config (pre-checks it in the picker).
  detect(repo: RepoSnapshot): boolean;
  capabilities: ToolCapabilities;
  plan(artifacts: Artifacts, repo: RepoSnapshot): PlannedWrite[];
}
