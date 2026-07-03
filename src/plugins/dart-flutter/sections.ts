import { Facts, SectionSpec, FieldSpec, ChoiceOption, FieldKind } from "../types";
import { COMMON_CODE_CONVENTIONS, GIT_WORKFLOW } from "../../catalog/section-options";
import {
  DART_API_CONVENTIONS,
  DART_CODE_CONVENTIONS,
  DART_DEPENDENCIES,
  DART_NEVER_DO,
  FLUTTER_BEHAVIOR,
  codegenOptions,
  flavorOptions,
  flutterArchitectureOptions,
  flutterTestOptions,
  lintOptions,
  stateManagementOptions,
} from "../../catalog/dart-section-options";

const str = (f: Facts, k: string): string | undefined =>
  f[k] === undefined ? undefined : String(f[k]);

// Free-text section (multiline) — same shape as the spring-boot helper.
function detectedSection(heading: string, key: string, question: string, detected: string | undefined, required: boolean): SectionSpec {
  const field: FieldSpec = { key, question, required, kind: FieldKind.Multiline };
  if (detected !== undefined) field.detectedValue = detected;
  return { heading, fields: [field], render: (v) => v[key] ?? "" };
}

// Checklist section. Detected options are pre-checked.
function choiceSection(heading: string, key: string, question: string, options: ChoiceOption[], required: boolean): SectionSpec {
  const field: FieldSpec = { key, question, required, kind: FieldKind.Multiselect, options };
  const detected = options.filter((o) => o.detected).map((o) => `- ${o.value}`);
  if (detected.length) field.detectedValue = detected.join("\n");
  return { heading, fields: [field], render: (v) => v[key] ?? "" };
}

// Single-choice section. The detected option (if any) is the default.
function selectSection(heading: string, key: string, question: string, options: ChoiceOption[], required: boolean): SectionSpec {
  const field: FieldSpec = { key, question, required, kind: FieldKind.Select, options };
  const detected = options.find((o) => o.detected);
  if (detected) field.detectedValue = detected.value;
  return { heading, fields: [field], render: (v) => v[key] ?? "" };
}

// Packages section (multi-package / melos only): one optional purpose prompt per package.
function packagesSection(packageList: string[]): SectionSpec {
  const fields: FieldSpec[] = packageList.map((name) => ({
    key: `pkg_${name}`,
    question: `\`${name}\` — what is this package for?`,
    required: false,
    kind: FieldKind.Text,
  }));
  return {
    heading: "## Packages",
    fields,
    render: (v) =>
      packageList
        .map((name) => {
          const purpose = (v[`pkg_${name}`] ?? "").trim();
          return `- \`${name}\`${purpose ? ` — ${purpose}` : ""}`;
        })
        .join("\n"),
  };
}

const PROJECT_TYPE_LABELS: Record<string, string> = {
  "flutter-app": "Flutter app",
  "flutter-plugin": "Flutter plugin",
  "flutter-package": "Flutter package",
  "dart-server": "Dart server",
  "dart-cli": "Dart CLI",
  "dart-package": "Dart package",
};

