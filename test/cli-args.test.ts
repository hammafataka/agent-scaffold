import { describe, it, expect } from "vitest";
import { parseArgs } from "../src/cli";

describe("parseArgs", () => {
  it("defaults to interactive, write mode", () => {
    expect(parseArgs([])).toEqual({ dryRun: false, yes: false });
  });
  it("parses --dry-run and --yes", () => {
    expect(parseArgs(["--dry-run", "--yes"])).toEqual({ dryRun: true, yes: true });
  });
});
