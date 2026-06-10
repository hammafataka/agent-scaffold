import { describe, it, expect } from "vitest";
import { parseDocument, serializeDocument, normalizeHeading } from "../src/core/md-document";

describe("md-document", () => {
  it("parses title, preamble, and sections", () => {
    const text = [
      "# My App — Claude instructions",
      "",
      "intro line",
      "",
      "## Overview",
      "does things",
      "",
      "## Tests",
      "run them",
      "",
    ].join("\n");
    const doc = parseDocument(text);
    expect(doc.title).toBe("# My App — Claude instructions");
    expect(doc.preamble.trim()).toBe("intro line");
    expect(doc.sections.map((s) => s.heading)).toEqual(["## Overview", "## Tests"]);
    expect(doc.sections[0].body.trim()).toBe("does things");
  });

  it("round-trips a document", () => {
    const text = "# T\n\npre\n\n## A\nbody a\n\n## B\nbody b\n";
    expect(serializeDocument(parseDocument(text)).trim()).toBe(text.trim());
  });

  it("handles a document with no title and no preamble", () => {
    const doc = parseDocument("## Only\ncontent\n");
    expect(doc.title).toBe("");
    expect(doc.preamble).toBe("");
    expect(doc.sections[0].heading).toBe("## Only");
  });

  it("normalizes headings for matching", () => {
    expect(normalizeHeading("## Build & run")).toBe("build & run");
    expect(normalizeHeading("###  Build & Run ")).toBe("build & run");
  });
});
