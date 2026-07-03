import { describe, it, expect } from "vitest";
import { RepoSnapshot } from "../src/plugins/types";
import { readmeSummary } from "../src/core/readme";

function repoWithReadme(text: string | null, name = "README.md"): RepoSnapshot {
  const files = text === null ? [] : [name];
  return {
    root: "/fake",
    files,
    exists: (rel) => files.includes(rel),
    readFile: (rel) => (rel === name && text !== null ? text : null),
    glob: (re) => files.filter((f) => re.test(f)),
  };
}

describe("readmeSummary", () => {
  it("returns the first prose line, skipping title and badges", () => {
    const s = readmeSummary(
      repoWithReadme(
        "# my-app\n\n[![CI](https://x/badge.svg)](https://x)\n\nA payment gateway for transit fares.\n\nMore text.\n",
      ),
    );
    expect(s).toBe("A payment gateway for transit fares.");
  });

  it("strips markdown links and emphasis", () => {
    const s = readmeSummary(repoWithReadme("# t\n\nUses **[Foo](https://foo)** to do `bar` things properly.\n"));
    expect(s).toBe("Uses Foo to do bar things properly.");
  });

  it("truncates very long lines", () => {
    const s = readmeSummary(repoWithReadme(`# t\n\n${"word ".repeat(60)}\n`));
    expect(s!.length).toBeLessThanOrEqual(160);
    expect(s!.endsWith("…")).toBe(true);
  });

  it("handles lowercase readme.md and missing files", () => {
    expect(readmeSummary(repoWithReadme("# t\n\nA thing that does things.\n", "readme.md"))).toBe(
      "A thing that does things.",
    );
    expect(readmeSummary(repoWithReadme(null))).toBeUndefined();
    expect(readmeSummary(repoWithReadme("# only-a-title\n"))).toBeUndefined();
  });
});
