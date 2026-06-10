import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { PlannedWrite, WriteAction } from "../plugins/types";

export interface ApplyOptions {
  root: string;
  dryRun: boolean;
}

export async function applyWrites(writes: PlannedWrite[], opts: ApplyOptions): Promise<void> {
  if (opts.dryRun) return;
  for (const w of writes) {
    if (w.action === WriteAction.Skip) continue;
    const full = join(opts.root, w.path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, w.content, "utf8");
  }
}

export function summarize(writes: PlannedWrite[]): Record<WriteAction, number> {
  const counts: Record<WriteAction, number> = {
    [WriteAction.Create]: 0,
    [WriteAction.Update]: 0,
    [WriteAction.Skip]: 0,
  };
  for (const w of writes) counts[w.action]++;
  return counts;
}
