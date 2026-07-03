import { Facts, SkillSpec } from "../plugins/types";
import content from "./node-content.json";

const s = (f: Facts, k: string): string => String(f[k] ?? "");

// Curated skills authored under src/catalog/node/skills/. Mostly fact-independent, but a
// few only make sense for one side of the stack — gate those by detected facts.
function curatedSkills(facts: Facts): SkillSpec[] {
  const isFrontend = facts.isFrontend === true;
  const isServer = facts.isServer === true;
  const conditions: Record<string, boolean> = {
    "react-patterns": isFrontend && s(facts, "uiLibrary") === "react",
    "node-api-patterns": isServer,
  };
  return (content.skills as SkillSpec[]).map((sk) => ({
    ...sk,
    condition: conditions[sk.name] ?? true,
  }));
}

export function nodeSkills(facts: Facts): SkillSpec[] {
  const runCmd = s(facts, "runCmd");
  const buildCmd = s(facts, "buildCmd");
  const testCmd = s(facts, "testCmd");
  const lintCmd = s(facts, "lintCmd");
  const typecheckCmd = s(facts, "typecheckCmd");
  const migrateCmd = s(facts, "migrateCmd");
  const orm = s(facts, "orm");

  const verifyChain = [typecheckCmd, lintCmd, testCmd].filter(Boolean).join("\n");

  return [
    {
      name: "run",
      description: "Run the app locally in dev mode.",
      condition: !!runCmd,
      body: `Use this to run the project during development.\n\n\`\`\`bash\n${runCmd}\n\`\`\`\n\nMost dev servers hot-reload on save; restart only after dependency or config changes.`,
    },
    {
      name: "test",
      description: "Run the test suite and confirm it passes.",
      condition: !!testCmd,
      body: `Run all tests:\n\n\`\`\`bash\n${testCmd}\n\`\`\`\n\n"Done" requires green tests with new code covered${typecheckCmd ? ` and a clean \`${typecheckCmd}\`` : ""}.`,
    },
    {
      name: "verify",
      description: "Full pre-commit verification: typecheck, lint, test.",
      condition: !!verifyChain,
      body: `Verify the project is green before committing:\n\n\`\`\`bash\n${verifyChain}\n\`\`\`\n\nFix failures properly — never skip tests or inline-disable lint rules to get to green.${buildCmd ? `\n\nFor release-readiness also run \`${buildCmd}\`.` : ""}`,
    },
    {
      name: "add-migration",
      description: `Create a database migration with ${orm || "the project's ORM"}.`,
      condition: !!migrateCmd,
      body: `Create a new migration after changing the schema:\n\n\`\`\`bash\n${migrateCmd}\n\`\`\`\n\nRules:\n\n- Never edit an applied migration — add a new one.\n- Regenerate the ORM client/types after schema changes so the compiler sees the new shape.\n- Review the generated SQL before committing; the generator is a starting point, not an oracle.`,
    },
    ...curatedSkills(facts),
  ];
}
