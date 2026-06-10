import { SkillSpec, PlannedWrite, WriteAction } from "../plugins/types";

function write(path: string, content: string, exists: (path: string) => boolean): PlannedWrite {
  const already = exists(path);
  return {
    path,
    content,
    action: already ? WriteAction.Skip : WriteAction.Create,
    note: already ? "exists" : undefined,
  };
}

export function planSkillWrites(
  specs: SkillSpec[],
  exists: (path: string) => boolean,
  prefix?: string,
): PlannedWrite[] {
  const writes: PlannedWrite[] = [];
  for (const s of specs.filter((sp) => sp.condition !== false)) {
    const dir = prefix ? `.claude/skills/${prefix}/${s.name}` : `.claude/skills/${s.name}`;
    const content = `---\nname: ${s.name}\ndescription: ${s.description}\n---\n\n${s.body}\n`;
    writes.push(write(`${dir}/SKILL.md`, content, exists));
    for (const ref of s.references ?? []) {
      writes.push(write(`${dir}/${ref.path}`, ref.content, exists));
    }
  }
  return writes;
}
