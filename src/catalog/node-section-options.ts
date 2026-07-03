// Curated prompt options for the Node.js / TypeScript plugin's checklist sections.
// Same shape and conventions as section-options.ts (Spring) and dart-section-options.ts.

import { ChoiceOption } from "../plugins/types";

export const NODE_BEHAVIOR: ChoiceOption[] = [
  { value: "Interview first — reach shared understanding before planning or implementing; ask one question at a time" },
  { value: "Terse output — drop filler and hedging; fragments fine; keep technical accuracy 100%" },
  { value: "Explain visually — use diagrams (flow / sequence / module / state), never Mermaid" },
];

// Architecture — frontend and backend options in one list; detection pre-checks nothing
// (structure is too varied to infer reliably), the user picks what applies.
export function nodeArchitectureOptions(isFrontend: boolean, isServer: boolean): ChoiceOption[] {
  const options: ChoiceOption[] = [];
  if (isFrontend) {
    options.push(
      { value: "Feature folders — co-locate a feature's components, hooks, and API calls" },
      { value: "Components are presentational; data fetching and state live in hooks/loaders" },
      { value: "Shared UI primitives in a dedicated `components/ui` (or design-system) layer" },
      { value: "Route-based code splitting (lazy-load heavy routes)" },
    );
  }
  if (isServer) {
    options.push(
      { value: "Layered: routes/controllers → services → data access" },
      { value: "Validation at the boundary (zod or class-validator) — internals trust typed data" },
      { value: "Dependency injection / explicit wiring over module-level singletons" },
    );
  }
  options.push(
    { value: "Strict module boundaries — no deep imports across packages/features" },
    { value: "Types shared through a dedicated types module/package, not duplicated" },
  );
  return options;
}

// Tests: detected commands pre-checked, followed by ecosystem best practices.
export function nodeTestOptions(testCmd?: string, testRunner?: string, e2eRunner?: string): ChoiceOption[] {
  const options: ChoiceOption[] = [];
  if (testCmd) {
    options.push({ value: `Run all tests: \`${testCmd}\``, label: `Run tests: ${testCmd}`, detected: true });
  }
  if (testRunner) {
    options.push({ value: `Unit tests with ${testRunner}`, detected: true });
  }
  if (e2eRunner) {
    options.push({ value: `E2E tests with ${e2eRunner}`, detected: true });
  }
  options.push(
    { value: "Test behavior through the public API, not implementation details" },
    { value: "Mock at module boundaries (network, DB), not internal functions" },
    { value: "Cover new code with tests; keep the suite green before commit" },
  );
  return options;
}

// Linting & formatting: detected tools pre-checked.
export function nodeLintOptions(linter?: string, formatter?: string, lintCmd?: string, typecheckCmd?: string): ChoiceOption[] {
  const options: ChoiceOption[] = [];
  if (lintCmd) options.push({ value: `Lint: \`${lintCmd}\``, label: `Lint: ${lintCmd}`, detected: true });
  else if (linter) options.push({ value: `Lint with ${linter}`, detected: true });
  if (typecheckCmd) options.push({ value: `Typecheck: \`${typecheckCmd}\` must pass`, label: `Typecheck: ${typecheckCmd}`, detected: true });
  if (formatter) options.push({ value: `Format with ${formatter} — never hand-format`, label: `Format with ${formatter}`, detected: true });
  options.push(
    { value: "No `any` — use `unknown` + narrowing when the type is genuinely open" },
    { value: "Fix lint errors properly; never inline-disable rules without a comment saying why" },
  );
  return options;
}

// Database & migrations — shown only when an ORM was detected.
export function nodeDbOptions(orm?: string, migrateCmd?: string): ChoiceOption[] {
  const options: ChoiceOption[] = [];
  if (orm) options.push({ value: `ORM: ${orm}`, detected: true });
  if (migrateCmd) {
    options.push({ value: `Create a migration: \`${migrateCmd}\``, label: `Migrate: ${migrateCmd}`, detected: true });
  }
  options.push(
    { value: "Never edit an applied migration — add a new one" },
    { value: "Schema changes go through migrations, never manual DDL" },
    { value: "Regenerate the ORM client/types after schema changes" },
  );
  return options;
}

export function nodeConfigOptions(): ChoiceOption[] {
  return [
    { value: "Secrets come from environment variables, never committed" },
    { value: "`.env` files are git-ignored; `.env.example` documents the required keys" },
    { value: "Validate env vars at startup (fail fast on missing config)" },
    { value: "Client-exposed env vars only via the framework's public prefix (`NEXT_PUBLIC_` / `VITE_`)" },
  ];
}

export const NODE_API_CONVENTIONS: ChoiceOption[] = [
  { value: "RESTful resource naming (plural nouns, no verbs in paths)" },
  { value: "Validate request bodies at the boundary (zod / class-validator)" },
  { value: "Consistent error response body (code, message, details)" },
  { value: "Centralized error handling middleware — no scattered try/catch responses" },
  { value: "Paginate list endpoints" },
  { value: "API types shared with the client (generated or from a shared package)" },
];

export const NODE_CODE_CONVENTIONS: ChoiceOption[] = [
  { value: "Strict TypeScript (`strict: true`); no `any`, no non-null `!` without proof" },
  { value: "`async/await` over raw promise chains; no floating promises" },
  { value: "Named exports over default exports" },
  { value: "Prefer small pure functions; isolate side effects" },
  { value: "Immutable updates (spread/`toSorted`), no in-place mutation of shared state" },
];

export const NODE_DEPENDENCIES: ChoiceOption[] = [
  { value: "Don't add dependencies without asking first.", detected: true },
  { value: "Ask before adding non-trivial dependencies." },
  { value: "Open — add dependencies as needed." },
];

export function nodeNeverDo(packageManager: string): ChoiceOption[] {
  return [
    { value: "Don't commit secrets, credentials, or `.env` files" },
    { value: `Don't edit the lockfile by hand — only via ${packageManager}` },
    { value: "Don't edit generated code (ORM clients, API types, build output)" },
    { value: "Don't use `any` to silence type errors" },
    { value: "Don't disable tests or lint rules to make the build pass" },
    { value: "Don't commit failing or untested code" },
  ];
}
