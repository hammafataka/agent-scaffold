import { Facts, CommandSpec } from "../plugins/types";

const s = (f: Facts, k: string): string => String(f[k] ?? "");

export function dartCommands(facts: Facts): CommandSpec[] {
  const buildCmd = s(facts, "buildCmd");
  const testCmd = s(facts, "testCmd");
  const analyzeCmd = s(facts, "analyzeCmd") || "dart analyze";
  const hasCodegen = facts.hasCodegen === true;
  const codegenCmd = s(facts, "codegenCmd") || "dart run build_runner build --delete-conflicting-outputs";

  const commands: CommandSpec[] = [];
  if (buildCmd) {
    commands.push({
      name: "build",
      description: "Build/compile the project.",
      body: `Build the project:\n\n\`\`\`bash\n${buildCmd}\n\`\`\``,
    });
  }
  commands.push({
    name: "verify",
    description: "Analyze, test, and (re)generate code before committing.",
    body:
      `Verify the project is green:\n\n\`\`\`bash\n` +
      (hasCodegen ? `${codegenCmd}\n` : "") +
      `${analyzeCmd}\n${testCmd}\n\`\`\`\n\nFix any analyzer or test failures before committing.`,
  });
  if (hasCodegen) {
    commands.push({
      name: "codegen",
      description: "Regenerate build_runner output.",
      body: `Regenerate generated code:\n\n\`\`\`bash\n${codegenCmd}\n\`\`\``,
    });
  }
  return commands;
}
