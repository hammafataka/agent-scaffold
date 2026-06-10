export interface Section {
  heading: string; // full heading line, e.g. "## Build & run"
  body: string; // raw text between this heading and the next
}

export interface MdDocument {
  title: string; // full "# ..." line, or "" if none
  preamble: string; // text between title and first section
  sections: Section[];
}

export function normalizeHeading(heading: string): string {
  return heading.replace(/^#+\s*/, "").trim().toLowerCase();
}

export function parseDocument(text: string): MdDocument {
  const lines = text.split("\n");
  let title = "";
  let i = 0;

  if (lines[0] !== undefined && /^#\s+/.test(lines[0])) {
    title = lines[0];
    i = 1;
  }

  const preambleLines: string[] = [];
  while (i < lines.length && !/^##\s+/.test(lines[i])) {
    preambleLines.push(lines[i]);
    i++;
  }

  const sections: Section[] = [];
  while (i < lines.length) {
    const heading = lines[i];
    i++;
    const bodyLines: string[] = [];
    while (i < lines.length && !/^##\s+/.test(lines[i])) {
      bodyLines.push(lines[i]);
      i++;
    }
    sections.push({ heading, body: bodyLines.join("\n").replace(/^\n+|\n+$/g, "") });
  }

  return { title, preamble: preambleLines.join("\n").replace(/^\n+|\n+$/g, ""), sections };
}

export function serializeDocument(doc: MdDocument): string {
  const parts: string[] = [];
  if (doc.title) parts.push(doc.title);
  if (doc.preamble.trim()) parts.push(doc.preamble.trim());
  for (const s of doc.sections) {
    parts.push(`${s.heading}\n${s.body}`.trimEnd());
  }
  return parts.join("\n\n") + "\n";
}
