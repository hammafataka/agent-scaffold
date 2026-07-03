import { RepoSnapshot } from "../plugins/types";
import { ToolAdapter, ToolCapabilities } from "./types";
import { claudeAdapter } from "./claude";
import { cursorAdapter } from "./cursor";
import { copilotAdapter } from "./copilot";
import { geminiAdapter } from "./gemini";
import { agentsMdAdapter } from "./agents-md";
import { windsurfAdapter } from "./windsurf";

// Order matters: it's the display order in the tool picker (Claude first as the default).
export const TOOLS: ToolAdapter[] = [
  claudeAdapter,
  agentsMdAdapter,
  cursorAdapter,
  copilotAdapter,
  geminiAdapter,
  windsurfAdapter,
];

export function toolIds(): string[] {
  return TOOLS.map((t) => t.id);
}

export function resolveTools(ids: string[]): ToolAdapter[] {
  const out: ToolAdapter[] = [];
  for (const id of ids) {
    const t = TOOLS.find((x) => x.id === id);
    if (!t) throw new Error(`Unknown tool "${id}". Available: ${toolIds().join(", ")}`);
    out.push(t);
  }
  return out;
}

// Tools whose config already exists in the repo — pre-checked in the picker. An empty
// result means "nothing configured yet"; callers default to Claude.
export function detectTools(repo: RepoSnapshot): string[] {
  return TOOLS.filter((t) => t.detect(repo)).map((t) => t.id);
}

// Union of what the selected tools can express — a pipeline stage only runs when at
// least one selected tool can emit its output.
export function combinedCapabilities(tools: ToolAdapter[]): ToolCapabilities {
  const merge = (k: keyof ToolCapabilities) => tools.some((t) => t.capabilities[k]);
  return {
    instructions: merge("instructions"),
    skills: merge("skills"),
    commands: merge("commands"),
    agents: merge("agents"),
    settings: merge("settings"),
    mcp: merge("mcp"),
    pdd: merge("pdd"),
  };
}
