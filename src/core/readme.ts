import { RepoSnapshot } from "../plugins/types";

// Pull a one-line project summary out of the README: the first real prose line —
// skipping the title, badges, images, HTML, and blockquotes. Used to pre-fill the
// "## Overview" prompt so the required field usually just needs an Enter.
export function readmeSummary(repo: RepoSnapshot): string | undefined {
  const name = repo.files.find((f) => /^readme\.md$/i.test(f));
  const text = name ? repo.readFile(name) : null;
  if (!text) return undefined;

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) continue; // headings
    if (line.startsWith("[![") || line.startsWith("![") || line.startsWith("[!")) continue; // badges/images
    if (line.startsWith("<") || line.startsWith(">")) continue; // html / blockquotes
    if (line.startsWith("---") || line.startsWith("```")) continue; // rules / code fences
    // Strip inline markdown links/emphasis for a cleaner prompt default.
    const plain = line
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[*_`]/g, "")
      .trim();
    if (plain.length < 10) continue; // too short to be a summary
    return plain.length > 160 ? `${plain.slice(0, 157)}…` : plain;
  }
  return undefined;
}
