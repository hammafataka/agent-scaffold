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

export enum FieldKind {
  Text = "text",
  Multiline = "multiline",
  Select = "select",
  Multiselect = "multiselect",
  Confirm = "confirm",
}

// A pickable option for select/multiselect fields. `value` is the text inserted into
// the document; `detected` marks it as auto-discovered (pre-selected + shown as detected).
export interface ChoiceOption {
  value: string;
  label?: string; // display label (defaults to value)
  hint?: string; // extra note shown next to the option
  detected?: boolean;
}

export interface FieldSpec {
  key: string;
  question: string;
  detectedValue?: string; // pre-filled default; absent = truly unknown
  required: boolean;
  kind: FieldKind;
  options?: ChoiceOption[]; // for select/multiselect kinds
}

export interface SectionSpec {
  heading: string; // e.g. "## Build & run"
  fields: FieldSpec[];
  render(values: Record<string, string>): string; // body markdown, no heading
}

// A supporting file written alongside a skill, e.g. references/jpa-optimization.md.
export interface ReferenceFile {
  path: string; // relative to the skill dir, e.g. "references/jpa-optimization.md"
  content: string;
}

export interface SkillSpec {
  name: string; // kebab-case; becomes .claude/skills/<name>/SKILL.md
  description: string;
  body: string; // markdown after frontmatter
  references?: ReferenceFile[]; // optional supporting docs under the skill dir
  recommended?: boolean; // default true; pre-checked in per-item selection
  condition?: boolean; // default true; false = not emitted
}

export interface CommandSpec {
  name: string; // becomes .claude/commands/<name>.md
  description: string;
  body: string;
  recommended?: boolean;
  condition?: boolean;
}

// A subagent definition; becomes .claude/agents/<name>.md (single file).
export interface AgentSpec {
  name: string;
  description: string;
  body: string;
  recommended?: boolean;
  condition?: boolean;
}

// A deterministic guardrail: a hook wired into settings.json plus the script it runs.
// The script is shipped under .claude/hooks/guards/ (skipped if it already exists, so a
// hand-tuned guard is never clobbered).
export interface GuardSpec {
  event: string; // hook event, e.g. "PreToolUse"
  matcher: string; // tool matcher, e.g. "Edit|Write|MultiEdit"
  path: string; // script file written into the repo, e.g. ".claude/hooks/guards/secret-scan.sh"
  command: string; // hook command string invoking the script
  content: string; // script body
}

export interface PermissionSpec {
  allow: string[]; // e.g. ["Bash(./gradlew:*)"]
  guards?: GuardSpec[]; // optional PreToolUse/etc guardrails wired into settings.json
}

export interface StackPlugin {
  id: string;
  displayName: string;
  detect(repo: RepoSnapshot): DetectionResult;
  // Optional top-level fields resolved before any stage. Confirmed values are merged
  // back into facts so sections, skills, and commands all see the user-confirmed values.
  fields?(facts: Facts): FieldSpec[];
  sections(facts: Facts): SectionSpec[];
  // Optional: maps confirmed section field values back to facts after CLAUDE.md is built,
  // so skill/command generation sees any user-corrected values (e.g. chosen migration tool).
  mapConfirmedFacts?(confirmed: Record<string, string>): Partial<Facts>;
  skills(facts: Facts): SkillSpec[];
  commands(facts: Facts): CommandSpec[];
  agents(facts: Facts): AgentSpec[];
  settings(facts: Facts): PermissionSpec[];
}

// Output of the pipeline, consumed by the writer.
export enum WriteAction {
  Create = "create",
  Update = "update",
  Skip = "skip",
}

export interface PlannedWrite {
  path: string; // repo-relative POSIX path
  content: string;
  action: WriteAction;
  note?: string; // e.g. "kept user content", "exists"
}
