import { StackPlugin, SectionSpec, ChoiceOption, FieldKind, Facts } from "../types";
import { COMMON_CODE_CONVENTIONS, COMMON_NEVER_DO } from "../../catalog/section-options";
import { atlassian, context7, github } from "../../catalog/mcp-servers";
import { readmeSummary } from "../../core/readme";

function prompted(heading: string, key: string, question: string, detected?: string): SectionSpec {
  const field: { key: string; question: string; required: boolean; kind: FieldKind; detectedValue?: string } = {
    key,
    question,
    required: true,
    kind: FieldKind.Multiline,
  };
  if (detected !== undefined) field.detectedValue = detected;
  return {
    heading,
    fields: [field],
    render: (v) => v[key] ?? "",
  };
}

// Stack-agnostic checklist (no detection, just common options + "Add my own…").
function checklist(heading: string, key: string, question: string, options: ChoiceOption[]): SectionSpec {
  return {
    heading,
    fields: [{ key, question, required: false, kind: FieldKind.Multiselect, options }],
    render: (v) => v[key] ?? "",
  };
}

export const genericPlugin: StackPlugin = {
  id: "generic",
  displayName: "Generic project",
  detect: (repo) => {
    const facts: Facts = {};
    const description = readmeSummary(repo);
    if (description) facts.projectDescription = description;
    return { confidence: 0.1, facts };
  },
  sections: (facts) => [
    prompted(
      "## Overview",
      "overview",
      "One line: what does this project do?",
      facts.projectDescription === undefined ? undefined : String(facts.projectDescription),
    ),
    prompted("## Build & run", "build", "How do you build and run it? (exact commands)"),
    prompted("## Tests", "tests", "How do you run tests, and what does 'done' require?"),
    checklist("## Code conventions", "conventions", "Code conventions — pick what applies:", COMMON_CODE_CONVENTIONS),
    checklist("## Never do", "never", "Never do — pick the hard rules:", COMMON_NEVER_DO),
  ],
  skills: () => [],
  commands: () => [],
  agents: () => [],
  settings: () => [],
  mcpServers: () => [context7(true), atlassian(false), github(false)],
};
