import { Facts, AgentSpec } from "../plugins/types";
import content from "./dart-content.json";

// Curated subagent definitions for Dart / Flutter projects.
// Content is authored as markdown under src/catalog/dart/agents/ and bundled into
// dart-content.json by scripts/build-content.mjs.
export function dartAgents(_facts: Facts): AgentSpec[] {
  return (content.agents as AgentSpec[]).map((a) => ({ ...a }));
}
