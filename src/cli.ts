import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as p from "@clack/prompts";
import { scanRepo } from "./core/repo-scanner";
import { buildPlan, OutputToggles, Plan } from "./core/pipeline";
import { askField, chooseOutputs, chooseItems, BackSignal } from "./core/prompter";
import { applyWrites, summarize } from "./core/writer";
import { selectPlugin, PLUGINS } from "./plugins/registry";
import { StackPlugin, Facts, WriteAction } from "./plugins/types";

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

// A readable, grouped summary of what detection found. Falls back gracefully when
// a plugin reports no specific facts (e.g. the generic plugin).
function formatDetected(facts: Facts): string {
  const lines: string[] = [];
  const stack = [
    facts.springBootVersion ? `Spring Boot ${facts.springBootVersion}` : null,
    facts.javaVersion ? `Java ${facts.javaVersion}` : null,
    facts.buildTool ? String(facts.buildTool) : null,
  ].filter(Boolean);
  if (stack.length) lines.push(stack.join("  ·  "));

  const starters = [
    facts.hasWeb ? "Web" : null,
    facts.hasJpa ? "JPA" : null,
    facts.hasSecurity ? "Security" : null,
  ].filter(Boolean);
  if (starters.length) lines.push(`Starters: ${starters.join(", ")}`);

  if (facts.migrationTool && facts.migrationTool !== "none") {
    lines.push(`Migrations: ${facts.migrationTool}`);
  }
  if (facts.activeProfile) lines.push(`Active profile: ${facts.activeProfile}`);
  if (facts.runCmd) lines.push(`Run: ${facts.runCmd}`);
  if (facts.testCmd) lines.push(`Test: ${facts.testCmd}`);

  return lines.length ? lines.join("\n") : "No specific facts — you'll fill the details in.";
}

function relevantOutputs(plugin: StackPlugin, facts: Facts): OutputToggles {
  return {
    claudeMd: plugin.sections(facts).length > 0,
    skills: plugin.skills(facts).some((s) => s.condition !== false),
    commands: plugin.commands(facts).some((c) => c.condition !== false),
    agents: plugin.agents(facts).some((a) => a.condition !== false),
    settings: plugin.settings(facts).length > 0,
    pdd: false,
  };
}

export async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const root = process.cwd();
  const repo = scanRepo(root);

  p.intro("claude-scaffold");

  const { plugin, detection } = selectPlugin(repo, PLUGINS);
  p.note(formatDetected(detection.facts), `Detected: ${plugin.displayName}`);

  const relevant = relevantOutputs(plugin, detection.facts);
  let outputs = args.yes ? relevant : await chooseOutputs(relevant);

  // In --yes mode, resolveFields uses detected values and prompts ONLY for required
  // fields with no detected value (e.g. Overview, Architecture, Never do). --yes skips
  // prompts for detectable fields, not for genuinely-unknown required ones.
  const onStage = (title: string, index: number, count: number) =>
    p.log.step(`Stage ${index}/${count} — ${title}`);

  // Re-show the output selector whenever BackSignal escapes the pipeline (user pressed
  // Escape at the very first prompt of the first stage).
  let plan!: Plan;
  while (true) {
    try {
      plan = await buildPlan(repo, { yes: args.yes, outputs, ask: askField, onStage, chooseItems });
      break;
    } catch (e) {
      if (e instanceof BackSignal && !args.yes) {
        outputs = await chooseOutputs(relevant);
      } else {
        throw e;
      }
    }
  }

  for (const w of plan.writes) {
    const tag = args.dryRun ? `[dry-run ${w.action}]` : `[${w.action}]`;
    p.log.message(`${tag} ${w.path}${w.note ? ` (${w.note})` : ""}`);
  }

  await applyWrites(plan.writes, { root, dryRun: args.dryRun });

  const counts = summarize(plan.writes);
  p.outro(
    args.dryRun
      ? `Dry run — nothing written. Would create ${counts[WriteAction.Create]}, update ${counts[WriteAction.Update]}, skip ${counts[WriteAction.Skip]}.`
      : `Done. Created ${counts[WriteAction.Create]}, updated ${counts[WriteAction.Update]}, skipped ${counts[WriteAction.Skip]}.`,
  );
  return 0;
}

// True when this file is the process entry point. We compare realpaths rather than
// matching the filename: when installed as a bin, the process is launched through a
// `node_modules/.bin/claude-scaffold` symlink, so process.argv[1] ends in the bin
// name, not "cli.js". Resolving the symlink and comparing to this module's own path
// works for `tsx src/cli.ts` (dev), the built bin (npx / global install), and avoids
// firing main() when tests import parseArgs from this module.
function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      p.log.error(String(err?.stack ?? err));
      process.exit(1);
    },
  );
}
