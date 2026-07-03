import { Facts, SectionSpec, FieldSpec, ChoiceOption, FieldKind } from "../types";
import {
  SPRING_API_CONVENTIONS,
  SPRING_BEHAVIOR,
  SPRING_CODE_CONVENTIONS,
  SPRING_DEPENDENCIES,
  SPRING_GIT_WORKFLOW,
  SPRING_NEVER_DO,
  springArchitectureOptions,
  springConfigOptions,
  springMigrationOptions,
  springPersistenceOptions,
  springTestOptions,
} from "../../catalog/section-options";

const str = (f: Facts, k: string): string | undefined =>
  f[k] === undefined ? undefined : String(f[k]);

// Free-text section (multiline). For prose only you can write (Overview, Architecture…).
function detectedSection(heading: string, key: string, question: string, detected: string | undefined, required: boolean): SectionSpec {
  const field: FieldSpec = { key, question, required, kind: FieldKind.Multiline };
  if (detected !== undefined) field.detectedValue = detected;
  return { heading, fields: [field], render: (v) => v[key] ?? "" };
}

// Checklist section. Detected options are pre-checked; in --yes mode the detected ones
// become the body. Always offers "Add my own…" via the prompter.
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

// Modules section (multi-module only): one optional text field per detected module so
// the user can describe what each is for. Detected names always render; purposes are
// appended when given. In --yes mode (no purposes) it degrades to a plain name list.
function modulesSection(moduleList: string[], bootModule: string | undefined): SectionSpec {
  const fields: FieldSpec[] = moduleList.map((name) => ({
    key: `mod_${name}`,
    question: `\`${name}\` — what is this module for?`,
    required: false,
    kind: FieldKind.Text,
  }));
  return {
    heading: "## Modules",
    fields,
    render: (v) =>
      moduleList
        .map((name) => {
          const marker = name === bootModule ? " (application)" : "";
          const purpose = (v[`mod_${name}`] ?? "").trim();
          return `- \`${name}\`${marker}${purpose ? ` — ${purpose}` : ""}`;
        })
        .join("\n"),
  };
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

  const moduleCount = Number(facts.moduleCount ?? 0);
  const bootModule = str(facts, "bootModule");
  const buildToolLabel = buildTool ? buildTool[0].toUpperCase() + buildTool.slice(1) : null;
  const stackDetected = [
    sbVer ? `Spring Boot ${sbVer}` : null,
    javaVer ? `Java ${javaVer}` : null,
    moduleCount > 1 ? `${buildToolLabel} multi-module (${moduleCount} modules)` : buildToolLabel,
    starters.length ? `Starters: ${starters.join(", ")}` : null,
  ].filter(Boolean).join(", ");

  // Module list (multi-module only): leaf names, the bootable one gets a purpose prompt.
  const moduleList =
    moduleCount > 1
      ? (str(facts, "modules") ?? "")
          .split(",")
          .map((m) => m.trim())
          .filter(Boolean)
      : [];

  const buildDetected = [
    runCmd ? `- Run: \`${runCmd}\`` : null,
    buildCmd ? `- Build: \`${buildCmd}\`` : null,
  ].filter(Boolean).join("\n");

  const sections: SectionSpec[] = [
    detectedSection("## Overview", "overview", "One line: what does this service do?", str(facts, "projectDescription"), true),
    choiceSection("## Behavior", "behavior", "Agent behavior — pick what applies:", SPRING_BEHAVIOR, false),
    detectedSection("## Stack", "stack", "Confirm/adjust the stack summary:", stackDetected || undefined, true),
  ];

  // Modules section only appears for multi-module projects.
  if (moduleList.length > 0) {
    sections.push(modulesSection(moduleList, bootModule));
  }

  sections.push(
    choiceSection("## Architecture", "architecture", "Architecture — pick what applies:", springArchitectureOptions(str(facts, "layering")), true),
    detectedSection("## Build & run", "build", "Confirm build/run commands:", buildDetected || undefined, true),
    choiceSection("## Tests", "tests", "Tests — pick what applies:", springTestOptions(testCmd), true),
  );

  const hasPersistence = !!facts.hasJpa || (migrationTool !== undefined && migrationTool !== "none");
  if (hasPersistence) {
    sections.push(
      selectSection("## DB migration", "dbMigration", "Database migration tool:", springMigrationOptions(migrationTool, str(facts, "sqlDir"), str(facts, "sqlPrefix")), true),
      choiceSection("## Persistence", "persistence", "Persistence — pick what applies:", springPersistenceOptions(), true),
    );
  }

  sections.push(
    choiceSection("## Config & profiles", "config", "Config & profiles — pick what applies:", springConfigOptions(profile), false),
    choiceSection("## API conventions", "api", "API conventions — pick what applies:", SPRING_API_CONVENTIONS, false),
    choiceSection("## Code conventions", "conventions", "Code conventions — pick what applies:", SPRING_CODE_CONVENTIONS, false),
    selectSection("## Dependencies", "dependencies", "Dependency policy:", SPRING_DEPENDENCIES, false),
    choiceSection("## Git workflow", "git", "Git workflow — pick what applies:", SPRING_GIT_WORKFLOW, false),
    choiceSection("## Never do", "never", "Never do — pick the hard rules:", SPRING_NEVER_DO, true),
    detectedSection("## High-blast-radius areas", "highBlast", "Highest-stakes flows to test / impact-check before editing (free text):", undefined, false),
    detectedSection("## Gotchas", "gotchas", "Project-specific quirks (free text):", undefined, false),
  );

  return sections;
}
