import { Facts, AgentSpec } from "../plugins/types";
import content from "./node-content.json";

// Curated subagent definitions for Node / TypeScript projects, authored under
// src/catalog/node/agents/ and bundled by scripts/build-content.mjs. Frontend/backend
// specialists are gated on the detected side(s) of the stack.
export function nodeAgents(facts: Facts): AgentSpec[] {
  const conditions: Record<string, boolean> = {
    "frontend-engineer": facts.isFrontend === true,
    "node-backend-engineer": facts.isServer === true,
  };
  return (content.agents as AgentSpec[]).map((a) => ({
    ...a,
    condition: conditions[a.name] ?? true,
  }));
}
