import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { scanRepo } from "../src/core/repo-scanner";
import { detectNodeTs } from "../src/plugins/node-ts/detect";
import { selectPlugin, PLUGINS } from "../src/plugins/registry";

const fixt = (name: string) => join(__dirname, "fixtures", name);

describe("detectNodeTs", () => {
  it("detects a Vite + React TypeScript app", () => {
    const r = detectNodeTs(scanRepo(fixt("vite-react")));
    expect(r.confidence).toBeGreaterThanOrEqual(0.8);
    expect(r.facts.nodeFramework).toBe("vite");
    expect(r.facts.uiLibrary).toBe("react");
    expect(r.facts.projectType).toBe("web-app");
    expect(r.facts.isFrontend).toBe(true);
    expect(r.facts.isServer).toBe(false);
    expect(r.facts.isTypeScript).toBe(true);
    expect(r.facts.packageManager).toBe("pnpm");
    expect(r.facts.testRunner).toBe("vitest");
    expect(r.facts.linter).toBe("eslint");
    expect(r.facts.formatter).toBe("prettier");
    expect(r.facts.runCmd).toBe("pnpm dev");
    expect(r.facts.buildCmd).toBe("pnpm build");
    expect(r.facts.testCmd).toBe("pnpm test");
    expect(r.facts.lintCmd).toBe("pnpm lint");
    expect(r.facts.typecheckCmd).toBe("npx tsc --noEmit");
  });

  it("detects a Next.js app with Prisma", () => {
    const r = detectNodeTs(scanRepo(fixt("nextjs-app")));
    expect(r.facts.nodeFramework).toBe("next");
    expect(r.facts.projectType).toBe("web-app");
    expect(r.facts.isServer).toBe(true); // fullstack framework serves an API too
    expect(r.facts.isFrontend).toBe(true);
    expect(r.facts.packageManager).toBe("npm");
    expect(r.facts.nodeVersion).toBe("20");
    expect(r.facts.orm).toBe("prisma");
    expect(String(r.facts.migrateCmd)).toContain("prisma migrate");
    expect(r.facts.testRunner).toBe("jest");
    expect(r.facts.e2eRunner).toBe("playwright");
    expect(r.facts.runCmd).toBe("npm run dev");
    expect(r.facts.typecheckCmd).toBe("npm run typecheck");
  });

  it("detects a plain-JavaScript Express API", () => {
    const r = detectNodeTs(scanRepo(fixt("express-api")));
    expect(r.facts.nodeFramework).toBe("express");
    expect(r.facts.projectType).toBe("server");
    expect(r.facts.isServer).toBe(true);
    expect(r.facts.isFrontend).toBe(false);
    expect(r.facts.isTypeScript).toBe(false);
    expect(r.facts.orm).toBe("mongoose");
    expect(r.facts.testRunner).toBe("mocha");
    expect(r.facts.runCmd).toBe("npm start");
    expect(r.facts.typecheckCmd).toBeUndefined();
  });

  it("detects a pnpm + turborepo monorepo and aggregates workspace deps", () => {
    const r = detectNodeTs(scanRepo(fixt("ts-monorepo")));
    expect(r.facts.packageManager).toBe("pnpm"); // from the packageManager field
    expect(r.facts.monorepoTool).toBe("turborepo");
    expect(r.facts.packageCount).toBe(3);
    expect(String(r.facts.packages).split(",").sort()).toEqual(["api", "shared", "web"]);
    // fastify + drizzle live only in packages/api — aggregation must see them.
    expect(r.facts.nodeFramework).toBe("fastify");
    expect(r.facts.orm).toBe("drizzle");
    expect(r.facts.linter).toBe("biome");
    expect(r.facts.formatter).toBe("biome");
    expect(r.facts.runCmd).toBe("pnpm dev");
  });

  it("returns zero confidence without a package.json", () => {
    const r = detectNodeTs(scanRepo(fixt("maven-app")));
    expect(r.confidence).toBe(0);
  });

  it("is selected by the registry for a node fixture, but loses to Spring in a polyglot repo", () => {
    const node = selectPlugin(scanRepo(fixt("vite-react")), PLUGINS);
    expect(node.plugin.id).toBe("node-ts");
    const spring = selectPlugin(scanRepo(fixt("maven-app")), PLUGINS);
    expect(spring.plugin.id).toBe("spring-boot");
  });
});