export function dartFlutterSections(facts: Facts): SectionSpec[] {
  const framework = str(facts, "framework");
  const projectType = str(facts, "projectType") ?? "";
  const dartSdk = str(facts, "dartSdk");
  const flutterSdk = str(facts, "flutterSdk");
  const runCmd = str(facts, "runCmd");
  const buildCmd = str(facts, "buildCmd");
  const stateManagement = str(facts, "stateManagement");
  const routing = str(facts, "routing");
  const codegenTools = str(facts, "codegenTools");
  const lintPackage = str(facts, "lintPackage");
  const platforms = str(facts, "platforms");
  const serverFramework = str(facts, "serverFramework");
  const hasCodegen = facts.hasCodegen === true;

  // Stack summary line, pre-filled from detection.
  const stackDetected = [
    framework === "flutter" ? (flutterSdk ? `Flutter ${flutterSdk}` : "Flutter") : null,
    dartSdk ? `Dart ${dartSdk}` : null,
    PROJECT_TYPE_LABELS[projectType] ?? projectType,
    serverFramework ? serverFramework : null,
    stateManagement ? `State: ${stateManagement}` : null,
    routing ? `Routing: ${routing}` : null,
    platforms ? `Platforms: ${platforms}` : null,
  ].filter(Boolean).join(" · ");

  const buildDetected = [
    runCmd ? `- Run: \`${runCmd}\`` : null,
    buildCmd ? `- Build: \`${buildCmd}\`` : null,
    str(facts, "analyzeCmd") ? `- Analyze: \`${str(facts, "analyzeCmd")}\`` : null,
  ].filter(Boolean).join("\n");

  const packageList =
    Number(facts.packageCount ?? 0) > 1
      ? (str(facts, "packages") ?? "").split(",").map((m) => m.trim()).filter(Boolean)
      : [];

  const sections: SectionSpec[] = [
    detectedSection("## Overview", "overview", "One line: what does this project do?", str(facts, "projectDescription"), true),
    choiceSection("## Behavior", "behavior", "Agent behavior — pick what applies:", FLUTTER_BEHAVIOR, false),
    detectedSection("## Stack", "stack", "Confirm/adjust the stack summary:", stackDetected || undefined, true),
  ];

  if (packageList.length > 0) {
    sections.push(packagesSection(packageList));
  }

  sections.push(
    choiceSection("## Architecture", "architecture", "Architecture — pick what applies:", flutterArchitectureOptions(), true),
  );

  // State management — Flutter-specific. Shown for Flutter projects (always offered there,
  // even when nothing was detected, so the user can declare their choice).
  if (framework === "flutter") {
    sections.push(
      choiceSection("## State management", "stateManagement", "State management — pick what applies:", stateManagementOptions(stateManagement), true),
    );
  }

  sections.push(
    detectedSection("## Build & run", "build", "Confirm build/run/analyze commands:", buildDetected || undefined, true),
    choiceSection("## Tests", "tests", "Tests — pick what applies:", flutterTestOptions(str(facts, "testCmd"), framework), true),
  );

  // Code generation — only when build_runner/codegen is in play. The migration-style analog.
  if (hasCodegen) {
    sections.push(
      choiceSection("## Code generation", "codegen", "Code generation — pick what applies:", codegenOptions(codegenTools), true),
    );
  }

  sections.push(
    choiceSection("## Linting & analysis", "lint", "Linting & analysis — pick what applies:", lintOptions(lintPackage), true),
    choiceSection("## Config & environments", "config", "Config & environments — pick what applies:", flavorOptions(), false),
  );

  // API conventions — only meaningful for projects that talk to a network/API
  // (a server, or a Flutter app that typically consumes one).
  if (projectType === "dart-server" || projectType === "flutter-app") {
    sections.push(
      choiceSection("## API conventions", "api", "API conventions — pick what applies:", DART_API_CONVENTIONS, false),
    );
  }

  sections.push(
    choiceSection("## Code conventions", "conventions", "Code conventions — pick what applies:", [...DART_CODE_CONVENTIONS, ...COMMON_CODE_CONVENTIONS], false),
    selectSection("## Dependencies", "dependencies", "Dependency policy:", DART_DEPENDENCIES, false),
    choiceSection("## Git workflow", "git", "Git workflow — pick what applies:", GIT_WORKFLOW, false),
    choiceSection("## Never do", "never", "Never do — pick the hard rules:", DART_NEVER_DO, true),
    detectedSection("## High-blast-radius areas", "highBlast", "Highest-stakes flows to test / impact-check before editing (free text):", undefined, false),
    detectedSection("## Gotchas", "gotchas", "Project-specific quirks (free text):", undefined, false),
  );

  return sections;
}
