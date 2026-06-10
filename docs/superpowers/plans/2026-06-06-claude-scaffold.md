# claude-scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node/TypeScript CLI (`npx claude-scaffold`) that auto-detects a repo's stack (Spring Boot first) and generates/merges a `CLAUDE.md` plus optional skills, slash commands, and `settings.json` permissions, prompting only for facts it can't detect.

**Architecture:** A pluggable stack registry: each plugin turns a read-only `RepoSnapshot` into detected facts and section/skill/command/permission specs. A pure pipeline resolves section fields (detected default → prompt fallback), merges generated sections into any existing CLAUDE.md (fill missing/empty only), and emits planned writes that a single dry-run-aware writer applies. `repo-scanner` is the only reader of the target repo; `writer` the only writer; `prompter` the only user-facing I/O.

**Tech Stack:** TypeScript (ESM), `tsup` (build), `vitest` (test), `@clack/prompts` (interactive prompts), Node 18+.

---

## File structure

```
src/
  cli.ts                      # flag parsing, run orchestration, prints report
  core/
    pipeline.ts               # scan → detect → select → resolve → merge → plan writes
    repo-scanner.ts           # RepoSnapshot factory (ONLY target-repo reader)
    field-resolver.ts         # resolve SectionSpec fields → values (detect or ask)
    prompter.ts               # @clack wrapper (ONLY user-facing I/O)
    md-document.ts            # parse/serialize CLAUDE.md as ordered sections
    md-merger.ts              # merge generated sections into existing document
    writer.ts                 # apply PlannedWrite[] (dry-run aware), build report
  plugins/
    types.ts                  # all shared interfaces
    registry.ts               # detect across plugins, pick winner, generic fallback
    generic/index.ts          # stack-agnostic fallback plugin
    spring-boot/
      index.ts                # assembles the plugin from the modules below
      detect.ts               # build-file/repo parsing → facts
      sections.ts             # CLAUDE.md SectionSpec[]
      skills.ts               # SkillSpec[]
      commands.ts             # CommandSpec[]
      settings.ts             # PermissionSpec[]
  generators/
    skills.ts                 # SkillSpec[] → PlannedWrite[]
    commands.ts               # CommandSpec[] → PlannedWrite[]
    settings.ts               # PermissionSpec[] → PlannedWrite (JSON merge)
test/
  fixtures/maven-app/...      # tiny Maven Spring Boot tree
  fixtures/gradle-app/...     # tiny Gradle Spring Boot tree
  *.test.ts                   # co-located by module under test/
```

---

## Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsup.config.ts`
- Create: `vitest.config.ts`
- Create: `src/cli.ts` (placeholder entry)

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "claude-scaffold",
  "version": "0.1.0",
  "description": "Bootstrap Claude Code config (CLAUDE.md, skills, commands, settings) for a repo by auto-detecting its stack.",
  "type": "module",
  "bin": { "claude-scaffold": "dist/cli.js" },
  "files": ["dist"],
  "engines": { "node": ">=18" },
  "scripts": {
    "build": "tsup",
    "dev": "tsx src/cli.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@clack/prompts": "^0.7.0"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "tsup": "^8.0.0",
    "tsx": "^4.7.0",
    "typescript": "^5.4.0",
    "vitest": "^1.4.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": false,
    "outDir": "dist",
    "types": ["node"]
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Create `tsup.config.ts`**

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  target: "node18",
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
});
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["test/**/*.test.ts"] },
});
```

- [ ] **Step 5: Create placeholder `src/cli.ts`**

```ts
export async function main(_argv: string[]): Promise<number> {
  return 0;
}
```

- [ ] **Step 6: Install and verify**

Run: `npm install && npm run typecheck`
Expected: install succeeds; typecheck exits 0 with no output.

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json tsup.config.ts vitest.config.ts src/cli.ts package-lock.json
git commit -m "chore: scaffold claude-scaffold project (ts, tsup, vitest)"
```

---

## Task 2: Shared types

**Files:**
- Create: `src/plugins/types.ts`

- [ ] **Step 1: Write the types**

```ts
// Read-only view of the target repository. Only repo-scanner constructs this.
export interface RepoSnapshot {
  root: string;
  files: string[]; // repo-relative POSIX paths
  exists(rel: string): boolean;
  readFile(rel: string): string | null; // null if missing/unreadable
  glob(pattern: RegExp): string[]; // files whose relative path matches
}

export type FactValue = string | boolean | number | undefined;
export interface Facts {
  [key: string]: FactValue;
}

export interface DetectionResult {
  confidence: number; // 0..1
  facts: Facts;
}

export type FieldKind = "text" | "multiline" | "confirm";

export interface FieldSpec {
  key: string;
  question: string;
  detectedValue?: string; // pre-filled default; absent = truly unknown
  required: boolean;
  kind: FieldKind;
}

export interface SectionSpec {
  heading: string; // e.g. "## Build & run"
  fields: FieldSpec[];
  render(values: Record<string, string>): string; // body markdown, no heading
}

export interface SkillSpec {
  name: string; // kebab-case; becomes .claude/skills/<name>/SKILL.md
  description: string;
  body: string; // markdown after frontmatter
  condition?: boolean; // default true; false = not emitted
}

export interface CommandSpec {
  name: string; // becomes .claude/commands/<name>.md
  description: string;
  body: string;
  condition?: boolean;
}

export interface PermissionSpec {
  allow: string[]; // e.g. ["Bash(./gradlew:*)"]
}

export interface StackPlugin {
  id: string;
  displayName: string;
  detect(repo: RepoSnapshot): DetectionResult;
  sections(facts: Facts): SectionSpec[];
  skills(facts: Facts): SkillSpec[];
  commands(facts: Facts): CommandSpec[];
  settings(facts: Facts): PermissionSpec[];
}

// Output of the pipeline, consumed by the writer.
export type WriteAction = "create" | "update" | "skip";
export interface PlannedWrite {
  path: string; // repo-relative POSIX path
  content: string;
  action: WriteAction;
  note?: string; // e.g. "kept user content", "exists"
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/plugins/types.ts
git commit -m "feat: add shared plugin/pipeline types"
```

---

## Task 3: Markdown document parse/serialize

**Files:**
- Create: `src/core/md-document.ts`
- Test: `test/md-document.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/md-document.test.ts`
Expected: FAIL — cannot find module `md-document`.

- [ ] **Step 3: Write the implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/md-document.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/md-document.ts test/md-document.test.ts
git commit -m "feat: parse/serialize CLAUDE.md into ordered sections"
```

---

## Task 4: Section merge engine

**Files:**
- Create: `src/core/md-merger.ts`
- Test: `test/md-merger.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/md-merger.test.ts`
Expected: FAIL — cannot find module `md-merger`.

- [ ] **Step 3: Write the implementation**

```ts
import { MdDocument, Section, normalizeHeading } from "./md-document";

