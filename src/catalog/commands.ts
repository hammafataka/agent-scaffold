import { Facts, CommandSpec } from "../plugins/types";

const s = (f: Facts, k: string): string => String(f[k] ?? "");

export function springCommands(facts: Facts): CommandSpec[] {
  const buildCmd = s(facts, "buildCmd");
  const testCmd = s(facts, "testCmd");
  return [
    {
      name: "build",
      description: "Clean build/package the project.",
      body: `Build the project:\n\n\`\`\`bash\n${buildCmd}\n\`\`\``,
    },
    {
      name: "verify",
      description: "Build and run all tests before committing.",
      body: `Verify the project is green:\n\n\`\`\`bash\n${buildCmd}\n${testCmd}\n\`\`\`\n\nFix any failures before committing.`,
    },
  ];
}
