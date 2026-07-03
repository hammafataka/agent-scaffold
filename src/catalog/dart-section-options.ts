// Curated prompt options for the Dart / Flutter plugin's CLAUDE.md sections. Mirrors the
// Spring Boot block in section-options.ts: each entry is a ChoiceOption whose `value` is the
// text inserted into CLAUDE.md, with `detected: true` marking what detection pre-checks. The
// prompter always adds an "Add my own…" escape, so these lists cover the common cases only.

import { ChoiceOption } from "../plugins/types";

// Agent behaviour rules. Self-contained so the section stands on its own.
export const FLUTTER_BEHAVIOR: ChoiceOption[] = [
  { value: "Interview first — reach shared understanding before planning or implementing; ask one question at a time" },
  { value: "Terse output — drop filler and hedging; fragments fine; keep technical accuracy 100%" },
  { value: "Explain visually — use diagrams (widget tree / flow / sequence / state), never Mermaid" },
];

// Architecture. Flutter's official guidance is a layered UI → Logic → Data split; the rest
// are common community patterns. Nothing is auto-detected, so none are pre-checked.
export function flutterArchitectureOptions(): ChoiceOption[] {
  return [
    {
      value: "Layered: UI (widgets) → Logic (controllers/view-models) → Data (repositories/services)",
      label: "Layered (UI / Logic / Data)",
    },
    { value: "Feature-first packaging (one folder per feature, not one per layer)" },
    { value: "Clean architecture: presentation / domain / data with use-cases" },
    { value: "MVVM (view ↔ view-model ↔ model)" },
    { value: "Repository pattern between business logic and data sources" },
    { value: "Keep widgets dumb — no business logic or direct I/O in `build()`" },
  ];
}