export type MergeStatus = "added" | "filled" | "kept";
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
      report.push({ heading: gen.heading, status: "added" });
    } else if (isEmptyBody(sections[idx].body)) {
      sections[idx] = { heading: sections[idx].heading, body: gen.body };
      report.push({ heading: gen.heading, status: "filled" });
    } else {
      report.push({ heading: gen.heading, status: "kept" });
    }
  }

  return { doc: { ...existing, sections }, report };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/md-merger.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/md-merger.ts test/md-merger.test.ts
git commit -m "feat: section-aware merge (append/fill/keep)"
```

---

## Task 5: Field resolver

**Files:**
- Create: `src/core/field-resolver.ts`
- Test: `test/field-resolver.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { resolveFields } from "../src/core/field-resolver";
import { FieldSpec } from "../src/plugins/types";

const fields: FieldSpec[] = [
  { key: "detected", question: "Q1", detectedValue: "auto", required: true, kind: "text" },
  { key: "needed", question: "Q2", required: true, kind: "text" },
  { key: "optional", question: "Q3", required: false, kind: "text" },
];

describe("resolveFields", () => {
  it("--yes: uses detected, prompts only required-unknown, blanks optional-unknown", async () => {
    const ask = vi.fn(async () => "answered");
    const values = await resolveFields(fields, { yes: true, ask });
    expect(values).toEqual({ detected: "auto", needed: "answered", optional: "" });
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask).toHaveBeenCalledWith(fields[1]);
  });

  it("interactive: asks every field (ask returns user input, default-aware)", async () => {
    const ask = vi.fn(async (f: FieldSpec) => `${f.key}-val`);
    const values = await resolveFields(fields, { yes: false, ask });
    expect(values).toEqual({ detected: "detected-val", needed: "needed-val", optional: "optional-val" });
    expect(ask).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/field-resolver.test.ts`
Expected: FAIL — cannot find module `field-resolver`.

- [ ] **Step 3: Write the implementation**

```ts
import { FieldSpec } from "../plugins/types";

export interface ResolveOptions {
  yes: boolean;
  ask: (field: FieldSpec) => Promise<string>;
}

export async function resolveFields(
  fields: FieldSpec[],
  opts: ResolveOptions,
): Promise<Record<string, string>> {
  const values: Record<string, string> = {};
  for (const field of fields) {
    if (opts.yes) {
      if (field.detectedValue !== undefined) {
        values[field.key] = field.detectedValue;
      } else if (field.required) {
        values[field.key] = await opts.ask(field);
      } else {
        values[field.key] = "";
      }
    } else {
      values[field.key] = await opts.ask(field);
    }
  }
  return values;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/field-resolver.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/field-resolver.ts test/field-resolver.test.ts
git commit -m "feat: resolve section fields (detected default or prompt)"
```

---

## Task 6: Repo scanner

**Files:**
- Create: `src/core/repo-scanner.ts`
- Test: `test/repo-scanner.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/repo-scanner.test.ts`
Expected: FAIL — cannot find module `repo-scanner`.

- [ ] **Step 3: Write the implementation**

```ts
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { RepoSnapshot } from "../plugins/types";

const IGNORED_DIRS = new Set([
  ".git", "node_modules", "dist", "build", "target", ".gradle", ".idea", "out", ".next",
]);
const MAX_DEPTH = 8;

function walk(root: string, dir: string, depth: number, acc: string[]): void {
  if (depth > MAX_DEPTH) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (IGNORED_DIRS.has(e.name)) continue;
      walk(root, join(dir, e.name), depth + 1, acc);
    } else if (e.isFile()) {
      acc.push(relative(root, join(dir, e.name)).split(sep).join("/"));
    }
  }
}

export function scanRepo(root: string): RepoSnapshot {
  const files: string[] = [];
  walk(root, root, 0, files);
  files.sort();

  return {
    root,
    files,
    exists(rel) {
      return existsSync(join(root, rel));
    },
    readFile(rel) {
      try {
        const full = join(root, rel);
        if (!statSync(full).isFile()) return null;
        return readFileSync(full, "utf8");
      } catch {
        return null;
      }
    },
    glob(pattern) {
      return files.filter((f) => pattern.test(f));
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/repo-scanner.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/core/repo-scanner.ts test/repo-scanner.test.ts
git commit -m "feat: read-only repo scanner (RepoSnapshot)"
```

---

## Task 7: Generic fallback plugin

**Files:**
- Create: `src/plugins/generic/index.ts`
- Test: `test/generic-plugin.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { genericPlugin } from "../src/plugins/generic/index";

describe("genericPlugin", () => {
  it("always returns low non-zero confidence", () => {
    const r = genericPlugin.detect({
      root: "/x", files: [], exists: () => false, readFile: () => null, glob: () => [],
    });
    expect(r.confidence).toBeGreaterThan(0);
    expect(r.confidence).toBeLessThan(0.2);
  });

  it("offers prompt-only sections with required fields", () => {
    const sections = genericPlugin.sections({});
    expect(sections.map((s) => s.heading)).toContain("## Overview");
    const overview = sections.find((s) => s.heading === "## Overview")!;
    expect(overview.fields[0].required).toBe(true);
    expect(overview.fields[0].detectedValue).toBeUndefined();
    expect(overview.render({ overview: "hi" })).toContain("hi");
  });

  it("emits no skills/commands/settings", () => {
    expect(genericPlugin.skills({})).toEqual([]);
    expect(genericPlugin.commands({})).toEqual([]);
    expect(genericPlugin.settings({})).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/generic-plugin.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

```ts
import { StackPlugin, SectionSpec } from "../types";

function prompted(heading: string, key: string, question: string): SectionSpec {
  return {
    heading,
    fields: [{ key, question, required: true, kind: "multiline" }],
    render: (v) => v[key] ?? "",
  };
}

export const genericPlugin: StackPlugin = {
  id: "generic",
  displayName: "Generic project",
  detect: () => ({ confidence: 0.1, facts: {} }),
  sections: () => [
    prompted("## Overview", "overview", "One line: what does this project do?"),
    prompted("## Build & run", "build", "How do you build and run it? (exact commands)"),
    prompted("## Tests", "tests", "How do you run tests, and what does 'done' require?"),
    prompted("## Code conventions", "conventions", "Formatting / style conventions to follow?"),
    prompted("## Never do", "never", "Things Claude must never do in this repo?"),
  ],
  skills: () => [],
  commands: () => [],
  settings: () => [],
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/generic-plugin.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/plugins/generic/index.ts test/generic-plugin.test.ts
git commit -m "feat: generic fallback plugin"
```

---

## Task 8: Spring Boot detection

**Files:**
- Create: `src/plugins/spring-boot/detect.ts`
- Create: `test/fixtures/gradle-app/build.gradle.kts`
- Create: `test/fixtures/gradle-app/gradlew`
- Create: `test/fixtures/gradle-app/src/main/resources/application.yml`
- Create: `test/fixtures/gradle-app/src/main/resources/db/migration/V1__init.sql`
- Create: `test/fixtures/maven-app/pom.xml`
- Create: `test/fixtures/maven-app/mvnw`
- Test: `test/spring-detect.test.ts`

- [ ] **Step 1: Create the Gradle fixture**

`test/fixtures/gradle-app/build.gradle.kts`:
```kotlin
plugins {
  id("org.springframework.boot") version "3.3.0"
  java
}
java { sourceCompatibility = JavaVersion.VERSION_21 }
dependencies {
  implementation("org.springframework.boot:spring-boot-starter-web")
  implementation("org.springframework.boot:spring-boot-starter-data-jpa")
  implementation("org.flywaydb:flyway-core")
}
```

`test/fixtures/gradle-app/gradlew`:
```
#!/bin/sh
echo gradlew
```

`test/fixtures/gradle-app/src/main/resources/application.yml`:
```yaml
spring:
  profiles:
    active: dev
```

`test/fixtures/gradle-app/src/main/resources/db/migration/V1__init.sql`:
```sql
create table t (id int);
```

- [ ] **Step 2: Create the Maven fixture**

`test/fixtures/maven-app/pom.xml`:
```xml
<project>
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.2.5</version>
  </parent>
  <properties><java.version>17</java.version></properties>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-security</artifactId>
    </dependency>
  </dependencies>
</project>
```

`test/fixtures/maven-app/mvnw`:
```
#!/bin/sh
echo mvnw
```

- [ ] **Step 3: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { scanRepo } from "../src/core/repo-scanner";
import { detectSpringBoot } from "../src/plugins/spring-boot/detect";

const fixt = (name: string) => join(__dirname, "fixtures", name);

describe("detectSpringBoot", () => {
  it("detects a Gradle Spring Boot app", () => {
    const r = detectSpringBoot(scanRepo(fixt("gradle-app")));
    expect(r.confidence).toBeGreaterThan(0.7);
    expect(r.facts.buildTool).toBe("gradle");
    expect(r.facts.springBootVersion).toBe("3.3.0");
    expect(r.facts.javaVersion).toBe("21");
    expect(r.facts.hasWeb).toBe(true);
    expect(r.facts.hasJpa).toBe(true);
    expect(r.facts.migrationTool).toBe("flyway");
    expect(r.facts.runCmd).toBe("./gradlew bootRun");
    expect(r.facts.buildCmd).toBe("./gradlew clean build");
    expect(r.facts.testCmd).toBe("./gradlew test");
  });

  it("detects a Maven Spring Boot app", () => {
    const r = detectSpringBoot(scanRepo(fixt("maven-app")));
    expect(r.confidence).toBeGreaterThan(0.7);
    expect(r.facts.buildTool).toBe("maven");
    expect(r.facts.springBootVersion).toBe("3.2.5");
    expect(r.facts.javaVersion).toBe("17");
    expect(r.facts.hasSecurity).toBe(true);
    expect(r.facts.runCmd).toBe("./mvnw spring-boot:run");
  });

  it("returns zero confidence for a non-spring repo", () => {
    const r = detectSpringBoot({
      root: "/x", files: ["index.js"], exists: () => false, readFile: () => null, glob: () => [],
    });
    expect(r.confidence).toBe(0);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run test/spring-detect.test.ts`
Expected: FAIL — cannot find module `detect`.

- [ ] **Step 5: Write the implementation**

```ts
import { RepoSnapshot, DetectionResult, Facts } from "../types";

export function detectSpringBoot(repo: RepoSnapshot): DetectionResult {
  const pom = repo.readFile("pom.xml");
  const gradleKts = repo.readFile("build.gradle.kts");
  const gradleGroovy = repo.readFile("build.gradle");
  const gradle = gradleKts ?? gradleGroovy;

  const buildText = pom ?? gradle;
  if (!buildText) return { confidence: 0, facts: {} };

  const isSpring = /org\.springframework\.boot/.test(buildText);
  if (!isSpring) return { confidence: 0, facts: {} };

  const facts: Facts = {};
  const buildTool: "maven" | "gradle" = pom ? "maven" : "gradle";
  facts.buildTool = buildTool;

  // Spring Boot version
  const verMatch =
    buildText.match(/spring-boot-starter-parent<\/artifactId>\s*<version>([^<]+)</) ||
    buildText.match(/org\.springframework\.boot["')\s:]+version\s*["']?([\d.]+)/) ||
    buildText.match(/id\(["']org\.springframework\.boot["']\)\s*version\s*["']([\d.]+)["']/);
  if (verMatch) facts.springBootVersion = verMatch[1];

  // Java version
  const javaMatch =
    buildText.match(/<java\.version>([^<]+)</) ||
    buildText.match(/VERSION_(\d+)/) ||
    buildText.match(/sourceCompatibility\s*=\s*["']?(\d+)/) ||
    buildText.match(/languageVersion.*?JavaLanguageVersion\.of\((\d+)\)/);
  if (javaMatch) facts.javaVersion = javaMatch[1];

  facts.hasWeb = /spring-boot-starter-web\b/.test(buildText);
  facts.hasJpa = /spring-boot-starter-data-jpa\b/.test(buildText);
  facts.hasSecurity = /spring-boot-starter-security\b/.test(buildText);

  // Migration tool
  if (/flyway/.test(buildText) || repo.glob(/db\/migration\/.+\.sql$/).length > 0) {
    facts.migrationTool = "flyway";
  } else if (/liquibase/.test(buildText) || repo.glob(/(changelog|db\/changelog).+\.(xml|ya?ml)$/i).length > 0) {
    facts.migrationTool = "liquibase";
  } else {
    facts.migrationTool = "none";
  }

  // Profiles from application.yml
  const appYml = repo.readFile("src/main/resources/application.yml") ||
    repo.readFile("src/main/resources/application.yaml") ||
    repo.readFile("src/main/resources/application.properties");
  if (appYml) {
    const prof = appYml.match(/active:\s*([A-Za-z0-9,\s-]+)/) ||
      appYml.match(/spring\.profiles\.active\s*=\s*(.+)/);
    if (prof) facts.activeProfile = prof[1].trim();
  }

  // Commands (prefer wrapper)
  const hasMvnw = repo.exists("mvnw");
  const hasGradlew = repo.exists("gradlew");
  if (buildTool === "maven") {
    const mvn = hasMvnw ? "./mvnw" : "mvn";
    facts.runCmd = `${mvn} spring-boot:run`;
    facts.buildCmd = `${mvn} clean package`;
    facts.testCmd = `${mvn} test`;
  } else {
    const gw = hasGradlew ? "./gradlew" : "gradle";
    facts.runCmd = `${gw} bootRun`;
    facts.buildCmd = `${gw} clean build`;
    facts.testCmd = `${gw} test`;
  }

  return { confidence: 0.9, facts };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run test/spring-detect.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add src/plugins/spring-boot/detect.ts test/fixtures test/spring-detect.test.ts
git commit -m "feat: Spring Boot detection (maven/gradle facts)"
```

---

## Task 9: Spring Boot sections

**Files:**
- Create: `src/plugins/spring-boot/sections.ts`
- Test: `test/spring-sections.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { springSections } from "../src/plugins/spring-boot/sections";

describe("springSections", () => {
  const facts = {
    buildTool: "gradle", springBootVersion: "3.3.0", javaVersion: "21",
    hasWeb: true, hasJpa: true, hasSecurity: false, migrationTool: "flyway",
    runCmd: "./gradlew bootRun", buildCmd: "./gradlew clean build", testCmd: "./gradlew test",
  };

  it("pre-fills detectable fields and renders the Stack section", () => {
    const sections = springSections(facts);
    const stack = sections.find((s) => s.heading === "## Stack")!;
    const stackField = stack.fields.find((f) => f.key === "stack")!;
    expect(stackField.detectedValue).toContain("Spring Boot 3.3.0");
    expect(stackField.detectedValue).toContain("Java 21");
    expect(stack.render({ stack: stackField.detectedValue! })).toContain("Spring Boot 3.3.0");
  });

  it("leaves Overview/Never do as required, unprefilled prompts", () => {
    const sections = springSections(facts);
    const overview = sections.find((s) => s.heading === "## Overview")!;
    expect(overview.fields[0].required).toBe(true);
    expect(overview.fields[0].detectedValue).toBeUndefined();
    const never = sections.find((s) => s.heading === "## Never do")!;
    expect(never.fields[0].detectedValue).toBeUndefined();
  });

  it("includes Persistence only when migrationTool is set, with detected default", () => {
    const sections = springSections(facts);
    const persistence = sections.find((s) => s.heading === "## Persistence")!;
    const f = persistence.fields.find((x) => x.key === "persistence")!;
    expect(f.detectedValue).toContain("Flyway");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/spring-sections.test.ts`
Expected: FAIL — cannot find module `sections`.

- [ ] **Step 3: Write the implementation**

```ts
import { Facts, SectionSpec, FieldSpec } from "../types";

const str = (f: Facts, k: string): string | undefined =>
  f[k] === undefined ? undefined : String(f[k]);

function detectedSection(heading: string, key: string, question: string, detected: string | undefined, required: boolean): SectionSpec {
  const field: FieldSpec = { key, question, required, kind: "multiline" };
  if (detected !== undefined) field.detectedValue = detected;
  return { heading, fields: [field], render: (v) => v[key] ?? "" };
}

export function springSections(facts: Facts): SectionSpec[] {
  const buildTool = str(facts, "buildTool");
  const sbVer = str(facts, "springBootVersion");
  const javaVer = str(facts, "javaVersion");
  const runCmd = str(facts, "runCmd");
  const buildCmd = str(facts, "buildCmd");
  const testCmd = str(facts, "testCmd");
  const migrationTool = str(facts, "migrationTool");
  const profile = str(facts, "activeProfile");

  const starters: string[] = [];
  if (facts.hasWeb) starters.push("Web");
  if (facts.hasJpa) starters.push("JPA");
  if (facts.hasSecurity) starters.push("Security");

  const stackDetected = [
    sbVer ? `Spring Boot ${sbVer}` : null,
    javaVer ? `Java ${javaVer}` : null,
    buildTool ? buildTool[0].toUpperCase() + buildTool.slice(1) : null,
    starters.length ? `Starters: ${starters.join(", ")}` : null,
  ].filter(Boolean).join(", ");

  const buildDetected = [
    runCmd ? `- Run: \`${runCmd}\`` : null,
    buildCmd ? `- Build: \`${buildCmd}\`` : null,
  ].filter(Boolean).join("\n");

  const testsDetected = testCmd
    ? `Run tests with \`${testCmd}\`. "Done" means the build passes and new code is covered by tests.`
    : undefined;

  const persistenceDetected =
    migrationTool && migrationTool !== "none"
      ? `Uses JPA/Hibernate. Migrations via ${migrationTool === "flyway" ? "Flyway" : "Liquibase"}.`
      : undefined;

  const configDetected = profile ? `Profiles configured; active profile: \`${profile}\`.` : undefined;

  const sections: SectionSpec[] = [
    detectedSection("## Overview", "overview", "One line: what does this service do?", undefined, true),
    detectedSection("## Stack", "stack", "Confirm/adjust the stack summary:", stackDetected || undefined, true),
    detectedSection("## Architecture", "architecture", "Package layout / layering (controller/service/repository, package-by-feature?):", undefined, true),
    detectedSection("## Build & run", "build", "Confirm build/run commands:", buildDetected || undefined, true),
    detectedSection("## Tests", "tests", "How to run tests and what 'done' requires:", testsDetected, true),
  ];

  if (migrationTool && migrationTool !== "none") {
    sections.push(detectedSection("## Persistence", "persistence", "DB / migrations details:", persistenceDetected, true));
  }

  sections.push(
    detectedSection("## Config & profiles", "config", "Profiles, env vars, secrets — what NOT to touch:", configDetected, true),
    detectedSection("## API conventions", "api", "REST patterns, DTO vs entity, validation, error handling:", undefined, false),
    detectedSection("## Code conventions", "conventions", "Formatting, Lombok or not, null/Optional policy, logging style:", undefined, false),
    detectedSection("## Dependencies", "dependencies", "Rule on adding deps; approved libraries:", "Don't add dependencies without asking first.", false),
    detectedSection("## Git workflow", "git", "Branch naming, commit/MR style, run tests before commit:", undefined, false),
    detectedSection("## Never do", "never", "Hard rules (don't log secrets, don't weaken SecurityConfig, don't edit generated code):", undefined, true),
    detectedSection("## Gotchas", "gotchas", "Project-specific quirks:", undefined, false),
  );

  return sections;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/spring-sections.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/plugins/spring-boot/sections.ts test/spring-sections.test.ts
git commit -m "feat: Spring Boot CLAUDE.md sections"
```

---

## Task 10: Spring Boot skills, commands, settings

**Files:**
- Create: `src/plugins/spring-boot/skills.ts`
- Create: `src/plugins/spring-boot/commands.ts`
- Create: `src/plugins/spring-boot/settings.ts`
- Test: `test/spring-extras.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { springSkills } from "../src/plugins/spring-boot/skills";
import { springCommands } from "../src/plugins/spring-boot/commands";
import { springSettings } from "../src/plugins/spring-boot/settings";

const facts = {
  buildTool: "gradle", runCmd: "./gradlew bootRun", buildCmd: "./gradlew clean build",
  testCmd: "./gradlew test", migrationTool: "flyway",
};

describe("spring extras", () => {
  it("skills include run/test, and add-migration only with a migration tool", () => {
    const names = springSkills(facts).filter((s) => s.condition !== false).map((s) => s.name);
    expect(names).toContain("run");
    expect(names).toContain("test");
    expect(names).toContain("add-migration");
    const noMig = springSkills({ ...facts, migrationTool: "none" })
      .filter((s) => s.condition !== false).map((s) => s.name);
    expect(noMig).not.toContain("add-migration");
  });

  it("run skill body references the detected run command", () => {
    const run = springSkills(facts).find((s) => s.name === "run")!;
    expect(run.body).toContain("./gradlew bootRun");
  });

  it("commands include build and verify", () => {
    const names = springCommands(facts).map((c) => c.name);
    expect(names).toEqual(["build", "verify"]);
    expect(springCommands(facts).find((c) => c.name === "build")!.body).toContain("./gradlew clean build");
  });

  it("settings allowlist the detected wrapper", () => {
    const perms = springSettings(facts);
    expect(perms[0].allow).toContain("Bash(./gradlew:*)");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/spring-extras.test.ts`
Expected: FAIL — cannot find modules.

- [ ] **Step 3: Implement `skills.ts`**

```ts
import { Facts, SkillSpec } from "../types";

const s = (f: Facts, k: string): string => String(f[k] ?? "");

export function springSkills(facts: Facts): SkillSpec[] {
  const runCmd = s(facts, "runCmd");
  const testCmd = s(facts, "testCmd");
  const migrationTool = s(facts, "migrationTool");
  const hasMigration = migrationTool === "flyway" || migrationTool === "liquibase";

  return [
    {
      name: "run",
      description: "Start the Spring Boot application locally.",
      body: `Use this to run the app.\n\n\`\`\`bash\n${runCmd}\n\`\`\`\n\nThe app starts on the configured port. Stop with Ctrl-C.`,
    },
    {
      name: "test",
      description: "Run the test suite and confirm it passes.",
      body: `Run all tests:\n\n\`\`\`bash\n${testCmd}\n\`\`\`\n\n"Done" requires a green build with new code covered by tests.`,
    },
    {
      name: "add-migration",
      description: "Create a new database migration in the correct location and naming scheme.",
      condition: hasMigration,
      body:
        migrationTool === "flyway"
          ? "Add a Flyway migration under `src/main/resources/db/migration/`.\n\nName it `V<next-number>__<snake_case_description>.sql` (e.g. `V7__add_user_index.sql`). Find the next number by listing existing `V*` files. Never edit an applied migration — add a new one."
          : "Add a Liquibase changeset. Create a new changelog file and include it from the master changelog. Use a unique `id` and your author tag. Never edit an applied changeset — add a new one.",
    },
  ];
}
```

- [ ] **Step 4: Implement `commands.ts`**

```ts
import { Facts, CommandSpec } from "../types";

const s = (f: Facts, k: string): string => String(f[k] ?? "");

export function springCommands(facts: Facts): CommandSpec[] {
  const buildCmd = s(facts, "buildCmd");
  const testCmd = s(facts, "testCmd");
  return [
    {
      name: "build",
      description: "Clean build/package the project.",
      body: `Build the project:\n\n\`\`\`bash\n${buildCmd}\n\`\`\``,
    },
    {
      name: "verify",
      description: "Build and run all tests before committing.",
      body: `Verify the project is green:\n\n\`\`\`bash\n${buildCmd}\n${testCmd}\n\`\`\`\n\nFix any failures before committing.`,
    },
  ];
}
```

- [ ] **Step 5: Implement `settings.ts`**

```ts
import { Facts, PermissionSpec } from "../types";

export function springSettings(facts: Facts): PermissionSpec[] {
  const buildTool = String(facts.buildTool ?? "");
  const wrapper =
    buildTool === "maven" ? "Bash(./mvnw:*)" : buildTool === "gradle" ? "Bash(./gradlew:*)" : null;
  const allow: string[] = [];
  if (wrapper) allow.push(wrapper);
  return allow.length ? [{ allow }] : [];
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run test/spring-extras.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add src/plugins/spring-boot/skills.ts src/plugins/spring-boot/commands.ts src/plugins/spring-boot/settings.ts test/spring-extras.test.ts
git commit -m "feat: Spring Boot skills, commands, settings"
```

---

## Task 11: Assemble Spring Boot plugin + registry

**Files:**
- Create: `src/plugins/spring-boot/index.ts`
- Create: `src/plugins/registry.ts`
- Test: `test/registry.test.ts`

- [ ] **Step 1: Implement `spring-boot/index.ts`**

```ts
import { StackPlugin } from "../types";
import { detectSpringBoot } from "./detect";
import { springSections } from "./sections";
import { springSkills } from "./skills";
import { springCommands } from "./commands";
import { springSettings } from "./settings";

export const springBootPlugin: StackPlugin = {
  id: "spring-boot",
  displayName: "Spring Boot",
  detect: detectSpringBoot,
  sections: springSections,
  skills: springSkills,
  commands: springCommands,
  settings: springSettings,
};
```

- [ ] **Step 2: Write the failing registry test**

```ts
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { scanRepo } from "../src/core/repo-scanner";
import { selectPlugin, PLUGINS } from "../src/plugins/registry";

describe("registry", () => {
  it("picks Spring Boot for a spring repo", () => {
    const repo = scanRepo(join(__dirname, "fixtures", "gradle-app"));
    const { plugin, detection } = selectPlugin(repo, PLUGINS);
    expect(plugin.id).toBe("spring-boot");
    expect(detection.facts.buildTool).toBe("gradle");
  });

  it("falls back to generic when nothing clears the threshold", () => {
    const repo = { root: "/x", files: ["README.md"], exists: () => false, readFile: () => null, glob: () => [] };
    const { plugin } = selectPlugin(repo, PLUGINS);
    expect(plugin.id).toBe("generic");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run test/registry.test.ts`
Expected: FAIL — cannot find module `registry`.

- [ ] **Step 4: Implement `registry.ts`**

```ts
import { StackPlugin, RepoSnapshot, DetectionResult } from "./types";
import { springBootPlugin } from "./spring-boot/index";
import { genericPlugin } from "./generic/index";

// Real stack plugins (generic is the fallback, not in this list).
export const PLUGINS: StackPlugin[] = [springBootPlugin];

const THRESHOLD = 0.5;

export function selectPlugin(
  repo: RepoSnapshot,
  plugins: StackPlugin[],
): { plugin: StackPlugin; detection: DetectionResult } {
  let best: { plugin: StackPlugin; detection: DetectionResult } | null = null;
  for (const plugin of plugins) {
    const detection = plugin.detect(repo);
    if (!best || detection.confidence > best.detection.confidence) {
      best = { plugin, detection };
    }
  }
  if (best && best.detection.confidence >= THRESHOLD) return best;
  return { plugin: genericPlugin, detection: genericPlugin.detect(repo) };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/registry.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/plugins/spring-boot/index.ts src/plugins/registry.ts test/registry.test.ts
git commit -m "feat: assemble Spring Boot plugin and selection registry"
```

---

## Task 12: Generators (skills, commands, settings → PlannedWrite)

**Files:**
- Create: `src/generators/skills.ts`
- Create: `src/generators/commands.ts`
- Create: `src/generators/settings.ts`
- Test: `test/generators.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { planSkillWrites } from "../src/generators/skills";
import { planCommandWrites } from "../src/generators/commands";
import { planSettingsWrite } from "../src/generators/settings";

describe("generators", () => {
  it("skills: emits SKILL.md per enabled spec, frontmatter + body", () => {
    const writes = planSkillWrites(
      [
        { name: "run", description: "Run it", body: "do run" },
        { name: "hidden", description: "no", body: "x", condition: false },
      ],
      () => false,
    );
    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe(".claude/skills/run/SKILL.md");
    expect(writes[0].action).toBe("create");
    expect(writes[0].content).toContain("name: run");
    expect(writes[0].content).toContain("description: Run it");
    expect(writes[0].content).toContain("do run");
  });

  it("skills: marks existing files as skip", () => {
    const writes = planSkillWrites([{ name: "run", description: "Run it", body: "b" }], () => true);
    expect(writes[0].action).toBe("skip");
  });

  it("commands: emits one md per spec", () => {
    const writes = planCommandWrites([{ name: "build", description: "Build", body: "go" }], () => false);
    expect(writes[0].path).toBe(".claude/commands/build.md");
    expect(writes[0].content).toContain("description: Build");
    expect(writes[0].content).toContain("go");
  });

  it("settings: merges allowlist into existing JSON without dropping entries", () => {
    const existing = JSON.stringify({ permissions: { allow: ["Bash(ls:*)"] } });
    const w = planSettingsWrite([{ allow: ["Bash(./gradlew:*)"] }], existing)!;
    expect(w.action).toBe("update");
    const parsed = JSON.parse(w.content);
    expect(parsed.permissions.allow).toContain("Bash(ls:*)");
    expect(parsed.permissions.allow).toContain("Bash(./gradlew:*)");
  });

  it("settings: creates fresh JSON when none exists; null when nothing to add", () => {
    const w = planSettingsWrite([{ allow: ["Bash(./mvnw:*)"] }], null)!;
    expect(w.action).toBe("create");
    expect(planSettingsWrite([], null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/generators.test.ts`
Expected: FAIL — cannot find modules.

- [ ] **Step 3: Implement `skills.ts`**

```ts
import { SkillSpec, PlannedWrite } from "../plugins/types";

export function planSkillWrites(
  specs: SkillSpec[],
  exists: (path: string) => boolean,
): PlannedWrite[] {
  return specs
    .filter((s) => s.condition !== false)
    .map((s) => {
      const path = `.claude/skills/${s.name}/SKILL.md`;
      const content = `---\nname: ${s.name}\ndescription: ${s.description}\n---\n\n${s.body}\n`;
      const already = exists(path);
      return {
        path,
        content,
        action: already ? "skip" : "create",
        note: already ? "exists" : undefined,
      } as PlannedWrite;
    });
}
```

- [ ] **Step 4: Implement `commands.ts`**

```ts
import { CommandSpec, PlannedWrite } from "../plugins/types";

export function planCommandWrites(
  specs: CommandSpec[],
  exists: (path: string) => boolean,
): PlannedWrite[] {
  return specs
    .filter((c) => c.condition !== false)
    .map((c) => {
      const path = `.claude/commands/${c.name}.md`;
      const content = `---\ndescription: ${c.description}\n---\n\n${c.body}\n`;
      const already = exists(path);
      return {
        path,
        content,
        action: already ? "skip" : "create",
        note: already ? "exists" : undefined,
      } as PlannedWrite;
    });
}
```

- [ ] **Step 5: Implement `settings.ts`**

```ts
import { PermissionSpec, PlannedWrite } from "../plugins/types";

const PATH = ".claude/settings.json";

export function planSettingsWrite(
  specs: PermissionSpec[],
  existingRaw: string | null,
): PlannedWrite | null {
  const toAdd = specs.flatMap((s) => s.allow);
  if (toAdd.length === 0) return null;

  let json: { permissions?: { allow?: string[] } } = {};
  if (existingRaw) {
    try {
      json = JSON.parse(existingRaw);
    } catch {
      json = {};
    }
  }
  json.permissions ??= {};
  const current = json.permissions.allow ?? [];
  const merged = Array.from(new Set([...current, ...toAdd]));
  json.permissions.allow = merged;

  return {
    path: PATH,
    content: JSON.stringify(json, null, 2) + "\n",
    action: existingRaw ? "update" : "create",
  };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run test/generators.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 7: Commit**

```bash
git add src/generators test/generators.test.ts
git commit -m "feat: generators for skills, commands, settings"
```

---

## Task 13: Writer

**Files:**
- Create: `src/core/writer.ts`
- Test: `test/writer.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyWrites, summarize } from "../src/core/writer";
import { PlannedWrite } from "../src/plugins/types";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "cs-write-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const writes: PlannedWrite[] = [
  { path: "CLAUDE.md", content: "hi\n", action: "create" },
  { path: ".claude/skills/run/SKILL.md", content: "skill\n", action: "create" },
  { path: ".claude/commands/build.md", content: "x", action: "skip", note: "exists" },
];

describe("writer", () => {
  it("dry-run writes nothing", async () => {
    await applyWrites(writes, { root: dir, dryRun: true });
    expect(existsSync(join(dir, "CLAUDE.md"))).toBe(false);
  });

  it("applies create writes (mkdir -p), respects skip", async () => {
    await applyWrites(writes, { root: dir, dryRun: false });
    expect(await readFile(join(dir, "CLAUDE.md"), "utf8")).toBe("hi\n");
    expect(await readFile(join(dir, ".claude/skills/run/SKILL.md"), "utf8")).toBe("skill\n");
    expect(existsSync(join(dir, ".claude/commands/build.md"))).toBe(false);
  });

  it("summarize counts by action", () => {
    expect(summarize(writes)).toEqual({ create: 2, update: 0, skip: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/writer.test.ts`
Expected: FAIL — cannot find module `writer`.

- [ ] **Step 3: Write the implementation**

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { PlannedWrite, WriteAction } from "../plugins/types";

export interface ApplyOptions {
  root: string;
  dryRun: boolean;
}

export async function applyWrites(writes: PlannedWrite[], opts: ApplyOptions): Promise<void> {
  if (opts.dryRun) return;
  for (const w of writes) {
    if (w.action === "skip") continue;
    const full = join(opts.root, w.path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, w.content, "utf8");
  }
}

export function summarize(writes: PlannedWrite[]): Record<WriteAction, number> {
  const counts: Record<WriteAction, number> = { create: 0, update: 0, skip: 0 };
  for (const w of writes) counts[w.action]++;
  return counts;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/writer.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/writer.ts test/writer.test.ts
git commit -m "feat: dry-run-aware writer with action summary"
```

---

## Task 14: Pipeline

**Files:**
- Create: `src/core/pipeline.ts`
- Test: `test/pipeline.test.ts`

The pipeline is pure with respect to I/O *decisions*: it takes a `RepoSnapshot` and an
injected `ask`/`selectOutputs`, and returns `PlannedWrite[]` plus the chosen plugin. The CLI
wires real scanning/prompting/writing around it.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { scanRepo } from "../src/core/repo-scanner";
import { buildPlan } from "../src/core/pipeline";

const repo = scanRepo(join(__dirname, "fixtures", "gradle-app"));

const allOutputs = { claudeMd: true, skills: true, commands: true, settings: true };

describe("buildPlan", () => {
  it("produces a CLAUDE.md plan from detected + answered fields", async () => {
    const { plugin, writes } = await buildPlan(repo, {
      yes: true,
      outputs: allOutputs,
      ask: async (f) => `ANSWER:${f.key}`,
    });
    expect(plugin.id).toBe("spring-boot");

    const claude = writes.find((w) => w.path === "CLAUDE.md")!;
    expect(claude.action).toBe("create");
    expect(claude.content).toContain("## Build & run");
    expect(claude.content).toContain("./gradlew bootRun"); // detected
    expect(claude.content).toContain("ANSWER:overview"); // prompted (no detected value)

    expect(writes.some((w) => w.path === ".claude/skills/run/SKILL.md")).toBe(true);
    expect(writes.some((w) => w.path === ".claude/commands/build.md")).toBe(true);
    expect(writes.some((w) => w.path === ".claude/settings.json")).toBe(true);
  });

  it("merges into an existing CLAUDE.md, keeping user content", async () => {
    const repoWithClaude = {
      ...repo,
      exists: (rel: string) => rel === "CLAUDE.md" || repo.exists(rel),
      readFile: (rel: string) =>
        rel === "CLAUDE.md" ? "# App\n\n## Overview\nMY SERVICE\n" : repo.readFile(rel),
    };
    const { writes } = await buildPlan(repoWithClaude, {
      yes: true,
      outputs: { claudeMd: true, skills: false, commands: false, settings: false },
      ask: async (f) => `ANSWER:${f.key}`,
    });
    const claude = writes.find((w) => w.path === "CLAUDE.md")!;
    expect(claude.action).toBe("update");
    expect(claude.content).toContain("MY SERVICE"); // user kept
    expect(claude.content).not.toContain("ANSWER:overview"); // not overwritten
    expect(claude.content).toContain("## Build & run"); // new section appended
  });

  it("respects output toggles", async () => {
    const { writes } = await buildPlan(repo, {
      yes: true,
      outputs: { claudeMd: true, skills: false, commands: false, settings: false },
      ask: async () => "x",
    });
    expect(writes.every((w) => w.path === "CLAUDE.md")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/pipeline.test.ts`
Expected: FAIL — cannot find module `pipeline`.

- [ ] **Step 3: Write the implementation**

```ts
import { RepoSnapshot, StackPlugin, FieldSpec, PlannedWrite, Facts } from "../plugins/types";
import { selectPlugin, PLUGINS } from "../plugins/registry";
import { resolveFields } from "./field-resolver";
import { parseDocument, serializeDocument, Section } from "./md-document";
import { mergeSections } from "./md-merger";
import { planSkillWrites } from "../generators/skills";
import { planCommandWrites } from "../generators/commands";
import { planSettingsWrite } from "../generators/settings";

export interface OutputToggles {
  claudeMd: boolean;
  skills: boolean;
  commands: boolean;
  settings: boolean;
}

export interface PlanOptions {
  yes: boolean;
  outputs: OutputToggles;
  ask: (field: FieldSpec) => Promise<string>;
}

export interface Plan {
  plugin: StackPlugin;
  facts: Facts;
  writes: PlannedWrite[];
}

function titleLine(displayName: string): string {
  return `# ${displayName} — Claude instructions`;
}

async function buildClaudeMd(
  repo: RepoSnapshot,
  plugin: StackPlugin,
  facts: Facts,
  opts: PlanOptions,
): Promise<PlannedWrite> {
  const specs = plugin.sections(facts);
  const generated: Section[] = [];
  for (const spec of specs) {
    const values = await resolveFields(spec.fields, { yes: opts.yes, ask: opts.ask });
    generated.push({ heading: spec.heading, body: spec.render(values) });
  }

  const existingRaw = repo.exists("CLAUDE.md") ? repo.readFile("CLAUDE.md") : null;
  if (existingRaw) {
    const { doc } = mergeSections(parseDocument(existingRaw), generated);
    return { path: "CLAUDE.md", content: serializeDocument(doc), action: "update" };
  }
  const doc = { title: titleLine(plugin.displayName), preamble: "", sections: generated };
  return { path: "CLAUDE.md", content: serializeDocument(doc), action: "create" };
}

export async function buildPlan(repo: RepoSnapshot, opts: PlanOptions): Promise<Plan> {
  const { plugin, detection } = selectPlugin(repo, PLUGINS);
  const facts = detection.facts;
  const writes: PlannedWrite[] = [];

  if (opts.outputs.claudeMd) {
    writes.push(await buildClaudeMd(repo, plugin, facts, opts));
  }
  if (opts.outputs.skills) {
    writes.push(...planSkillWrites(plugin.skills(facts), (p) => repo.exists(p)));
  }
  if (opts.outputs.commands) {
    writes.push(...planCommandWrites(plugin.commands(facts), (p) => repo.exists(p)));
  }
  if (opts.outputs.settings) {
    const existing = repo.exists(".claude/settings.json")
      ? repo.readFile(".claude/settings.json")
      : null;
    const w = planSettingsWrite(plugin.settings(facts), existing);
    if (w) writes.push(w);
  }

  return { plugin, facts, writes };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/pipeline.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/pipeline.ts test/pipeline.test.ts
git commit -m "feat: pipeline assembling planned writes"
```

---

## Task 15: Prompter (clack wrapper)

**Files:**
- Create: `src/core/prompter.ts`

> No unit test: this module only adapts `@clack/prompts` to our function shapes and is exercised by the CLI/manual run. Keep it thin — all logic lives in tested modules.

- [ ] **Step 1: Implement `prompter.ts`**

```ts
import * as p from "@clack/prompts";
import { FieldSpec } from "../plugins/types";
import { OutputToggles } from "./pipeline";

export function bail(): never {
  p.cancel("Cancelled — nothing was written.");
  process.exit(0);
}

export async function askField(field: FieldSpec): Promise<string> {
  if (field.kind === "confirm") {
    const v = await p.confirm({ message: field.question, initialValue: field.detectedValue === "true" });
    if (p.isCancel(v)) bail();
    return v ? "true" : "false";
  }
  const v = await p.text({
    message: field.question,
    placeholder: field.detectedValue ?? (field.required ? "(required)" : "(optional, Enter to skip)"),
    initialValue: field.detectedValue ?? "",
    validate: (val) =>
      field.required && !val.trim() && !field.detectedValue ? "This field is required" : undefined,
  });
  if (p.isCancel(v)) bail();
  return (v as string) || field.detectedValue || "";
}

export async function selectOutputs(relevant: OutputToggles): Promise<OutputToggles> {
  const options = [
    { value: "claudeMd", label: "CLAUDE.md" },
    { value: "skills", label: "Skills (.claude/skills/)" },
    { value: "commands", label: "Slash commands (.claude/commands/)" },
    { value: "settings", label: "Permissions (.claude/settings.json)" },
  ];
  const initial = Object.entries(relevant).filter(([, on]) => on).map(([k]) => k);
  const picked = await p.multiselect({
    message: "Which outputs should I generate?",
    options,
    initialValues: initial,
    required: false,
  });
  if (p.isCancel(picked)) bail();
  const set = new Set(picked as string[]);
  return {
    claudeMd: set.has("claudeMd"),
    skills: set.has("skills"),
    commands: set.has("commands"),
    settings: set.has("settings"),
  };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/core/prompter.ts
git commit -m "feat: clack-based prompter (only user-facing I/O)"
```

---

## Task 16: CLI wiring

**Files:**
- Modify: `src/cli.ts` (replace placeholder from Task 1)
- Test: `test/cli-args.test.ts`

- [ ] **Step 1: Write the failing test (arg parsing only)**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/cli-args.test.ts`
Expected: FAIL — `parseArgs` is not exported.

- [ ] **Step 3: Replace `src/cli.ts`**

```ts
import * as p from "@clack/prompts";
import { scanRepo } from "./core/repo-scanner";
import { buildPlan, OutputToggles } from "./core/pipeline";
import { askField, selectOutputs } from "./core/prompter";
import { applyWrites, summarize } from "./core/writer";
import { selectPlugin, PLUGINS } from "./plugins/registry";

export interface CliArgs {
  dryRun: boolean;
  yes: boolean;
}

export function parseArgs(argv: string[]): CliArgs {
  return {
    dryRun: argv.includes("--dry-run"),
    yes: argv.includes("--yes") || argv.includes("-y"),
  };
}

function relevantOutputs(): OutputToggles {
  return { claudeMd: true, skills: true, commands: true, settings: true };
}

export async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const root = process.cwd();
  const repo = scanRepo(root);

  p.intro("claude-scaffold");

  const { plugin, detection } = selectPlugin(repo, PLUGINS);
  const detail = Object.entries(detection.facts)
    .filter(([, v]) => v !== undefined && v !== false && v !== "none")
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
  p.note(detail || "no specific facts", `Detected: ${plugin.displayName}`);

  const outputs = args.yes ? relevantOutputs() : await selectOutputs(relevantOutputs());

  const plan = await buildPlan(repo, { yes: args.yes, outputs, ask: askField });

  for (const w of plan.writes) {
    const tag = args.dryRun ? `[dry-run ${w.action}]` : `[${w.action}]`;
    p.log.message(`${tag} ${w.path}${w.note ? ` (${w.note})` : ""}`);
  }

  await applyWrites(plan.writes, { root, dryRun: args.dryRun });

  const counts = summarize(plan.writes);
  p.outro(
    args.dryRun
      ? `Dry run — nothing written. Would create ${counts.create}, update ${counts.update}, skip ${counts.skip}.`
      : `Done. Created ${counts.create}, updated ${counts.update}, skipped ${counts.skip}.`,
  );
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    p.log.error(String(err?.stack ?? err));
    process.exit(1);
  },
);
```

> Note: the bottom `main(...)` auto-run executes on import. Since `parseArgs` is the only thing the test imports and the test runs under vitest, guard the auto-run so it doesn't fire during tests: wrap it as below.

Replace the final `main(process.argv.slice(2))...` block with:

```ts
const isDirectRun = process.argv[1]?.endsWith("cli.ts") || process.argv[1]?.endsWith("cli.js");
if (isDirectRun) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      p.log.error(String(err?.stack ?? err));
      process.exit(1);
    },
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/cli-args.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Build and smoke-test against a fixture (dry-run)**

Run:
```bash
npm run build
cd test/fixtures/gradle-app && node ../../../dist/cli.js --dry-run --yes; cd ../../..
```
Expected: prints "Detected: Spring Boot", a list of `[dry-run create] ...` lines for CLAUDE.md, skills, commands, settings, and a "Dry run — nothing written" outro. No files created (verify `git status` in the fixture shows nothing new).

- [ ] **Step 6: Commit**

```bash
git add src/cli.ts test/cli-args.test.ts
git commit -m "feat: CLI wiring (flags, detection summary, plan, apply)"
```

---

## Task 17: Full-suite green + README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Run the whole suite + typecheck**

Run: `npm run typecheck && npm test`
Expected: typecheck exits 0; all test files pass.

- [ ] **Step 2: Write `README.md`**

```markdown
# claude-scaffold

Bootstrap Claude Code config for a repository. Auto-detects the stack (Spring Boot today),
generates a populated `CLAUDE.md` plus optional skills, slash commands, and `settings.json`
permissions, and prompts only for what it can't detect.

## Usage

```bash
npx claude-scaffold            # interactive, in your repo
npx claude-scaffold --dry-run  # preview planned writes, change nothing
npx claude-scaffold --yes      # accept detected/defaults, prompt only required-unknowns
```

## What it generates

- `CLAUDE.md` — section-aware: fills missing/empty sections, never overwrites your content.
- `.claude/skills/<name>/SKILL.md` — e.g. `run`, `test`, `add-migration` (when a migration tool is detected).
- `.claude/commands/<name>.md` — `/build`, `/verify`.
- `.claude/settings.json` — permission allowlist for the detected build tool, merged into existing settings.

## Adding a stack

Implement a `StackPlugin` (`src/plugins/types.ts`): a `detect()` returning confidence + facts,
plus `sections`/`skills`/`commands`/`settings` builders. Register it in `src/plugins/registry.ts`.
No engine changes needed.

## Development

```bash
npm install
npm test
npm run build
```
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add README"
```

---

## Self-review notes (addressed)

- **Spec coverage:** CLI surface + flags (Task 16), detect/prompt split (Tasks 5/8/9), all four outputs toggleable (Tasks 12/14/16), section-merge fill/keep/append (Tasks 3/4/14), generic fallback (Tasks 7/11), Spring detection sources (Task 8), no-partial-write + dry-run (Task 13), Ctrl-C clean exit (Task 15 `bail`), testing incl. fixtures + integration-style pipeline test (Tasks 8/14). All present.
- **Type consistency:** `RepoSnapshot`, `Facts`, `FieldSpec`, `SectionSpec`, `SkillSpec`, `CommandSpec`, `PermissionSpec`, `PlannedWrite`/`WriteAction`, `OutputToggles` are defined once and reused with identical signatures. `selectPlugin(repo, PLUGINS)` signature matches across registry/pipeline/cli. `buildPlan` returns `{ plugin, facts, writes }` consistent with cli usage.
- **Note on Persistence section:** only emitted when `migrationTool` is `flyway`/`liquibase` (Task 9), matching the spec's conditional skills; merge handles its absence gracefully.
