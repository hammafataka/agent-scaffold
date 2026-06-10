import { StackPlugin, SectionSpec, ChoiceOption, FieldKind } from "../types";
import { COMMON_CODE_CONVENTIONS, COMMON_NEVER_DO } from "../../catalog/section-options";

function prompted(heading: string, key: string, question: string): SectionSpec {
  return {
    heading,
    fields: [{ key, question, required: true, kind: FieldKind.Multiline }],
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
  detect: () => ({ confidence: 0.1, facts: {} }),
  sections: () => [
    prompted("## Overview", "overview", "One line: what does this project do?"),
    prompted("## Build & run", "build", "How do you build and run it? (exact commands)"),
    prompted("## Tests", "tests", "How do you run tests, and what does 'done' require?"),
    checklist("## Code conventions", "conventions", "Code conventions — pick what applies:", COMMON_CODE_CONVENTIONS),
    checklist("## Never do", "never", "Never do — pick the hard rules:", COMMON_NEVER_DO),
  ],
  skills: () => [],
  commands: () => [],
  agents: () => [],
  settings: () => [],
};
