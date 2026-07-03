import { describe, it, expect } from "vitest";
import { dartFlutterSections } from "../src/plugins/dart-flutter/sections";
import { Facts } from "../src/plugins/types";

const flutterFacts: Facts = {
  framework: "flutter",
  projectType: "flutter-app",
  dartSdk: "3.5.0",
  flutterSdk: "3.24.0",
  stateManagement: "riverpod",
  routing: "go_router",
  hasCodegen: true,
  codegenTools: "freezed,json_serializable",
  lintPackage: "flutter_lints",
  platforms: "android,ios,web",
  runCmd: "flutter run",
  buildCmd: "flutter build apk",
  testCmd: "flutter test",
  analyzeCmd: "flutter analyze",
};

describe("dartFlutterSections", () => {
  it("pre-fills the Stack section from detected facts", () => {
    const sections = dartFlutterSections(flutterFacts);
    const stack = sections.find((s) => s.heading === "## Stack")!;
    const field = stack.fields.find((f) => f.key === "stack")!;
    expect(field.detectedValue).toContain("Flutter 3.24.0");
    expect(field.detectedValue).toContain("Dart 3.5.0");
    expect(field.detectedValue).toContain("Flutter app");
    expect(stack.render({ stack: field.detectedValue! })).toContain("riverpod");
  });

  it("includes State management and Code generation for a Flutter codegen app", () => {
    const headings = dartFlutterSections(flutterFacts).map((s) => s.heading);
    expect(headings).toContain("## State management");
    expect(headings).toContain("## Code generation");
    expect(headings).toContain("## Linting & analysis");
  });

  it("pre-checks the detected state-management solution", () => {
    const sections = dartFlutterSections(flutterFacts);
    const sm = sections.find((s) => s.heading === "## State management")!;
    const field = sm.fields[0];
    expect(field.detectedValue ?? "").toContain("Riverpod");
  });

  it("omits Code generation when there is no codegen, and State management for pure Dart", () => {
    const dartFacts: Facts = {
      framework: "dart",
      projectType: "dart-cli",
      dartSdk: "3.4.0",
      hasCodegen: false,
      runCmd: "dart run",
      testCmd: "dart test",
      analyzeCmd: "dart analyze",
    };
    const headings = dartFlutterSections(dartFacts).map((s) => s.heading);
    expect(headings).not.toContain("## Code generation");
    expect(headings).not.toContain("## State management");
    expect(headings).toContain("## Linting & analysis");
  });

  it("shows a Packages section for a multi-package workspace", () => {
    const headings = dartFlutterSections({ ...flutterFacts, packageCount: 3, packages: "app,data,ui" }).map(
      (s) => s.heading,
    );
    expect(headings).toContain("## Packages");
  });
});
