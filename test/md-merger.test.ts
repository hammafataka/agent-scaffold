import { describe, it, expect } from "vitest";
import { mergeSections, isEmptyBody } from "../src/core/md-merger";
import { parseDocument, serializeDocument } from "../src/core/md-document";

describe("md-merger", () => {
  it("detects empty bodies (blank or comment-only)", () => {
    expect(isEmptyBody("")).toBe(true);
    expect(isEmptyBody("   \n  ")).toBe(true);
    expect(isEmptyBody("<!-- one line: what this does -->")).toBe(true);
    expect(isEmptyBody("<!-- a -->\n<!-- b -->")).toBe(true);
    expect(isEmptyBody("real content")).toBe(false);
    expect(isEmptyBody("<!-- c -->\nreal")).toBe(false);
  });

  it("appends missing, fills empty, keeps user content, preserves custom", () => {
    const existing = parseDocument(
      ["# App", "", "## Overview", "<!-- one line -->", "", "## Tests", "my real tests", "", "## Custom", "mine"].join("\n"),
    );
    const generated = [
      { heading: "## Overview", body: "generated overview" },
      { heading: "## Tests", body: "generated tests" },
      { heading: "## Build & run", body: "generated build" },
    ];
    const { doc, report } = mergeSections(existing, generated);

    const out = serializeDocument(doc);
    expect(out).toContain("generated overview"); // empty filled
    expect(out).toContain("my real tests"); // user kept
    expect(out).not.toContain("generated tests");
    expect(out).toContain("generated build"); // appended
    expect(out).toContain("## Custom"); // preserved

    expect(report).toEqual([
      { heading: "## Overview", status: "filled" },
      { heading: "## Tests", status: "kept" },
      { heading: "## Build & run", status: "added" },
    ]);
    // appended after existing sections, preserving original order
    expect(doc.sections.map((s) => s.heading)).toEqual([
      "## Overview",
      "## Tests",
      "## Custom",
      "## Build & run",
    ]);
  });
});
