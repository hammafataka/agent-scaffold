import { describe, it, expect } from "vitest";
import { nodeTsSections } from "../src/plugins/node-ts/sections";
import { nodeSkills } from "../src/catalog/node-skills";
import { nodeCommands } from "../src/catalog/node-commands";
import { nodeAgents } from "../src/catalog/node-agents";
import { nodeTsSettings } from "../src/plugins/node-ts/settings";
import { Facts } from "../src/plugins/types";

const webFacts: Facts = {
  isTypeScript: true,
  packageManager: "pnpm",
  nodeFramework: "vite",
  uiLibrary: "react",
  projectType: "web-app",
  isFrontend: true,
  isServer: false,
  testRunner: "vitest",
  linter: "eslint",
  formatter: "prettier",
  runCmd: "pnpm dev",
  buildCmd: "pnpm build",
  testCmd: "pnpm test",
  lintCmd: "pnpm lint",
  typecheckCmd: "npx tsc --noEmit",
};

const serverFacts: Facts = {
  isTypeScript: true,
  packageManager: "npm",
  nodeFramework: "nestjs",
  projectType: "server",
  isFrontend: false,
  isServer: true,
  orm: "prisma",
  migrateCmd: "npx prisma migrate dev --name <name>",
  runCmd: "npm run dev",
  testCmd: "npm run test",
  typecheckCmd: "npx tsc --noEmit",
};

describe("nodeTsSections", () => {
  it("builds the expected section set for a frontend app", () => {
    const headings = nodeTsSections(webFacts).map((s) => s.heading);
    expect(headings).toContain("## Overview");
    expect(headings).toContain("## Stack");
    expect(headings).toContain("## Build & run");
    expect(headings).toContain("## Tests");
    expect(headings).toContain("## Linting & formatting");
    expect(headings).not.toContain("## Database & migrations"); // no ORM
    expect(headings).not.toContain("## API conventions"); // not a server
    expect(headings).not.toContain("## Packages"); // not a monorepo
  });

  it("adds DB and API sections for a server with an ORM", () => {
    const headings = nodeTsSections(serverFacts).map((s) => s.heading);
    expect(headings).toContain("## Database & migrations");
    expect(headings).toContain("## API conventions");
  });

  it("pre-fills the stack summary from detection", () => {
    const stack = nodeTsSections(webFacts).find((s) => s.heading === "## Stack")!;
    expect(stack.fields[0].detectedValue).toContain("TypeScript");
    expect(stack.fields[0].detectedValue).toContain("Vite");
    expect(stack.fields[0].detectedValue).toContain("pnpm");
  });

  it("adds a Packages section for a monorepo", () => {
    const headings = nodeTsSections({ ...webFacts, monorepoTool: "turborepo", packageCount: 2, packages: "api,web" }).map((s) => s.heading);
    expect(headings).toContain("## Packages");
  });
});

describe("node skills / commands / agents", () => {
  it("gates skills by facts", () => {
    const web = nodeSkills(webFacts);
    const byName = <T extends { name: string }>(list: T[], n: string): T | undefined =>
      list.find((s) => s.name === n);
    expect(byName(web, "react-patterns")?.condition).toBe(true);
    expect(byName(web, "node-api-patterns")?.condition).toBe(false);
    expect(byName(web, "add-migration")?.condition).toBe(false);

    const server = nodeSkills(serverFacts);
    expect(byName(server, "react-patterns")?.condition).toBe(false);
    expect(byName(server, "node-api-patterns")?.condition).toBe(true);
    expect(byName(server, "add-migration")?.condition).toBe(true);
    expect(byName(server, "add-migration")?.body).toContain("prisma migrate");
  });

  it("builds verify command from typecheck + lint + test", () => {
    const verify = nodeCommands(webFacts).find((c) => c.name === "verify")!;
    expect(verify.body).toContain("npx tsc --noEmit");
    expect(verify.body).toContain("pnpm lint");
    expect(verify.body).toContain("pnpm test");
  });

  it("gates engineer agents by stack side", () => {
    const web = nodeAgents(webFacts);
    expect(web.find((a) => a.name === "frontend-engineer")?.condition).toBe(true);
    expect(web.find((a) => a.name === "node-backend-engineer")?.condition).toBe(false);
    const server = nodeAgents(serverFacts);
    expect(server.find((a) => a.name === "frontend-engineer")?.condition).toBe(false);
    expect(server.find((a) => a.name === "node-backend-engineer")?.condition).toBe(true);
  });

  it("emits package-manager permissions and both guards", () => {
    const [spec] = nodeTsSettings(webFacts);
    expect(spec.allow).toContain("Bash(pnpm run:*)");
    expect(spec.allow).toContain("Bash(npx:*)");
    expect(spec.guards?.map((g) => g.path)).toEqual([
      ".claude/hooks/guards/protected-paths.sh",
      ".claude/hooks/guards/secret-scan.sh",
    ]);
  });
});
