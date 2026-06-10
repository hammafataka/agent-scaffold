// The methodology surface: a single `## Implementation workflow` section that ties
// the installed PDD skills into one ordered pipeline (interview → PRD → TDD →
// tracer-bullet slices). It is emitted into CLAUDE.md only when the PDD methodology
// output is selected, so the prose and the `.claude/skills/pdd/*` files stay in sync.
//
// The step list references PDD skills *by name* and is validated against the actual
// PDD catalog (`pddSkills()`), so a renamed or removed skill fails loudly here rather
// than emitting a dead `.claude/skills/pdd/<name>/SKILL.md` path into the doc.

import { pddSkills } from "./pdd-skills";

export interface RenderedSection {
  heading: string;
  body: string;
}

interface WorkflowStep {
  title: string;
  blurb: string;
  skills: string[]; // PDD skill names driving this step
}

const STEPS: WorkflowStep[] = [
  {
    title: "Interview first",
    blurb:
      "Never jump ahead. Ask clarifying questions one at a time until you and the user share full understanding of intent, scope, and constraints — only then plan or implement",
    skills: ["walk-and-talk", "walk-and-write"],
  },
  {
    title: "Write the PRD",
    blurb: "Synthesise the agreed solution into a PRD before any code",
    skills: ["write-prd"],
  },
  {
    title: "TDD",
    blurb: "Write failing tests before the implementation; red → green → refactor",
    skills: ["tdd"],
  },
  {
    title: "Tracer-bullet slices",
    blurb:
      "Split the work into thin end-to-end vertical slices (controller → service → repo → test), never a big bang; turn the plan into slice tickets",
    skills: ["to-tickets"],
  },
];

function skillRef(name: string): string {
  return `\`${name}\` (\`.claude/skills/pdd/${name}/SKILL.md\`)`;
}

export function pddWorkflowBody(): string {
  const known = new Set(pddSkills().map((sk) => sk.name));
  const lines: string[] = [
    "Follow this methodology end-to-end. Each step has a skill under `.claude/skills/pdd/`:",
    "",
  ];
  STEPS.forEach((step, i) => {
    for (const name of step.skills) {
      if (!known.has(name)) {
        throw new Error(
          `pdd-workflow: unknown PDD skill "${name}" — update STEPS in pdd-workflow.ts or the PDD catalog`,
        );
      }
    }
    const refs = step.skills.map(skillRef).join(" or ");
    lines.push(`${i + 1}. **${step.title}.** ${step.blurb} — ${refs}.`);
  });
  return lines.join("\n");
}

export function pddWorkflowSection(): RenderedSection {
  return { heading: "## Implementation workflow", body: pddWorkflowBody() };
}
