import { RepoSnapshot, DetectionResult, Facts } from "../types";
import { readmeSummary } from "../../core/readme";

// Detect a Node.js / TypeScript project from its package.json. One plugin covers the whole
// ecosystem — frontend apps (Vite/React, Next.js, …), backend servers (Express, NestJS,
// Fastify, Hono), CLIs, and libraries — single package or a workspaces/turbo/nx monorepo.
// Commands come from the package.json scripts, prefixed with the detected package manager.

interface PackageJson {
  name?: string;
  description?: string;
  private?: boolean;
  bin?: unknown;
  main?: string;
  exports?: unknown;
  packageManager?: string;
  workspaces?: unknown;
  engines?: { node?: string };
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

function parseJson(text: string | null): PackageJson | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as PackageJson;
  } catch {
    return null;
  }
}

// How to invoke a script for each package manager (`npm run dev` vs `pnpm dev` vs …).
function runScript(pm: string, script: string): string {
  if (pm === "npm") return script === "start" ? "npm start" : `npm run ${script}`;
  if (pm === "bun") return `bun run ${script}`;
  return `${pm} ${script}`; // pnpm / yarn invoke scripts directly
}

export function detectNodeTs(repo: RepoSnapshot): DetectionResult {
  const rootPkg = parseJson(repo.readFile("package.json"));
  if (!rootPkg) return { confidence: 0, facts: {} };

  // Aggregate every package.json so dependencies declared only in workspace packages are
  // seen (mirrors the dart plugin aggregating pubspecs).
  const pkgFiles = repo.glob(/(^|\/)package\.json$/);
  const pkgs = pkgFiles
    .map((f) => ({ path: f, pkg: parseJson(repo.readFile(f)) }))
    .filter((e): e is { path: string; pkg: PackageJson } => e.pkg !== null);
  const deps: Record<string, string> = {};
  for (const { pkg } of pkgs) {
    Object.assign(deps, pkg.dependencies, pkg.devDependencies, pkg.peerDependencies);
  }
  const has = (name: string) => name in deps;

  const facts: Facts = {};

  // Overview prefill: the manifest's own description, falling back to the README.
  const description = rootPkg.description?.trim() || readmeSummary(repo);
  if (description) facts.projectDescription = description;

  // Package manager — explicit `packageManager` field wins, then the lockfile.
  let pm = rootPkg.packageManager?.split("@")[0];
  if (!pm) {
    if (repo.exists("bun.lockb") || repo.exists("bun.lock")) pm = "bun";
    else if (repo.exists("pnpm-lock.yaml")) pm = "pnpm";
    else if (repo.exists("yarn.lock")) pm = "yarn";
    else pm = "npm";
  }
  facts.packageManager = pm;

  // TypeScript vs plain JavaScript.
  const isTypeScript = repo.exists("tsconfig.json") || has("typescript");
  facts.isTypeScript = isTypeScript;

  // Node version — engines field, then .nvmrc / .node-version.
  const nodeVersion =
    rootPkg.engines?.node?.match(/\d+(\.\d+)*/)?.[0] ??
    (repo.readFile(".nvmrc") ?? repo.readFile(".node-version") ?? "").match(/\d+(\.\d+)*/)?.[0];
  if (nodeVersion) facts.nodeVersion = nodeVersion;

  // Framework — most specific first. Meta-frameworks before their building blocks
  // (Next.js before React, NestJS before Express which it wraps).
  let framework: string | undefined;
  if (has("next")) framework = "next";
  else if (has("nuxt")) framework = "nuxt";
  else if (has("@remix-run/react") || has("@remix-run/node")) framework = "remix";
  else if (has("astro")) framework = "astro";
  else if (has("@sveltejs/kit")) framework = "sveltekit";
  else if (has("@angular/core")) framework = "angular";
  else if (has("@nestjs/core")) framework = "nestjs";
  else if (has("fastify")) framework = "fastify";
  else if (has("hono")) framework = "hono";
  else if (has("express")) framework = "express";
  else if (has("koa")) framework = "koa";
  else if (has("electron")) framework = "electron";
  else if (has("vite")) framework = "vite";
  else if (has("react-scripts")) framework = "cra";
  if (framework) facts.nodeFramework = framework;

  // UI library (independent of the build tool / meta-framework).
  const uiLibrary = has("react") ? "react" : has("vue") ? "vue" : has("svelte") ? "svelte" : undefined;
  if (uiLibrary) facts.uiLibrary = uiLibrary;

  const SERVER_FRAMEWORKS = new Set(["nestjs", "fastify", "hono", "express", "koa"]);
  const FULLSTACK_FRAMEWORKS = new Set(["next", "nuxt", "remix", "sveltekit", "astro"]);

  // Project type — drives which sections/skills apply.
  const hasBin = rootPkg.bin !== undefined;
  let projectType: string;
  if (framework && FULLSTACK_FRAMEWORKS.has(framework)) projectType = "web-app";
  else if (framework && SERVER_FRAMEWORKS.has(framework)) projectType = "server";
  else if (framework === "electron") projectType = "desktop-app";
  else if (framework && uiLibrary) projectType = "web-app"; // vite/cra + react/vue/svelte
  else if (hasBin) projectType = "cli";
  else if (!rootPkg.private && (rootPkg.main || rootPkg.exports)) projectType = "library";
  else projectType = "node-app";
  facts.projectType = projectType;
  facts.isServer = projectType === "server" || (projectType === "web-app" && framework !== undefined && FULLSTACK_FRAMEWORKS.has(framework));
  facts.isFrontend = uiLibrary !== undefined || (framework !== undefined && FULLSTACK_FRAMEWORKS.has(framework));

  // Test runner + e2e tooling.
  let testRunner: string | undefined;
  if (has("vitest")) testRunner = "vitest";
  else if (has("jest")) testRunner = "jest";
  else if (has("mocha")) testRunner = "mocha";
  else if (has("ava")) testRunner = "ava";
  else if ((rootPkg.scripts?.test ?? "").includes("node --test")) testRunner = "node:test";
  if (testRunner) facts.testRunner = testRunner;
  const e2e = has("@playwright/test") ? "playwright" : has("cypress") ? "cypress" : undefined;
  if (e2e) facts.e2eRunner = e2e;

  // Linter / formatter. Biome does both.
  if (has("@biomejs/biome")) facts.linter = "biome";
  else if (has("eslint")) facts.linter = "eslint";
  if (has("prettier")) facts.formatter = "prettier";
  else if (facts.linter === "biome") facts.formatter = "biome";

  // ORM / database layer — the migration-style analog for this stack.
  let orm: string | undefined;
  if (has("prisma") || has("@prisma/client") || repo.exists("prisma/schema.prisma")) orm = "prisma";
  else if (has("drizzle-orm")) orm = "drizzle";
  else if (has("typeorm")) orm = "typeorm";
  else if (has("kysely")) orm = "kysely";
  else if (has("knex")) orm = "knex";
  else if (has("mongoose")) orm = "mongoose";
  if (orm) facts.orm = orm;
  if (orm === "prisma") facts.migrateCmd = "npx prisma migrate dev --name <name>";
  else if (orm === "drizzle") facts.migrateCmd = "npx drizzle-kit generate && npx drizzle-kit migrate";
  else if (orm === "typeorm") facts.migrateCmd = "npx typeorm migration:generate";
  else if (orm === "knex") facts.migrateCmd = "npx knex migrate:make <name>";

  // Monorepo — workspaces / dedicated orchestrators.
  const monorepoTool = repo.exists("turbo.json")
    ? "turborepo"
    : repo.exists("nx.json")
      ? "nx"
      : repo.exists("lerna.json")
        ? "lerna"
        : rootPkg.workspaces || repo.exists("pnpm-workspace.yaml")
          ? "workspaces"
          : undefined;
  if (monorepoTool) facts.monorepoTool = monorepoTool;
  const workspacePkgs: string[] = [];
  const seen = new Set<string>();
  for (const f of pkgFiles) {
    if (!f.includes("/")) continue; // root
    const dir = f.slice(0, f.lastIndexOf("/"));
    if (seen.has(dir)) continue;
    seen.add(dir);
    workspacePkgs.push(dir.split("/").pop()!);
  }
  if (monorepoTool && workspacePkgs.length > 1) {
    facts.packageCount = workspacePkgs.length;
    facts.packages = workspacePkgs.join(",");
  }

  // Commands from root scripts. `dev` is the run command for apps; `start` for servers
  // without a dev script.
  const scripts = rootPkg.scripts ?? {};
  const isRealTestScript = (s: string | undefined) => !!s && !/no test specified/.test(s);
  if (scripts.dev) facts.runCmd = runScript(pm, "dev");
  else if (scripts.start) facts.runCmd = runScript(pm, "start");
  if (scripts.build) facts.buildCmd = runScript(pm, "build");
  if (isRealTestScript(scripts.test)) facts.testCmd = runScript(pm, "test");
  else if (testRunner === "vitest") facts.testCmd = "npx vitest run";
  else if (testRunner === "jest") facts.testCmd = "npx jest";
  if (scripts.lint) facts.lintCmd = runScript(pm, "lint");
  else if (facts.linter === "biome") facts.lintCmd = "npx biome check .";
  if (scripts.typecheck) facts.typecheckCmd = runScript(pm, "typecheck");
  else if (isTypeScript) facts.typecheckCmd = "npx tsc --noEmit";
  if (scripts.format) facts.formatCmd = runScript(pm, "format");

  // A bare package.json is weaker evidence than a pom/pubspec (many polyglot repos carry
  // one for tooling). A framework, TS config, or lockfile firms it up past the threshold.
  const confidence = framework || isTypeScript || pm !== "npm" || repo.exists("package-lock.json") ? 0.8 : 0.6;
  return { confidence, facts };
}
