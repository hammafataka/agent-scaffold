import { Facts, SectionSpec, FieldSpec, ChoiceOption, FieldKind } from "../types";
import { COMMON_CODE_CONVENTIONS, GIT_WORKFLOW } from "../../catalog/section-options";
import {
  NODE_API_CONVENTIONS,
  NODE_BEHAVIOR,
  NODE_CODE_CONVENTIONS,
  NODE_DEPENDENCIES,
  nodeArchitectureOptions,
  nodeConfigOptions,
  nodeDbOptions,
  nodeLintOptions,
  nodeNeverDo,
  nodeTestOptions,
} from "../../catalog/node-section-options";

const str = (f: Facts, k: string): string | undefined =>
  f[k] === undefined ? undefined : String(f[k]);

// Free-text section (multiline) — same shape as the spring-boot/dart helpers.
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

// Packages section (monorepo only): one optional purpose prompt per workspace package.
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

const FRAMEWORK_LABELS: Record<string, string> = {
  next: "Next.js",
  nuxt: "Nuxt",
  remix: "Remix",
  astro: "Astro",
  sveltekit: "SvelteKit",
  angular: "Angular",
  nestjs: "NestJS",
  fastify: "Fastify",
  hono: "Hono",
  express: "Express",
  koa: "Koa",
  electron: "Electron",
  vite: "Vite",
  cra: "Create React App",
};

const PROJECT_TYPE_LABELS: Record<string, string> = {
  "web-app": "web app",
  server: "server",
  "desktop-app": "desktop app",
  cli: "CLI",
  library: "library",
  "node-app": "Node app",
};

export function nodeTsSections(facts: Facts): SectionSpec[] {
  const framework = str(facts, "nodeFramework");
  const uiLibrary = str(facts, "uiLibrary");
  const projectType = str(facts, "projectType") ?? "";
  const isFrontend = facts.isFrontend === true;
  const isServer = facts.isServer === true;
  const orm = str(facts, "orm");

  // Stack summary line, pre-filled from detection.
  const stackDetected = [
    facts.isTypeScript ? "TypeScript" : "JavaScript",
    facts.nodeVersion ? `Node ${facts.nodeVersion}` : "Node.js",
    framework ? FRAMEWORK_LABELS[framework] ?? framework : null,
    uiLibrary && framework !== "cra" ? uiLibrary : null,
    PROJECT_TYPE_LABELS[projectType] ?? projectType,
    str(facts, "packageManager"),
    str(facts, "monorepoTool") ? `monorepo (${str(facts, "monorepoTool")})` : null,
  ].filter(Boolean).join(" · ");

  const buildDetected = [
    str(facts, "runCmd") ? `- Run (dev): \`${str(facts, "runCmd")}\`` : null,
    str(facts, "buildCmd") ? `- Build: \`${str(facts, "buildCmd")}\`` : null,
    str(facts, "typecheckCmd") ? `- Typecheck: \`${str(facts, "typecheckCmd")}\`` : null,
  ].filter(Boolean).join("\n");

  const packageList =
    Number(facts.packageCount ?? 0) > 1
      ? (str(facts, "packages") ?? "").split(",").map((m) => m.trim()).filter(Boolean)
      : [];

  const sections: SectionSpec[] = [
    detectedSection("## Overview", "overview", "One line: what does this project do?", str(facts, "projectDescription"), true),
    choiceSection("## Behavior", "behavior", "Agent behavior — pick what applies:", NODE_BEHAVIOR, false),
    detectedSection("## Stack", "stack", "Confirm/adjust the stack summary:", stackDetected || undefined, true),
  ];

  if (packageList.length > 0) {
    sections.push(packagesSection(packageList));
  }

  sections.push(
    choiceSection("## Architecture", "architecture", "Architecture — pick what applies:", nodeArchitectureOptions(isFrontend, isServer), true),
    detectedSection("## Build & run", "build", "Confirm run/build/typecheck commands:", buildDetected || undefined, true),
    choiceSection("## Tests", "tests", "Tests — pick what applies:", nodeTestOptions(str(facts, "testCmd"), str(facts, "testRunner"), str(facts, "e2eRunner")), true),
  );

  // Database & migrations — only when an ORM is in play. The migration-style analog.
  if (orm) {
    sections.push(
      choiceSection("## Database & migrations", "database", "Database & migrations — pick what applies:", nodeDbOptions(orm, str(facts, "migrateCmd")), true),
    );
  }

  sections.push(
    choiceSection("## Linting & formatting", "lint", "Linting & formatting — pick what applies:", nodeLintOptions(str(facts, "linter"), str(facts, "formatter"), str(facts, "lintCmd"), str(facts, "typecheckCmd")), true),
    choiceSection("## Config & environments", "config", "Config & environments — pick what applies:", nodeConfigOptions(), false),
  );

  // API conventions — only for projects that expose or consume an HTTP API.
  if (isServer) {
    sections.push(
      choiceSection("## API conventions", "api", "API conventions — pick what applies:", NODE_API_CONVENTIONS, false),
    );
  }

  sections.push(
    choiceSection("## Code conventions", "conventions", "Code conventions — pick what applies:", [...NODE_CODE_CONVENTIONS, ...COMMON_CODE_CONVENTIONS], false),
    selectSection("## Dependencies", "dependencies", "Dependency policy:", NODE_DEPENDENCIES, false),
    choiceSection("## Git workflow", "git", "Git workflow — pick what applies:", GIT_WORKFLOW, false),
    choiceSection("## Never do", "never", "Never do — pick the hard rules:", nodeNeverDo(str(facts, "packageManager") ?? "npm"), true),
    detectedSection("## High-blast-radius areas", "highBlast", "Highest-stakes flows to test / impact-check before editing (free text):", undefined, false),
    detectedSection("## Gotchas", "gotchas", "Project-specific quirks (free text):", undefined, false),
  );

  return sections;
}
