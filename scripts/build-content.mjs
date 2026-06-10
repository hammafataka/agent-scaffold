// Bundles authored markdown into content JSON files for the catalog.
//
// Java catalog:  src/catalog/java/  → src/catalog/java-content.json
//   Layout: agents/<name>.md, skills/<name>/SKILL.md, skills/<name>/references/<file>.md
//
// PDD catalog:   src/catalog/pdd/   → src/catalog/pdd-content.json
//   Layout: skills/<name>/SKILL.md, skills/<name>/references/<file>.md
//
// Output shape:
//   { agents: [{name, description, recommended, body}],
//     skills: [{name, description, recommended, body, references: [{path, content}]}] }

import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const javaDir = join(root, "src", "catalog", "java");
const pddDir = join(root, "src", "catalog", "pdd");
const outFile = join(root, "src", "catalog", "java-content.json");
const pddOutFile = join(root, "src", "catalog", "pdd-content.json");

// Split frontmatter (--- ... ---) from body. Returns { meta, body }.
function parseFrontmatter(text) {
  if (!text.startsWith("---")) return { meta: {}, body: text.trim() };
  const end = text.indexOf("\n---", 3);
  if (end === -1) return { meta: {}, body: text.trim() };
  const fm = text.slice(3, end).trim();
  const body = text.slice(end + 4).replace(/^\s*\n/, "").trim();
  const meta = {};
  for (const line of fm.split("\n")) {
    const m = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (m) meta[m[1]] = m[2].trim();
  }
  return { meta, body };
}

function recommendedFlag(meta) {
  return meta.recommended === undefined ? true : meta.recommended !== "false";
}

function listDir(dir) {
  return existsSync(dir) ? readdirSync(dir) : [];
}

const agents = [];
for (const file of listDir(join(javaDir, "agents")).filter((f) => f.endsWith(".md")).sort()) {
  const { meta, body } = parseFrontmatter(readFileSync(join(javaDir, "agents", file), "utf8"));
  agents.push({
    name: file.replace(/\.md$/, ""),
    description: meta.description ?? "",
    recommended: recommendedFlag(meta),
    body,
  });
}

const skills = [];
const skillsDir = join(javaDir, "skills");
for (const name of listDir(skillsDir).filter((d) => statSync(join(skillsDir, d)).isDirectory()).sort()) {
  const skillPath = join(skillsDir, name, "SKILL.md");
  if (!existsSync(skillPath)) continue;
  const { meta, body } = parseFrontmatter(readFileSync(skillPath, "utf8"));
  const references = [];
  const refDir = join(skillsDir, name, "references");
  for (const ref of listDir(refDir).filter((f) => f.endsWith(".md")).sort()) {
    references.push({ path: `references/${ref}`, content: readFileSync(join(refDir, ref), "utf8").trim() + "\n" });
  }
  skills.push({
    name,
    description: meta.description ?? "",
    recommended: recommendedFlag(meta),
    body,
    references,
  });
}

writeFileSync(outFile, JSON.stringify({ agents, skills }, null, 2) + "\n");
console.log(`build-content: ${agents.length} agents, ${skills.length} skills → src/catalog/java-content.json`);

// ── PDD catalog ──────────────────────────────────────────────────────────────

const pddSkills = [];
const pddSkillsDir = join(pddDir, "skills");
for (const name of listDir(pddSkillsDir).filter((d) => statSync(join(pddSkillsDir, d)).isDirectory()).sort()) {
  const skillPath = join(pddSkillsDir, name, "SKILL.md");
  if (!existsSync(skillPath)) continue;
  const { meta, body } = parseFrontmatter(readFileSync(skillPath, "utf8"));
  const references = [];
  const refDir = join(pddSkillsDir, name, "references");
  for (const ref of listDir(refDir).filter((f) => f.endsWith(".md")).sort()) {
    references.push({ path: `references/${ref}`, content: readFileSync(join(refDir, ref), "utf8").trim() + "\n" });
  }
  pddSkills.push({
    name,
    description: meta.description ?? "",
    recommended: recommendedFlag(meta),
    body,
    references,
  });
}

writeFileSync(pddOutFile, JSON.stringify({ skills: pddSkills }, null, 2) + "\n");
console.log(`build-content: ${pddSkills.length} PDD skills → src/catalog/pdd-content.json`);
