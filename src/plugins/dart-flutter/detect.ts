import { RepoSnapshot, DetectionResult, Facts } from "../types";
import { readmeSummary } from "../../core/readme";

// Detect a Dart or Flutter project from its pubspec.yaml. One plugin covers the whole
// ecosystem — pure Dart (CLI / server / package) and Flutter (app / package / plugin) —
// the way the spring-boot plugin covers both the Java language and the Spring framework.
// Commands branch by the detected project type; everything else is read from the
// aggregated pubspec text so a melos monorepo is understood as a whole.
export function detectDartFlutter(repo: RepoSnapshot): DetectionResult {
  const rootPubspec = repo.readFile("pubspec.yaml");
  // A repo with packages but no root pubspec (pure melos workspace) still counts.
  const pubspecFiles = repo.glob(/(^|\/)pubspec\.yaml$/);
  if (!rootPubspec && pubspecFiles.length === 0) return { confidence: 0, facts: {} };

  // Aggregate every pubspec so dependencies declared only in sub-packages are seen.
  const allText = [rootPubspec ?? "", ...pubspecFiles.map((f) => repo.readFile(f) ?? "")].join("\n");
  // Version / SDK come from the root pubspec (the workspace root pins the toolchain);
  // fall back to the aggregate when there is no root pubspec.
  const verSrc = rootPubspec ?? allText;

  const facts: Facts = {};

  // Overview prefill: the pubspec's own description, falling back to the README.
  const description =
    (verSrc.match(/^description:\s*(.+)$/m)?.[1] ?? "").trim().replace(/^["']|["']$/g, "") ||
    readmeSummary(repo);
  if (description) facts.projectDescription = description;

  // Framework: a Flutter project declares the Flutter SDK as a dependency (`sdk: flutter`).
  const isFlutter = /sdk:\s*flutter\b/.test(allText);
  const framework: "flutter" | "dart" = isFlutter ? "flutter" : "dart";
  facts.framework = framework;

  // SDK constraints from the `environment:` block. Capture the lower bound version.
  const envBlock = verSrc.match(/^environment:\s*\n((?:[ \t]+.*\n?)+)/m)?.[1] ?? "";
  const dartSdk = (envBlock.match(/sdk:\s*(.+)/)?.[1] ?? "").match(/(\d+\.\d+\.\d+)/)?.[1];
  if (dartSdk) facts.dartSdk = dartSdk;
  let flutterSdk = (envBlock.match(/(?:^|\n)\s*flutter:\s*(.+)/)?.[1] ?? "").match(/(\d+\.\d+\.\d+)/)?.[1];
  // FVM pins the Flutter version outside pubspec — `.fvmrc` (new) or `.fvm/fvm_config.json` (old).
  const hasFvm = repo.exists(".fvmrc") || repo.exists(".fvm/fvm_config.json");
  if (!flutterSdk) {
    const fvmText = repo.readFile(".fvmrc") ?? repo.readFile(".fvm/fvm_config.json") ?? "";
    flutterSdk = fvmText.match(/(\d+\.\d+\.\d+)/)?.[1];
  }
  if (flutterSdk) facts.flutterSdk = flutterSdk;

  // State management — Flutter's defining architectural axis (no Spring analog). Detected
  // from dependency names; families collapse to one label (flutter_riverpod → riverpod).
  const sm: string[] = [];
  if (/riverpod/.test(allText)) sm.push("riverpod");
  if (/\bbloc:|flutter_bloc/.test(allText)) sm.push("bloc");
  if (/^[ \t]+provider:/m.test(allText)) sm.push("provider");
  if (/^[ \t]+get:/m.test(allText) || /\bgetx\b/.test(allText)) sm.push("getx");
  if (/mobx/.test(allText)) sm.push("mobx");
  if (/^[ \t]+redux:/m.test(allText) || /flutter_redux/.test(allText)) sm.push("redux");
  if (/^[ \t]+stacked:/m.test(allText)) sm.push("stacked");
  if (/signals(_flutter)?:/.test(allText)) sm.push("signals");
  if (sm.length) facts.stateManagement = sm.join(",");

  // Routing package.
  const routing: string[] = [];
  if (/go_router/.test(allText)) routing.push("go_router");
  if (/auto_route/.test(allText)) routing.push("auto_route");
  if (/\bbeamer:/.test(allText)) routing.push("beamer");
  if (routing.length) facts.routing = routing.join(",");

  // Code generation — the build_runner workflow (the closest analog to a DB migration:
  // a project-specific, convention-bound generation step). Track which generators are used.
  const codegenTools: string[] = [];
  for (const tool of ["freezed", "json_serializable", "injectable", "retrofit", "drift", "isar", "mockito"]) {
    if (new RegExp(`\\b${tool}\\b`).test(allText)) codegenTools.push(tool);
  }
  if (routing.includes("auto_route")) codegenTools.push("auto_route");
  const hasCodegen = /build_runner/.test(allText) || codegenTools.length > 0;
  facts.hasCodegen = hasCodegen;
  if (codegenTools.length) facts.codegenTools = codegenTools.join(",");

  // Lint ruleset — from dev_dependencies + analysis_options.yaml.
  if (/very_good_analysis/.test(allText)) facts.lintPackage = "very_good_analysis";
  else if (/flutter_lints/.test(allText)) facts.lintPackage = "flutter_lints";
  else if (/^[ \t]+lints:/m.test(allText)) facts.lintPackage = "lints";

  // Localization via `flutter gen-l10n`.
  facts.hasL10n = repo.exists("l10n.yaml");

  // Server framework (drives the dart-server commands).
  let serverFramework: string | undefined;
  for (const fw of ["dart_frog", "serverpod", "shelf", "conduit"]) {
    if (new RegExp(`\\b${fw}\\b`).test(allText)) {
      serverFramework = fw;
      break;
    }
  }
  if (serverFramework) facts.serverFramework = serverFramework;

  // Target platforms (Flutter only) — inferred from the presence of platform folders.
  if (isFlutter) {
    const platforms = ["android", "ios", "web", "macos", "linux", "windows"].filter(
      (p) => repo.glob(new RegExp(`^${p}\\/`)).length > 0,
    );
    if (platforms.length) facts.platforms = platforms.join(",");
  }

  const hasMain = repo.exists("lib/main.dart") || repo.glob(/(^|\/)lib\/main\.dart$/).length > 0;
  const hasBin = repo.glob(/^bin\/.*\.dart$/).length > 0;
  const hasExecutables = /^executables:/m.test(verSrc);
  const isPlugin = /flutter:\s*\n(?:[ \t]+.*\n)*?[ \t]+plugin:/.test(allText);

  // Project type — drives command selection.
  let projectType: string;
  if (isFlutter) {
    if (isPlugin) projectType = "flutter-plugin";
    else if (hasMain || facts.platforms) projectType = "flutter-app";
    else projectType = "flutter-package";
  } else if (serverFramework) {
    projectType = "dart-server";
  } else if (hasBin || hasExecutables) {
    projectType = "dart-cli";
  } else {
    projectType = "dart-package";
  }
  facts.projectType = projectType;

  // Packages — the multi-module analog. Discover every sub-package (a pubspec.yaml that
  // isn't the root) and key prompts on its leaf name. melos.yaml / a `workspace:` key in
  // the root marks it as an explicit monorepo.
  const isMelos = repo.exists("melos.yaml") || /^workspace:/m.test(rootPubspec ?? "");
  facts.isMelos = isMelos;
  const seen = new Set<string>();
  const packages: string[] = [];
  for (const f of pubspecFiles) {
    if (!f.includes("/")) continue; // skip the root pubspec
    const dir = f.slice(0, f.lastIndexOf("/"));
    if (seen.has(dir)) continue;
    seen.add(dir);
    packages.push(dir.split("/").pop()!);
  }
  if (packages.length > 1) {
    facts.packageCount = packages.length;
    facts.packages = packages.join(",");
  }

  // Commands. Prefer the `fvm` wrapper when the Flutter version is pinned (mirrors the
  // spring plugin preferring `./gradlew` over `gradle`). dart format works for both stacks.
  const flutterCmd = hasFvm ? "fvm flutter" : "flutter";
  const dartCmd = hasFvm ? "fvm dart" : "dart";

  if (projectType === "flutter-app") {
    facts.runCmd = `${flutterCmd} run`;
    const platforms = String(facts.platforms ?? "");
    const target = platforms.includes("android")
      ? "apk"
      : platforms.includes("ios")
        ? "ios"
        : platforms.includes("web")
          ? "web"
          : "apk";
    facts.buildCmd = `${flutterCmd} build ${target}`;
    facts.testCmd = `${flutterCmd} test`;
  } else if (projectType === "dart-server") {
    if (serverFramework === "dart_frog") {
      facts.runCmd = "dart_frog dev";
      facts.buildCmd = "dart_frog build";
    } else {
      const entry = pickBinEntry(repo) ?? "bin/server.dart";
      facts.runCmd = `${dartCmd} run`;
      facts.buildCmd = `${dartCmd} compile exe ${entry}`;
    }
    facts.testCmd = `${dartCmd} test`;
  } else if (projectType === "dart-cli") {
    const entry = pickBinEntry(repo) ?? "bin/main.dart";
    facts.runCmd = `${dartCmd} run`;
    facts.buildCmd = `${dartCmd} compile exe ${entry}`;
    facts.testCmd = `${dartCmd} test`;
  } else {
    // flutter-package / flutter-plugin / dart-package: no run target.
    facts.testCmd = `${isFlutter ? flutterCmd : dartCmd} test`;
  }

  facts.analyzeCmd = isFlutter ? `${flutterCmd} analyze` : `${dartCmd} analyze`;
  facts.formatCmd = `${dartCmd} format .`;
  if (hasCodegen) facts.codegenCmd = `${dartCmd} run build_runner build --delete-conflicting-outputs`;
  if (facts.hasL10n) facts.l10nCmd = `${flutterCmd} gen-l10n`;

  return { confidence: 0.9, facts };
}

// Prefer bin/main.dart, then bin/server.dart, else the first bin entrypoint.
function pickBinEntry(repo: RepoSnapshot): string | undefined {
  const bins = repo.glob(/^bin\/.*\.dart$/);
  return bins.find((b) => b.endsWith("/main.dart") || b === "bin/main.dart")
    ?? bins.find((b) => b.endsWith("/server.dart"))
    ?? bins[0];
}
