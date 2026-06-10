import { describe, it, expect } from "vitest";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanRepo } from "../src/core/repo-scanner";
import { buildPlan } from "../src/core/pipeline";
import { applyWrites, summarize } from "../src/core/writer";

describe("dry-run integration", () => {
  it("plans writes but writes nothing to disk in dry-run", async () => {
    const repo = scanRepo(join(__dirname, "fixtures", "gradle-app"));
    const { writes } = await buildPlan(repo, {
      yes: true,
      outputs: { claudeMd: true, skills: true, commands: true, agents: true, settings: true, pdd: false },
      ask: async (f) => `ANSWER:${f.key}`,
    });
    expect(writes.length).toBeGreaterThan(0);
    expect(writes.every((w) => w.action === "create")).toBe(true);

    const out = await mkdtemp(join(tmpdir(), "cs-int-"));
    try {
      await applyWrites(writes, { root: out, dryRun: true });
      expect(await readdir(out)).toEqual([]); // nothing written
    } finally {
      await rm(out, { recursive: true, force: true });
    }

    const counts = summarize(writes);
    expect(counts.create).toBe(writes.length);
    expect(counts.update).toBe(0);
    expect(counts.skip).toBe(0);
  });
});
