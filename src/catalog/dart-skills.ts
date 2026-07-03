import { Facts, SkillSpec } from "../plugins/types";
import content from "./dart-content.json";

const s = (f: Facts, k: string): string => String(f[k] ?? "");

// Curated, fact-independent skills authored under src/catalog/dart/skills/.
const curatedSkills = (): SkillSpec[] => (content.skills as SkillSpec[]).map((sk) => ({ ...sk }));

// Body for the codegen skill, mentioning the detected generators so the guidance is concrete.
function codegenBody(codegenCmd: string, codegenTools: string): string {
  const cmd = codegenCmd || "dart run build_runner build --delete-conflicting-outputs";
  const tools = codegenTools
    ? codegenTools.split(",").map((t) => t.trim()).filter(Boolean)
    : [];
  const lines = [
    "Regenerate code after changing any annotated source (models, DI, router, mocks).",
    "",
    "```bash",
    cmd,
    "```",
    "",
    "Use `watch` instead of `build` while iterating: `dart run build_runner watch --delete-conflicting-outputs`.",
    "",
    "Never hand-edit a generated file (`*.g.dart`, `*.freezed.dart`, `*.config.dart`, `*.gr.dart`, `*.mocks.dart`) — change the source annotation and re-run codegen.",
  ];
  if (tools.length) {
    lines.push("", `Generators in this project: ${tools.map((t) => `\`${t}\``).join(", ")}.`);
  }
  return lines.join("\n");
}

export function dartSkills(facts: Facts): SkillSpec[] {
  const runCmd = s(facts, "runCmd");
  const testCmd = s(facts, "testCmd");
  const analyzeCmd = s(facts, "analyzeCmd");
  const formatCmd = s(facts, "formatCmd");
  const hasCodegen = facts.hasCodegen === true;
  const hasL10n = facts.hasL10n === true;

  return [
    {
      name: "run",
      description: "Run the app/project locally.",
      condition: !!runCmd,
      body: `Use this to run the project.\n\n\`\`\`bash\n${runCmd}\n\`\`\`\n\nUse hot reload (\`r\`) / hot restart (\`R\`) while it's running; stop with \`q\` or Ctrl-C.`,
    },
    {
      name: "test",
      description: "Run the test suite and confirm it passes.",
      body: `Run all tests:\n\n\`\`\`bash\n${testCmd}\n\`\`\`\n\n"Done" requires green tests with new code covered, and a clean \`${analyzeCmd || "dart analyze"}\`.`,
    },
    {
      name: "analyze",
      description: "Run the Dart static analyzer and the formatter.",
      body: `Keep the analyzer clean and the code formatted:\n\n\`\`\`bash\n${analyzeCmd || "dart analyze"}\n${formatCmd || "dart format ."}\n\`\`\`\n\nFix warnings rather than suppressing them. Justify any \`// ignore:\` inline.`,
    },
    {
      name: "codegen",
      description: "Regenerate build_runner output (freezed / json / DI / router / mocks).",
      condition: hasCodegen,
      body: codegenBody(s(facts, "codegenCmd"), s(facts, "codegenTools")),
    },
    {
      name: "gen-l10n",
      description: "Regenerate localizations from ARB files.",
      condition: hasL10n,
      body: `Regenerate the localization delegates after editing ARB files:\n\n\`\`\`bash\n${s(facts, "l10nCmd") || "flutter gen-l10n"}\n\`\`\`\n\nAdd new strings to every \`*.arb\` file, then re-run. Don't hand-edit generated localization classes.`,
    },
    ...curatedSkills(),
  ];
}
