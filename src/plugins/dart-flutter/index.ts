import { StackPlugin, Facts, McpServerSpec } from "../types";
import { detectDartFlutter } from "./detect";
import { dartFlutterSections } from "./sections";
import { dartFlutterSettings } from "./settings";
import { dartSkills } from "../../catalog/dart-skills";
import { dartCommands } from "../../catalog/dart-commands";
import { dartAgents } from "../../catalog/dart-agents";
import { atlassian, context7, github, playwright } from "../../catalog/mcp-servers";

// Summary lines for the CLI's "Detected" note.
function dartDescribe(facts: Facts): string[] {
  const lines: string[] = [];
  const stack = [
    facts.framework === "flutter" ? (facts.flutterSdk ? `Flutter ${facts.flutterSdk}` : "Flutter") : null,
    facts.dartSdk ? `Dart ${facts.dartSdk}` : null,
    facts.projectType ? String(facts.projectType) : null,
  ].filter(Boolean);
  if (stack.length) lines.push(stack.join("  ·  "));
  if (facts.stateManagement) lines.push(`State: ${facts.stateManagement}`);
  if (facts.routing) lines.push(`Routing: ${facts.routing}`);
  if (facts.platforms) lines.push(`Platforms: ${facts.platforms}`);
  if (facts.hasCodegen) lines.push(`Codegen: ${facts.codegenTools ? String(facts.codegenTools) : "build_runner"}`);
  if (facts.packageCount) lines.push(`Packages: ${facts.packageCount}`);
  if (facts.runCmd) lines.push(`Run: ${facts.runCmd}`);
  if (facts.testCmd) lines.push(`Test: ${facts.testCmd}`);
  return lines;
}

function dartMcpServers(facts: Facts): McpServerSpec[] {
  const targetsWeb = String(facts.platforms ?? "").includes("web");
  return [
    context7(true),
    { ...playwright(false), condition: targetsWeb },
    atlassian(false),
    github(false),
  ];
}

// Map confirmed CLAUDE.md choices back into facts so later stages (skills, commands) see
// the user's selections. The State management checklist can confirm a solution detection
// missed; the Code generation section confirms codegen is in play. Mirrors the spring
// plugin's mapConfirmedFacts (migration tool).
function mapDartConfirmedFacts(confirmed: Record<string, string>): Partial<Facts> {
  const out: Partial<Facts> = {};
  const sm = confirmed.stateManagement ?? "";
  const detected: string[] = [];
  for (const [key, label] of [
    ["riverpod", "Riverpod"],
    ["bloc", "Bloc"],
    ["provider", "Provider"],
    ["getx", "GetX"],
    ["mobx", "MobX"],
    ["redux", "Redux"],
    ["stacked", "Stacked"],
    ["signals", "Signals"],
  ] as const) {
    if (new RegExp(`\\b${label}\\b`, "i").test(sm)) detected.push(key);
  }
  if (detected.length) out.stateManagement = detected.join(",");

  // If the user kept any Code generation rules, ensure codegen stays enabled for skills/commands.
  if ((confirmed.codegen ?? "").trim()) out.hasCodegen = true;
  return out;
}

export const dartFlutterPlugin: StackPlugin = {
  id: "dart-flutter",
  displayName: "Dart / Flutter",
  detect: detectDartFlutter,
  describe: dartDescribe,
  sections: dartFlutterSections,
  mapConfirmedFacts: mapDartConfirmedFacts,
  skills: dartSkills,
  commands: dartCommands,
  agents: dartAgents,
  settings: dartFlutterSettings,
  mcpServers: dartMcpServers,
};
