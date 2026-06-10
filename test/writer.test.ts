import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyWrites, summarize } from "../src/core/writer";
import { PlannedWrite, WriteAction } from "../src/plugins/types";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "cs-write-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const writes: PlannedWrite[] = [
  { path: "CLAUDE.md", content: "hi\n", action: WriteAction.Create },
  { path: ".claude/skills/run/SKILL.md", content: "skill\n", action: WriteAction.Create },
  { path: ".claude/commands/build.md", content: "x", action: WriteAction.Skip, note: "exists" },
];

describe("writer", () => {
  it("dry-run writes nothing", async () => {
    await applyWrites(writes, { root: dir, dryRun: true });
    expect(existsSync(join(dir, "CLAUDE.md"))).toBe(false);
  });

  it("applies create writes (mkdir -p), respects skip", async () => {
    await applyWrites(writes, { root: dir, dryRun: false });
    expect(await readFile(join(dir, "CLAUDE.md"), "utf8")).toBe("hi\n");
    expect(await readFile(join(dir, ".claude/skills/run/SKILL.md"), "utf8")).toBe("skill\n");
    expect(existsSync(join(dir, ".claude/commands/build.md"))).toBe(false);
  });

  it("summarize counts by action", () => {
    expect(summarize(writes)).toEqual({ create: 2, update: 0, skip: 1 });
  });
});
