import { CommandSpec, PlannedWrite, WriteAction } from "../plugins/types";

function write(path: string, content: string, exists: (path: string) => boolean): PlannedWrite {
  const already = exists(path);
  return { path, content, action: already ? WriteAction.Skip : WriteAction.Create, note: already ? "exists" : undefined };
}

export function planCommandWrites(
  specs: CommandSpec[],
  exists: (path: string) => boolean,
): PlannedWrite[] {
  return specs.filter((c) => c.condition !== false).map((c) => {
    const path = `.claude/commands/${c.name}.md`;
    const content = `---\ndescription: ${c.description}\n---\n\n${c.body}\n`;
    return write(path, content, exists);
  });
}
