// Central catalog of curated prompt options ("defaults") for every section that offers
// a checklist or menu. Plugins reference these instead of hardcoding option lists inline,
// so all the wording lives in one organized place and is easy to tune or reuse.
//
// Each entry is a ChoiceOption: `value` is the text inserted into CLAUDE.md; `detected: true`
// marks an option that detection pre-checks. The prompter always adds an "Add my own…"
// escape, so these lists only need the common cases — not every possibility.

import { ChoiceOption } from "../plugins/types";

// ── Shared across stacks ─────────────────────────────────────────────────────

export const COMMON_CODE_CONVENTIONS: ChoiceOption[] = [
  { value: "Consistent formatting via the project's formatter" },
  { value: "Meaningful, intention-revealing names" },
  { value: "Small, focused functions" },
  { value: "Document public APIs" },
  { value: "Handle errors explicitly" },
];

export const COMMON_NEVER_DO: ChoiceOption[] = [
  { value: "Don't commit secrets or credentials" },
  { value: "Don't commit failing or untested code" },
  { value: "Don't edit generated or vendored code" },
  { value: "Don't disable tests to make the build pass" },
];

// ── Spring Boot ──────────────────────────────────────────────────────────────

// Agent behaviour rules. Self-contained (no skill-path references) so the section
// stands on its own whether or not the PDD methodology is installed.
export const SPRING_BEHAVIOR: ChoiceOption[] = [
  { value: "Interview first — reach shared understanding before planning or implementing; ask one question at a time" },
  { value: "Terse output — drop filler and hedging; fragments fine; keep technical accuracy 100%" },
  { value: "Explain visually — use diagrams (flow / sequence / module / state), never Mermaid" },
];

// Tests: the detected run command is pre-checked, followed by Spring Boot testing best practices.
export function springTestOptions(testCmd?: string): ChoiceOption[] {
  const options: ChoiceOption[] = [];
  if (testCmd) {
    options.push({ value: `Run all tests: \`${testCmd}\``, label: `Run tests: ${testCmd}`, detected: true });
  }
  options.push(
    { value: "Unit tests with JUnit 5 + Mockito" },
    { value: "Web-layer slice tests (`@WebMvcTest` + MockMvc)" },
    { value: "Persistence slice tests (`@DataJpaTest`)" },
    { value: "Full integration tests (`@SpringBootTest`)" },
    { value: "Testcontainers for a real DB/broker in integration tests" },
    { value: "AssertJ for fluent assertions" },
    { value: "Cover new code with tests; keep the build green before commit" },
  );
  return options;
}

// DB migration: single-select — exactly one tool per project. Detected one is pre-selected.
// Manual-sql label and value show the actual file-naming pattern using detected prefix + dir.
export function springMigrationOptions(migrationTool?: string, sqlDir?: string, sqlPrefix?: string): ChoiceOption[] {
  const dir = sqlDir ?? "docs/sql";
  const pfx = sqlPrefix ?? "<prefix>";
  const isManual = migrationTool === "manual-sql";
  // When the manual-SQL paths are actually detected, show the concrete naming scheme.
  // Otherwise (e.g. a manual override with nothing detected) use neutral wording rather
  // than leaking literal `<prefix>`/`<VERSION>` placeholders into the generated doc.
  const manualLabel = isManual
    ? `Manual SQL diff-file — \`${pfx}-<VERSION>.sql\` + \`${pfx}<VERSION>-to-<NEW>.diff.sql\``
    : "Manual SQL diff-file migrations (full snapshot + incremental diff per release)";
  const manualValue = isManual
    ? `Manual SQL diff-file migrations under \`${dir}\` — \`${pfx}-<VERSION>.sql\` (full snapshot) + \`${pfx}<VERSION>-to-<NEW>.diff.sql\` (incremental diff)`
    : "Manual SQL diff-file migrations — a full snapshot per release plus an incremental diff from the previous version";
  return [
    {
      value: "Flyway — migrations under `src/main/resources/db/migration/`",
      label: "Flyway",
      detected: migrationTool === "flyway",
    },
    {
      value: "Liquibase changelogs",
      label: "Liquibase",
      detected: migrationTool === "liquibase",
    },
    {
      value: manualValue,
      label: manualLabel,
      detected: isManual,
    },
    {
      value: "No migration tool",
      label: "None",
      detected: !migrationTool || migrationTool === "none",
    },
  ];
}

