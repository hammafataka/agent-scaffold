import { AgentSpec, PlannedWrite, WriteAction } from "../plugins/types";

function write(path: string, content: string, exists: (path: string) => boolean): PlannedWrite {
  const already = exists(path);
  return { path, content, action: already ? WriteAction.Skip : WriteAction.Create, note: already ? "exists" : undefined };
}

export function planAgentWrites(
  specs: AgentSpec[],
  exists: (path: string) => boolean,
): PlannedWrite[] {
  return specs.filter((a) => a.condition !== false).map((a) => {
    const path = `.claude/agents/${a.name}.md`;
    const content = `---\nname: ${a.name}\ndescription: ${a.description}\n---\n\n${a.body}\n`;
    return write(path, content, exists);
  });
}
