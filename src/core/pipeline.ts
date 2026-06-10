import { RepoSnapshot, StackPlugin, FieldSpec, PlannedWrite, Facts, WriteAction } from "../plugins/types";
import { selectPlugin, PLUGINS } from "../plugins/registry";
import { resolveFields } from "./field-resolver";
import { BackSignal } from "./prompter";
import { parseDocument, serializeDocument, Section } from "./md-document";
import { mergeSections, MergeStatus } from "./md-merger";
import { planSkillWrites } from "../generators/skills";
import { pddSkills } from "../catalog/pdd-skills";
import { pddWorkflowSection } from "../catalog/pdd-workflow";
import { planCommandWrites } from "../generators/commands";
import { planAgentWrites } from "../generators/agents";
import { planSettingsWrite, planGuardScriptWrites } from "../generators/settings";

export enum SelectableKind {
  Skills = "skills",
  Commands = "commands",
  Agents = "agents",
  Pdd = "PDD skills",
}

export interface OutputToggles {
  claudeMd: boolean;
  skills: boolean;
  commands: boolean;
  agents: boolean;
  settings: boolean;
  pdd: boolean;
}

// An item the user can include/exclude within an output (a skill, command, or agent).
export interface SelectableItem {
  name: string;
  label: string;
  recommended: boolean;
}

export interface PlanOptions {
  yes: boolean;
  outputs: OutputToggles;
  ask: (field: FieldSpec) => Promise<string>;
  // Fired before each enabled output is built, so the CLI can show staged progress.
  onStage?: (title: string, index: number, total: number) => void;
  // Per-item picker for skills/commands/agents. Returns the chosen item names.
  // When omitted (or in --yes), all recommended items are included.
  chooseItems?: (kind: SelectableKind, items: SelectableItem[]) => Promise<string[]>;
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
): Promise<{ write: PlannedWrite; confirmed: Record<string, string> }> {
  const specs = plugin.sections(facts);
  const generated: Section[] = [];
  const confirmed: Record<string, string> = {};
  let i = 0;
  while (i < specs.length) {
    const spec = specs[i];
    try {
      const values = await resolveFields(spec.fields, { yes: opts.yes, ask: opts.ask });
      Object.assign(confirmed, values);
      generated.push({ heading: spec.heading, body: spec.render(values) });
      i++;
    } catch (e) {
      if (e instanceof BackSignal) {
        if (i === 0) throw e; // propagate to stage loop → go back one stage
        if (generated.length > 0) generated.pop();
        i--;
      } else {
        throw e;
      }
    }
  }

  // When PDD methodology is selected, inject the ordered workflow section (built from
  // the installed PDD skills) right before the Stack section. Injected directly rather
  // than as a fieldless SectionSpec so it never becomes a back-navigation dead-spot.
  if (opts.outputs.pdd) {
    const wf = pddWorkflowSection();
    const stackIdx = generated.findIndex((s) => s.heading === "## Stack");
    const at = stackIdx === -1 ? Math.min(1, generated.length) : stackIdx;
    generated.splice(at, 0, { heading: wf.heading, body: wf.body });
  }

  const existingRaw = repo.exists("CLAUDE.md") ? repo.readFile("CLAUDE.md") : null;
  let write: PlannedWrite;
  if (existingRaw) {
    const { doc, report } = mergeSections(parseDocument(existingRaw), generated);
    const counts = { [MergeStatus.Filled]: 0, [MergeStatus.Kept]: 0, [MergeStatus.Added]: 0 };
    for (const e of report) counts[e.status]++;
    const parts = [MergeStatus.Filled, MergeStatus.Kept, MergeStatus.Added]
      .filter((s) => counts[s] > 0)
      .map((s) => `${counts[s]} ${s}`);
    const note = parts.length ? parts.join(", ") : undefined;
    write = { path: "CLAUDE.md", content: serializeDocument(doc), action: WriteAction.Update, note };
  } else {
    // Drop optional sections left blank so they don't serialize to a bare heading.
    const nonEmpty = generated.filter((s) => s.body.trim() !== "");
    const doc = { title: titleLine(plugin.displayName), preamble: "", sections: nonEmpty };
    write = { path: "CLAUDE.md", content: serializeDocument(doc), action: WriteAction.Create };
  }
  return { write, confirmed };
}