// Persistence: JPA usage rules only — migration tool is its own section now.
export function springPersistenceOptions(): ChoiceOption[] {
  return [
    { value: "JPA / Hibernate", detected: true },
    { value: "Never edit an applied migration — add a new one" },
    { value: "Use `@Transactional` at the service layer" },
    { value: "Avoid N+1 queries (fetch joins / entity graphs)" },
  ];
}

// Architecture is partly detectable: a layered controller/service/repository structure is
// pre-checked when detection found those packages.
export function springArchitectureOptions(layering?: string): ChoiceOption[] {
  return [
    {
      value: "Layered: controller → service → repository",
      label: "Layered (controller / service / repository)",
      detected: layering === "layered",
    },
    { value: "Package-by-feature (one package per domain area)" },
    { value: "Hexagonal / ports & adapters" },
    { value: "DTOs kept separate from JPA entities" },
    { value: "Mapping layer (e.g. MapStruct) between DTOs and entities" },
  ];
}

export const SPRING_CODE_CONVENTIONS: ChoiceOption[] = [
  { value: "Constructor injection (no field injection)" },
  { value: "Use Lombok" },
  { value: "Prefer `Optional` over returning null" },
  { value: "Log via SLF4J; never log secrets/PII" },
  { value: "Keep controllers thin; logic in services" },
  { value: "Format with the project's configured formatter" },
  { value: "Apply the clean-code skill (`.claude/skills/clean-code/SKILL.md`)" },
];

export const SPRING_API_CONVENTIONS: ChoiceOption[] = [
  { value: "RESTful resource naming (plural nouns, no verbs in paths)" },
  { value: "Controllers accept/return DTOs, never JPA entities" },
  { value: "Validate request bodies with Bean Validation (`@Valid`)" },
  { value: "Centralized error handling via `@ControllerAdvice`" },
  { value: "Consistent error response body (code, message, details)" },
  { value: "Paginate list endpoints" },
];

export const SPRING_GIT_WORKFLOW: ChoiceOption[] = [
  { value: "Feature branches named `feature/<ticket>`" },
  { value: "Branch names are the bare ticket ID, no prefix (e.g. `PROJ-123`)" },
  { value: "Branch from and target PRs at the integration branch (e.g. `dev`), not `main`" },
  { value: "Conventional Commits" },
  { value: "Run tests before every commit" },
  { value: "PR/MR review required before merge" },
  { value: "Include a co-author signature on commits to distinguish agent from human work" },
  { value: "Squash-merge to main" },
  { value: "Rebase onto main; don't merge main in" },
];

export const SPRING_DEPENDENCIES: ChoiceOption[] = [
  { value: "Don't add dependencies without asking first.", detected: true },
  { value: "Ask before adding non-trivial dependencies." },
  { value: "Open — add dependencies as needed." },
];

export const SPRING_NEVER_DO: ChoiceOption[] = [
  { value: "Don't log secrets or PII" },
  { value: "Don't weaken `SecurityConfig`" },
  { value: "Don't edit generated code" },
  { value: "Don't commit failing or untested code" },
  { value: "Don't disable tests to make the build pass" },
  { value: "Don't hardcode credentials or secrets" },
  { value: "Don't expose stack traces to clients" },
];

// Config options depend on the detected active profile, so this is a small builder
// rather than a static list. The detected profile (when present) is pre-checked.
export function springConfigOptions(profile?: string): ChoiceOption[] {
  const options: ChoiceOption[] = [
    { value: "Secrets come from environment variables, never committed" },
    { value: "Profiles: dev / test / prod" },
    { value: "Never edit `application-prod.yml` without sign-off" },
    { value: "Prod config supplied via env/external at deploy (no `application-prod` file in the repo)" },
    { value: "CI flags changed config/migration files (`.yaml` / `.sql`) — surface such changes to the user" },
  ];
  if (profile) {
    options.unshift({
      value: `Active profile: \`${profile}\``,
      label: `Active profile: ${profile}`,
      detected: true,
    });
  }
  return options;
}
