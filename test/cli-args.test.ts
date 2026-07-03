import { describe, it, expect } from "vitest";
import { parseArgs, helpText } from "../src/cli";

describe("parseArgs", () => {
  it("defaults to interactive, write mode", () => {
    const a = parseArgs([]);
    expect(a.dryRun).toBe(false);
    expect(a.yes).toBe(false);
    expect(a.help).toBe(false);
    expect(a.version).toBe(false);
    expect(a.stack).toBeUndefined();
    expect(a.errors).toEqual([]);
  });

  it("parses --dry-run and --yes", () => {
    const a = parseArgs(["--dry-run", "--yes"]);
    expect(a.dryRun).toBe(true);
    expect(a.yes).toBe(true);
    expect(a.errors).toEqual([]);
  });

  it("parses -h / -v shorthands", () => {
    expect(parseArgs(["-h"]).help).toBe(true);
    expect(parseArgs(["-v"]).version).toBe(true);
  });

  it("parses --stack with a value", () => {
    expect(parseArgs(["--stack", "node-ts"]).stack).toBe("node-ts");
  });

  it("errors on --stack without a value", () => {
    expect(parseArgs(["--stack"]).errors).toHaveLength(1);
    expect(parseArgs(["--stack", "--yes"]).errors).toHaveLength(1);
  });

  it("errors on unknown flags", () => {
    const a = parseArgs(["--nope"]);
    expect(a.errors).toEqual(["Unknown option: --nope"]);
  });

  it("parses --tools as a comma-separated list", () => {
    expect(parseArgs(["--tools", "claude,cursor,copilot"]).tools).toEqual(["claude", "cursor", "copilot"]);
  });

  it("errors on --tools without a value", () => {
    expect(parseArgs(["--tools"]).errors).toHaveLength(1);
    expect(parseArgs(["--tools", "--yes"]).errors).toHaveLength(1);
  });
});

describe("helpText", () => {
  it("lists the flags, available stacks, and available tools", () => {
    const h = helpText();
    expect(h).toContain("--dry-run");
    expect(h).toContain("--stack");
    expect(h).toContain("--tools");
    expect(h).toContain("node-ts");
    expect(h).toContain("spring-boot");
    expect(h).toContain("dart-flutter");
    expect(h).toContain("generic");
    expect(h).toContain("cursor");
    expect(h).toContain("copilot");
    expect(h).toContain("agents-md");
  });
});
