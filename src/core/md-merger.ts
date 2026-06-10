import { MdDocument, Section, normalizeHeading } from "./md-document";

export enum MergeStatus {
  Added = "added",
  Filled = "filled",
  Kept = "kept",
}

export interface MergeEntry {
  heading: string;
  status: MergeStatus;
}

export function isEmptyBody(body: string): boolean {
  const stripped = body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => !/^<!--.*-->$/.test(l));
  return stripped.length === 0;
}

export function mergeSections(
  existing: MdDocument,
  generated: Section[],
): { doc: MdDocument; report: MergeEntry[] } {
  const sections: Section[] = existing.sections.map((s) => ({ ...s }));
  const indexByKey = new Map<string, number>();
  sections.forEach((s, idx) => indexByKey.set(normalizeHeading(s.heading), idx));

  const report: MergeEntry[] = [];

  for (const gen of generated) {
    const key = normalizeHeading(gen.heading);
    const idx = indexByKey.get(key);
    if (idx === undefined) {
      sections.push({ ...gen });
      indexByKey.set(key, sections.length - 1);
      report.push({ heading: gen.heading, status: MergeStatus.Added });
    } else if (isEmptyBody(sections[idx].body)) {
      sections[idx] = { heading: sections[idx].heading, body: gen.body };
      report.push({ heading: gen.heading, status: MergeStatus.Filled });
    } else {
      report.push({ heading: gen.heading, status: MergeStatus.Kept });
    }
  }

  return { doc: { ...existing, sections }, report };
}
