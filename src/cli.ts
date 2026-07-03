import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as p from "@clack/prompts";
import { scanRepo } from "./core/repo-scanner";
import { buildPlan, OutputToggles, Plan } from "./core/pipeline";
import { askField, chooseOutputs, chooseItems, chooseTools, BackSignal } from "./core/prompter";
import { applyWrites, summarize } from "./core/writer";
import { selectPlugin, pluginIds, PLUGINS } from "./plugins/registry";
import { TOOLS, toolIds, detectTools, resolveTools, combinedCapabilities } from "./tools/registry";
import { StackPlugin, Facts, WriteAction } from "./plugins/types";
import { version } from "../package.json";

export interface CliArgs {
  dryRun: boolean;
  yes: boolean;
  help: boolean;
  version: boolean;
  stack?: string;
  tools?: string[];
  errors: string[]; // unknown flags / missing values — non-empty means "print help, exit 1"
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { dryRun: false, yes: false, help: false, version: false, errors: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--yes":
      case "-y":
        args.yes = true;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      case "--version":
      case "-v":
        args.version = true;
        break;
      case "--stack": {
        const next = argv[i + 1];
        if (!next || next.startsWith("-")) {
          args.errors.push("--stack requires a value (e.g. --stack node-ts)");
        } else {
          args.stack = next;
          i++;
        }
        break;
      }
      case "--tools": {
        const next = argv[i + 1];
        if (!next || next.startsWith("-")) {
          args.errors.push("--tools requires a comma-separated list (e.g. --tools claude,cursor)");
        } else {
          args.tools = next.split(",").map((t) => t.trim()).filter(Boolean);
          i++;
        }
        break;
      }
      default:
        args.errors.push(`Unknown option: ${a}`);
    }
  }
  return args;
}

export function helpText(): string {
  return [
    `agent-scaffold ${version} — bootstrap a repo's AI coding-agent config`,
    "",
    "Usage: agent-scaffold [options]",
    "",
    "Detects the stack AND the coding tools already in use, interviews you for what it",
    "can't detect, and writes each tool's config in its native layout — Claude Code",
    "(CLAUDE.md, .claude/, .mcp.json), AGENTS.md, Cursor (.cursor/), GitHub Copilot",
    "(.github/), Gemini CLI (GEMINI.md, .gemini/), Windsurf (.windsurf/). Re-running",
    "merges into existing files instead of clobbering them.",
    "",
    "Options:",
    "  -y, --yes           Accept detected defaults; prompt only for required unknowns",
    "      --dry-run       Preview the writes without touching disk",
    "      --stack <id>    Skip stack detection and use a specific plugin",
    `                      (${pluginIds().join(", ")})`,
    "      --tools <list>  Comma-separated target tools (default: detected, else claude)",
    `                      (${toolIds().join(", ")})`,
    "  -h, --help          Show this help",
    "  -v, --version       Show the version",
  ].join("\n");
}

// A readable, grouped summary of what detection found. Each plugin describes its own
// facts; the fallback covers plugins without a describe() (e.g. generic).
function formatDetected(plugin: StackPlugin, facts: Facts): string {
  const lines = plugin.describe?.(facts) ?? [];
  return lines.length ? lines.join("\n") : "No specific facts — you'll fill the details in.";
}

// Outputs worth offering: the plugin must have content AND at least one selected tool
// must be able to express it.
function relevantOutputs(plugin: StackPlugin, facts: Facts, toolIds: string[]): OutputToggles {
  const caps = combinedCapabilities(resolveTools(toolIds));
  return {
    instructions: caps.instructions && plugin.sections(facts).length > 0,
    skills: caps.skills && plugin.skills(facts).some((s) => s.condition !== false),
    commands: caps.commands && plugin.commands(facts).some((c) => c.condition !== false),
    agents: caps.agents && plugin.agents(facts).some((a) => a.condition !== false),
    settings: caps.settings && plugin.settings(facts).length > 0,
    mcp: caps.mcp && (plugin.mcpServers?.(facts) ?? []).some((m) => m.condition !== false),
    pdd: caps.pdd,
  };
}

export async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);

  if (args.errors.length > 0) {
    for (const e of args.errors) console.error(e);
    console.error("");
    console.error(helpText());
    return 1;
  }
  if (args.help) {
    console.log(helpText());
    return 0;
  }
  if (args.version) {
    console.log(version);
    return 0;
  }

  const root = process.cwd();
  const repo = scanRepo(root);

  p.intro(`agent-scaffold ${version}`);

  let selected;
  try {
    selected = selectPlugin(repo, PLUGINS, args.stack);
    if (args.tools) resolveTools(args.tools); // validate ids up front
  } catch (e) {
    p.log.error(e instanceof Error ? e.message : String(e));
    return 1;
  }
  const { plugin, detection } = selected;
  p.note(
    formatDetected(plugin, detection.facts),
    args.stack ? `Stack (via --stack): ${plugin.displayName}` : `Detected: ${plugin.displayName}`,
  );

  // Target tools: --tools wins; otherwise detected configs pre-check the picker
  // (--yes takes the detected set, defaulting to Claude Code).
  const detectedTools = detectTools(repo);
  let tools: string[];
  if (args.tools) {
    tools = args.tools;
  } else if (args.yes) {
    tools = detectedTools.length > 0 ? detectedTools : ["claude"];
  } else {
    tools = await chooseTools(
      TOOLS.map((t) => ({ id: t.id, displayName: t.displayName, hint: t.hint })),
      detectedTools,
    );
  }

  const relevant = relevantOutputs(plugin, detection.facts, tools);
  let outputs = args.yes ? { ...relevant, pdd: false } : await chooseOutputs(relevant);

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
      plan = await buildPlan(repo, {
        yes: args.yes,
        outputs,
        tools,
        stackId: args.stack,
        ask: askField,
        onStage,
        chooseItems,
      });
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
