import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanRepo } from "../src/core/repo-scanner";

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "cs-scan-"));
  await mkdir(join(dir, "src"), { recursive: true });
  await mkdir(join(dir, "node_modules", "x"), { recursive: true });
  await writeFile(join(dir, "pom.xml"), "<project/>");
  await writeFile(join(dir, "src", "App.java"), "class App {}");
  await writeFile(join(dir, "node_modules", "x", "ignored.js"), "nope");
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("scanRepo", () => {
  it("lists files, skips ignored dirs, reads and globs", () => {
    const repo = scanRepo(dir);
    expect(repo.files).toContain("pom.xml");
    expect(repo.files).toContain("src/App.java");
    expect(repo.files.some((f) => f.includes("node_modules"))).toBe(false);
    expect(repo.exists("pom.xml")).toBe(true);
    expect(repo.exists("missing.txt")).toBe(false);
    expect(repo.readFile("pom.xml")).toBe("<project/>");
    expect(repo.readFile("missing.txt")).toBeNull();
    expect(repo.glob(/\.java$/)).toEqual(["src/App.java"]);
  });
});
