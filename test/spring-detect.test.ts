import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { scanRepo } from "../src/core/repo-scanner";
import { detectSpringBoot } from "../src/plugins/spring-boot/detect";

const fixt = (name: string) => join(__dirname, "fixtures", name);

describe("detectSpringBoot", () => {
  it("detects a Gradle Spring Boot app", () => {
    const r = detectSpringBoot(scanRepo(fixt("gradle-app")));
    expect(r.confidence).toBeGreaterThan(0.7);
    expect(r.facts.buildTool).toBe("gradle");
    expect(r.facts.springBootVersion).toBe("3.3.0");
    expect(r.facts.javaVersion).toBe("21");
    expect(r.facts.hasWeb).toBe(true);
    expect(r.facts.hasJpa).toBe(true);
    expect(r.facts.migrationTool).toBe("flyway");
    expect(r.facts.runCmd).toBe("./gradlew bootRun");
    expect(r.facts.buildCmd).toBe("./gradlew clean build");
    expect(r.facts.testCmd).toBe("./gradlew test");
  });

  it("detects a multi-module Gradle Spring Boot app (aggregates module build files)", () => {
    const r = detectSpringBoot(scanRepo(fixt("gradle-multimodule")));
    expect(r.confidence).toBeGreaterThan(0.7);
    expect(r.facts.buildTool).toBe("gradle");
    expect(r.facts.springBootVersion).toBe("4.0.3");
    expect(r.facts.javaVersion).toBe("17");
    // Starters live in submodules, not the root — must still be found.
    expect(r.facts.hasWeb).toBe(true); // worker uses the SB4 `webmvc` starter
    expect(r.facts.hasJpa).toBe(true); // jpa/worker modules
    expect(r.facts.hasSecurity).toBe(true);
    expect(r.facts.migrationTool).toBe("flyway"); // worker module
    // Module awareness.
    expect(r.facts.moduleCount).toBe(3);
    expect(String(r.facts.modules).split(",").sort()).toEqual(["accounts", "jpa", "worker"]);
    // Bootable module → scoped run target.
    expect(r.facts.bootModule).toBe("worker");
    expect(r.facts.runCmd).toBe("./gradlew :worker:bootRun");
  });

  it("detects nested modules declared in settings.gradle (deeper than one segment)", () => {
    const r = detectSpringBoot(scanRepo(fixt("gradle-nested")));
    expect(r.confidence).toBeGreaterThan(0.7);
    expect(r.facts.springBootVersion).toBe("3.3.0");
    expect(r.facts.javaVersion).toBe("17");
    // Starters live in the nested module dirs.
    expect(r.facts.hasWeb).toBe(true);
    expect(r.facts.hasJpa).toBe(true);
    // Nested modules are found by leaf name, not just top-level dirs.
    expect(r.facts.moduleCount).toBe(2);
    expect(String(r.facts.modules).split(",").sort()).toEqual(["fare-common", "fare-worker"]);
    // Bootable module resolved by longest-prefix; run target uses the full project path.
    expect(r.facts.bootModule).toBe("fare-worker");
    expect(r.facts.runCmd).toBe("./gradlew :servers:fare-worker:bootRun");
  });

  it("detects a Maven Spring Boot app", () => {
    const r = detectSpringBoot(scanRepo(fixt("maven-app")));
    expect(r.confidence).toBeGreaterThan(0.7);
    expect(r.facts.buildTool).toBe("maven");
    expect(r.facts.springBootVersion).toBe("3.2.5");
    expect(r.facts.javaVersion).toBe("17");
    expect(r.facts.hasSecurity).toBe(true);
    expect(r.facts.runCmd).toBe("./mvnw spring-boot:run");
  });

  it("returns zero confidence for a non-spring repo", () => {
    const r = detectSpringBoot({
      root: "/x", files: ["index.js"], exists: () => false, readFile: () => null, glob: () => [],
    });
    expect(r.confidence).toBe(0);
  });

  it("detects the manual-sql diff convention under docs/sql", () => {
    const sqlFiles = [
      "docs/sql/fcm-1.1.13.sql",
      "docs/sql/fcm1.1.13-to-1.1.14.diff.sql",
      "docs/sql/fcm-1.1.14.sql",
    ];
    const repo = {
      root: "/x",
      files: ["build.gradle", ...sqlFiles],
      exists: () => false,
      readFile: (rel: string) =>
        rel === "build.gradle" ? "id('org.springframework.boot') version '3.3.0'" : null,
      glob: (re: RegExp) => ["build.gradle", ...sqlFiles].filter((f) => re.test(f)),
    };
    const r = detectSpringBoot(repo);
    expect(r.facts.migrationTool).toBe("manual-sql");
    expect(r.facts.sqlDir).toBe("docs/sql");
    expect(r.facts.sqlPrefix).toBe("fcm");
  });

  it("detects a layered package structure (controller + service/repository)", () => {
    const javaFiles = [
      "src/main/java/com/app/controller/UserController.java",
      "src/main/java/com/app/service/UserService.java",
      "src/main/java/com/app/repository/UserRepository.java",
    ];
    const repo = {
      root: "/x",
      files: ["build.gradle", ...javaFiles],
      exists: () => false,
      readFile: (rel: string) =>
        rel === "build.gradle" ? "id('org.springframework.boot') version '3.3.0'" : null,
      glob: (re: RegExp) => javaFiles.filter((f) => re.test(f)),
    };
    expect(detectSpringBoot(repo).facts.layering).toBe("layered");
  });
});
