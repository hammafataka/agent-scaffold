import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { scanRepo } from "../src/core/repo-scanner";
import { detectDartFlutter } from "../src/plugins/dart-flutter/detect";

const fixt = (name: string) => join(__dirname, "fixtures", name);

describe("detectDartFlutter", () => {
  it("detects a Flutter app", () => {
    const r = detectDartFlutter(scanRepo(fixt("flutter-app")));
    expect(r.confidence).toBeGreaterThan(0.7);
    expect(r.facts.framework).toBe("flutter");
    expect(r.facts.projectType).toBe("flutter-app");
    expect(r.facts.dartSdk).toBe("3.5.0");
    expect(r.facts.flutterSdk).toBe("3.24.0");
    expect(r.facts.stateManagement).toBe("riverpod");
    expect(r.facts.routing).toBe("go_router");
    expect(r.facts.hasCodegen).toBe(true);
    expect(String(r.facts.codegenTools)).toContain("freezed");
    expect(String(r.facts.codegenTools)).toContain("json_serializable");
    expect(r.facts.lintPackage).toBe("flutter_lints");
    expect(String(r.facts.platforms).split(",").sort()).toEqual(["android", "ios", "web"]);
    expect(r.facts.runCmd).toBe("flutter run");
    expect(r.facts.buildCmd).toBe("flutter build apk");
    expect(r.facts.testCmd).toBe("flutter test");
    expect(r.facts.analyzeCmd).toBe("flutter analyze");
  });

  it("detects a Dart CLI", () => {
    const r = detectDartFlutter(scanRepo(fixt("dart-cli")));
    expect(r.confidence).toBeGreaterThan(0.7);
    expect(r.facts.framework).toBe("dart");
    expect(r.facts.projectType).toBe("dart-cli");
    expect(r.facts.dartSdk).toBe("3.4.0");
    expect(r.facts.hasCodegen).toBe(false);
    expect(r.facts.lintPackage).toBe("lints");
    expect(r.facts.runCmd).toBe("dart run");
    expect(r.facts.buildCmd).toBe("dart compile exe bin/main.dart");
    expect(r.facts.testCmd).toBe("dart test");
    expect(r.facts.analyzeCmd).toBe("dart analyze");
  });

  it("detects a Dart server (dart_frog)", () => {
    const r = detectDartFlutter(scanRepo(fixt("dart-server")));
    expect(r.confidence).toBeGreaterThan(0.7);
    expect(r.facts.framework).toBe("dart");
    expect(r.facts.projectType).toBe("dart-server");
    expect(r.facts.serverFramework).toBe("dart_frog");
    expect(r.facts.lintPackage).toBe("very_good_analysis");
    expect(r.facts.runCmd).toBe("dart_frog dev");
    expect(r.facts.buildCmd).toBe("dart_frog build");
    expect(r.facts.testCmd).toBe("dart test");
  });

  it("detects a melos multi-package Flutter workspace", () => {
    const r = detectDartFlutter(scanRepo(fixt("flutter-melos")));
    expect(r.confidence).toBeGreaterThan(0.7);
    expect(r.facts.framework).toBe("flutter");
    expect(r.facts.isMelos).toBe(true);
    expect(r.facts.packageCount).toBe(3);
    expect(String(r.facts.packages).split(",").sort()).toEqual(["app", "data", "ui"]);
    expect(r.facts.stateManagement).toBe("bloc");
    expect(r.facts.routing).toBe("go_router");
    expect(r.facts.hasCodegen).toBe(true);
  });

  it("returns zero confidence with no pubspec", () => {
    const r = detectDartFlutter(scanRepo(fixt("gradle-app")));
    expect(r.confidence).toBe(0);
  });
});