// Narrow a list of named, possibly-recommended specs to the user's selection.
// In --yes mode (or with no picker) we keep every recommended item.
async function pickItems<T extends { name: string; recommended?: boolean; condition?: boolean }>(
  kind: SelectableKind,
  specs: T[],
  opts: PlanOptions,
): Promise<T[]> {
  const available = specs.filter((s) => s.condition !== false);
  if (available.length === 0) return [];
  if (opts.yes || !opts.chooseItems) {
    return available.filter((s) => s.recommended !== false);
  }
  const chosen = new Set(
    await opts.chooseItems(
      kind,
      available.map((s) => ({ name: s.name, label: s.name, recommended: s.recommended !== false })),
    ),
  );
  return available.filter((s) => chosen.has(s.name));
}

export async function buildPlan(repo: RepoSnapshot, opts: PlanOptions): Promise<Plan> {
  const { plugin, detection } = selectPlugin(repo, PLUGINS);
  const facts = detection.facts;
  const exists = (p: string) => repo.exists(p);

  // Resolve plugin-level fields (e.g. sqlDir/sqlPrefix for manual-sql) before any stage
  // so that sections, skills, and commands all see the confirmed values.
  if (plugin.fields) {
    const pluginFields = plugin.fields(facts);
    if (pluginFields.length > 0) {
      const confirmed = await resolveFields(pluginFields, { yes: opts.yes, ask: opts.ask });
      for (const [k, v] of Object.entries(confirmed)) {
        if (v !== undefined && v !== "") facts[k] = v;
      }
    }
  }

  // Build the ordered list of enabled stages. Each stage is independent: it returns
  // its own PlannedWrite[] so the loop can discard and re-run any stage on back-nav.
  type Stage = { title: string; run(): Promise<PlannedWrite[]> };
  const stages: Stage[] = [];

  if (opts.outputs.claudeMd) {
    stages.push({
      title: "CLAUDE.md",
      run: async () => {
        const { write, confirmed } = await buildClaudeMd(repo, plugin, facts, opts);
        // Let the plugin map confirmed choices back into facts so subsequent stages
        // (skills, commands) see the user-corrected values (e.g. chosen migration tool).
        if (plugin.mapConfirmedFacts) Object.assign(facts, plugin.mapConfirmedFacts(confirmed));
        return [write];
      },
    });
  }
  if (opts.outputs.skills) {
    stages.push({
      title: "Skills",
      run: async () => {
        const chosen = await pickItems(SelectableKind.Skills, plugin.skills(facts), opts);
        return planSkillWrites(chosen, exists);
      },
    });
  }
  if (opts.outputs.commands) {
    stages.push({
      title: "Slash commands",
      run: async () => {
        const chosen = await pickItems(SelectableKind.Commands, plugin.commands(facts), opts);
        return planCommandWrites(chosen, exists);
      },
    });
  }
  if (opts.outputs.agents) {
    stages.push({
      title: "Agents",
      run: async () => {
        const chosen = await pickItems(SelectableKind.Agents, plugin.agents(facts), opts);
        return planAgentWrites(chosen, exists);
      },
    });
  }
  if (opts.outputs.settings) {
    stages.push({
      title: "Settings",
      run: async () => {
        const existing = repo.exists(".claude/settings.json")
          ? repo.readFile(".claude/settings.json")
          : null;
        const specs = plugin.settings(facts);
        const w = planSettingsWrite(specs, existing);
        const scripts = planGuardScriptWrites(specs, exists);
        return [...(w ? [w] : []), ...scripts];
      },
    });
  }
  if (opts.outputs.pdd) {
    stages.push({
      title: "PDD methodology",
      run: async () => {
        const chosen = await pickItems(SelectableKind.Pdd, pddSkills(), opts);
        return planSkillWrites(chosen, exists, "pdd");
      },
    });
  }

  // Run stages in order. On BackSignal: re-throw at stage 0 (caller re-shows output
  // selector), otherwise step back and clear the previous stage's results so it re-runs.
  const stageWrites: PlannedWrite[][] = [];
  let i = 0;
  while (i < stages.length) {
    opts.onStage?.(stages[i].title, i + 1, stages.length);
    try {
      stageWrites[i] = await stages[i].run();
      i++;
    } catch (e) {
      if (e instanceof BackSignal) {
        if (i === 0) throw e; // propagate → cli.ts re-shows output selector
        stageWrites[i - 1] = []; // clear previous stage so it re-runs cleanly
        i--;
      } else {
        throw e;
      }
    }
  }

  const writes: PlannedWrite[] = [];
  for (let j = 0; j < stages.length; j++) writes.push(...(stageWrites[j] ?? []));
  return { plugin, facts, writes };
}
