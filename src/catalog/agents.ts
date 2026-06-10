import { Facts, AgentSpec } from "../plugins/types";
import content from "./java-content.json";

// Curated subagent definitions for Spring Boot / Java projects.
// Content is authored as markdown under src/catalog/java/agents/ and bundled into
// java-content.json by scripts/build-content.mjs.
export function springAgents(_facts: Facts): AgentSpec[] {
  return (content.agents as AgentSpec[]).map((a) => ({ ...a }));
}
