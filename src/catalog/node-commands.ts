import { Facts, CommandSpec } from "../plugins/types";

const s = (f: Facts, k: string): string => String(f[k] ?? "");

export function nodeCommands(facts: Facts): CommandSpec[] {
  const buildCmd = s(facts, "buildCmd");
  const testCmd = s(facts, "testCmd");
  const lintCmd = s(facts, "lintCmd");
  const typecheckCmd = s(facts, "typecheckCmd");

  const commands: CommandSpec[] = [];
  if (buildCmd) {
    commands.push({
      name: "build",
      description: "Build the project.",
      body: `Build the project:\n\n\`\`\`bash\n${buildCmd}\n\`\`\``,
    });
  }
  const verifyChain = [typecheckCmd, lintCmd, testCmd].filter(Boolean).join("\n");
  if (verifyChain) {
    commands.push({
      name: "verify",
      description: "Typecheck, lint, and test before committing.",
      body: `Verify the project is green:\n\n\`\`\`bash\n${verifyChain}\n\`\`\`\n\nFix any failures before committing.`,
    });
  }
  return commands;
}