// State management — Flutter's defining axis. The detected solution(s) are pre-checked and
// carry their idioms; the generic rules apply whatever the choice.
export function stateManagementOptions(detected?: string): ChoiceOption[] {
  const present = (detected ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const has = (k: string) => present.includes(k);
  const options: ChoiceOption[] = [];

  if (has("riverpod")) {
    options.push(
      { value: "Riverpod: prefer `Notifier`/`AsyncNotifier` over legacy `StateNotifier`/`ChangeNotifier`", label: "Riverpod", detected: true },
      { value: "Riverpod: read providers with `ref.watch` in `build`, `ref.read` in callbacks; keep providers small and composable" },
    );
  }
  if (has("bloc")) {
    options.push(
      { value: "Bloc/Cubit: model UI as events → states; keep blocs free of Flutter imports", label: "Bloc / Cubit", detected: true },
      { value: "Bloc: provide via `BlocProvider`, select with `context.select`/`BlocSelector` to avoid needless rebuilds" },
    );
  }
  if (has("provider")) {
    options.push({ value: "Provider: expose `ChangeNotifier`s via `Provider`/`MultiProvider`; consume with `context.watch`/`context.read`", label: "Provider", detected: true });
  }
  if (has("getx")) {
    options.push({ value: "GetX: keep controllers in `GetxController`; use `Obx`/`GetX` for reactive rebuilds", label: "GetX", detected: true });
  }
  if (has("mobx")) {
    options.push({ value: "MobX: `@observable`/`@action`/`@computed` stores; wrap reactive widgets in `Observer`", label: "MobX", detected: true });
  }
  if (has("redux")) {
    options.push({ value: "Redux: single store, pure reducers, dispatch actions; side effects in middleware/epics", label: "Redux", detected: true });
  }
  if (has("stacked")) {
    options.push({ value: "Stacked: view ↔ `ViewModel` via `ViewModelBuilder`; keep logic in view-models", label: "Stacked", detected: true });
  }
  if (has("signals")) {
    options.push({ value: "Signals: fine-grained reactive `signal`/`computed`; read inside `Watch`/`watch`", label: "Signals", detected: true });
  }

  // Stack-agnostic rules — always offered.
  options.push(
    { value: "Lift state only as high as it needs to go; keep ephemeral UI state local (`StatefulWidget`)" },
    { value: "Never mutate state inside `build()`; dispose controllers/subscriptions" },
    { value: "Use immutable state objects (e.g. `freezed`/`copyWith`) for shared state" },
  );
  return options;
}

// Tests: the detected run command is pre-checked, followed by Flutter/Dart testing practices.
export function flutterTestOptions(testCmd?: string, framework?: string): ChoiceOption[] {
  const options: ChoiceOption[] = [];
  if (testCmd) {
    options.push({ value: `Run all tests: \`${testCmd}\``, label: `Run tests: ${testCmd}`, detected: true });
  }
  options.push({ value: "Unit tests for pure logic with `package:test`" });
  if (framework === "flutter") {
    options.push(
      { value: "Widget tests with `testWidgets` + `WidgetTester` (pump, find, expect)" },
      { value: "Golden tests for pixel-stable UI" },
      { value: "Integration tests under `integration_test/` driven by `flutter test`" },
    );
  }
  options.push(
    { value: "Mock collaborators with `mocktail` (or `mockito` + build_runner)" },
    { value: "Cover new code with tests; keep `analyze` clean and the build green before commit" },
  );
  return options;
}

// Code generation — only shown when build_runner/codegen is detected. The detected
// generators are pre-checked. This is the Dart-shaped analog of the DB-migration section.
export function codegenOptions(codegenTools?: string): ChoiceOption[] {
  const present = (codegenTools ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const has = (k: string) => present.includes(k);
  const options: ChoiceOption[] = [
    {
      value: "Regenerate with `dart run build_runner build --delete-conflicting-outputs` after changing annotated sources",
      label: "build_runner workflow",
      detected: true,
    },
    {
      value: "Never hand-edit generated files (`*.g.dart`, `*.freezed.dart`, `*.config.dart`, `*.gr.dart`, `*.mocks.dart`) — change the source and re-run codegen",
      detected: true,
    },
  ];
  if (has("freezed")) options.push({ value: "`freezed` for immutable data classes / unions (`copyWith`, pattern matching)", label: "freezed", detected: true });
  if (has("json_serializable")) options.push({ value: "`json_serializable` for `fromJson`/`toJson`", label: "json_serializable", detected: true });
  if (has("injectable")) options.push({ value: "`injectable` + `get_it` for generated DI wiring", label: "injectable", detected: true });
  if (has("retrofit")) options.push({ value: "`retrofit` for the typed HTTP client", label: "retrofit", detected: true });
  if (has("drift")) options.push({ value: "`drift` for the typed SQLite layer", label: "drift", detected: true });
  if (has("isar")) options.push({ value: "`isar` generated collections", label: "isar", detected: true });
  if (has("auto_route")) options.push({ value: "`auto_route` generated router", label: "auto_route", detected: true });
  if (has("mockito")) options.push({ value: "`mockito` generated mocks (`@GenerateMocks`)", label: "mockito", detected: true });
  options.push({ value: "Commit generated files or .gitignore them consistently — don't mix per release" });
  return options;
}

// Linting & analysis — Dart's static analyzer is first-class (no direct Spring analog).
export function lintOptions(lintPackage?: string): ChoiceOption[] {
  const options: ChoiceOption[] = [];
  if (lintPackage) {
    const label = { very_good_analysis: "Very Good Analysis", flutter_lints: "flutter_lints", lints: "lints" }[lintPackage] ?? lintPackage;
    options.push({ value: `Lint ruleset: \`${lintPackage}\` (configured in \`analysis_options.yaml\`)`, label: `Lints: ${label}`, detected: true });
  }
  options.push(
    { value: "`dart analyze` must be clean — zero warnings/errors before commit" },
    { value: "Format with `dart format .`; don't hand-fight the formatter" },
    { value: "Prefer fixing lints over adding `// ignore:`; justify any suppression inline" },
    { value: "Enable stricter language modes in `analysis_options.yaml` (strict-casts / strict-raw-types)" },
  );
  return options;
}

// Config & environments — flavors are the Flutter analog of Spring profiles.
export function flavorOptions(): ChoiceOption[] {
  return [
    { value: "Build flavors / schemes per environment (dev / staging / prod)" },
    { value: "Compile-time config via `--dart-define` / `--dart-define-from-file`" },
    { value: "Runtime config from `.env` (e.g. `flutter_dotenv`) — never commit real secrets" },
    { value: "Secrets come from the platform/CI, never committed to the repo" },
    { value: "Keep API keys out of source; inject per environment" },
  ];
}

export const DART_CODE_CONVENTIONS: ChoiceOption[] = [
  { value: "Sound null safety — avoid `!` unless provably non-null; prefer `?`/`late` deliberately" },
  { value: "`const` constructors and `const` widgets wherever possible (fewer rebuilds)" },
  { value: "Effective Dart naming: `lowerCamelCase` members, `UpperCamelCase` types, `snake_case` files" },
  { value: "Prefer composition over inheritance; keep widgets small and focused" },
  { value: "Use `final` by default; immutable models" },
  { value: "Document public APIs with `///` doc comments" },
  { value: "No `print` in production code — use a logger" },
];

export const DART_API_CONVENTIONS: ChoiceOption[] = [
  { value: "Typed HTTP client (`dio`/`http`/`retrofit`); no raw URLs scattered in widgets" },
  { value: "Serialize through models (`fromJson`/`toJson`), never raw `Map` in the UI" },
  { value: "Centralize error handling; surface typed failures (e.g. `Result`/`Either`) over throwing across layers" },
  { value: "Repositories own data access; widgets/view-models never call the network directly" },
  { value: "Handle loading / error / empty states explicitly in the UI" },
];

export const DART_DEPENDENCIES: ChoiceOption[] = [
  { value: "Don't add pub dependencies without asking first.", detected: true },
  { value: "Ask before adding non-trivial dependencies." },
  { value: "Open — add dependencies as needed." },
];

export const DART_NEVER_DO: ChoiceOption[] = [
  { value: "Don't hand-edit generated files (`*.g.dart`, `*.freezed.dart`, …)" },
  { value: "Don't commit secrets, API keys, or signing material" },
  { value: "Don't ignore analyzer errors or disable lints to go green" },
  { value: "Don't commit failing or untested code" },
  { value: "Don't leave `print`/debug logging in production code" },
  { value: "Don't do blocking work on the UI isolate — keep `build()` cheap" },
  { value: "Don't check in `build/`, `.dart_tool/`, or platform build output" },
];
