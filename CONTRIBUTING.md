# Contributing

Thanks for helping improve `claude-scaffold`. This is a small, plugin-based TypeScript CLI — most contributions are either a **new stack plugin**, a tweak to the **authored content** (the wording that lands in generated files), or a fix to the **core pipeline**.

## Getting set up

```bash
npm install
npm run dev        # run the CLI from source (tsx) inside the current repo
npm test           # vitest
npm run typecheck  # tsc --noEmit
npm run build      # bundle content + tsup → dist/cli.js
```

Node 18+ is required.

## How it fits together

```
src/
  cli.ts                 entry: detect → choose outputs → run pipeline → write
  core/
    repo-scanner.ts      read-only snapshot of the target repo
    pipeline.ts          orchestrates stages (CLAUDE.md, skills, commands, agents, settings, PDD)
    prompter.ts          @clack prompts + ← back-navigation
    field-resolver.ts    detected-value vs. ask logic (honours --yes)
    md-document.ts        / md-merger.ts   parse & merge into an existing CLAUDE.md
    writer.ts            apply planned writes (create / update / skip)
  plugins/
    types.ts             StackPlugin + all the spec interfaces
    registry.ts          the list of real plugins + the detection threshold
    spring-boot/         detect.ts, sections.ts, settings.ts, index.ts
    generic/             the fallback plugin
  catalog/               ALL curated wording lives here (see below)
  generators/            turn specs into PlannedWrites (skills, commands, agents, settings)
scripts/build-content.mjs  bundles authored markdown → *-content.json
test/                    vitest specs + fixtures/ (sample repos)
```

The golden rule: **engine code carries no project wording, and catalog content carries no logic.** If you're tuning what a generated file *says*, you almost certainly want `src/catalog/`, not a plugin.

## Editing authored content

Curated prose lives as plain markdown and structured option lists under `src/catalog/`:

- `section-options.ts` — checklist/menu options for each `CLAUDE.md` section (`SPRING_GIT_WORKFLOW`, `springConfigOptions`, `SPRING_BEHAVIOR`, …).
- `java/skills/<name>/SKILL.md` (+ `references/`) and `java/agents/<name>.md` — the Spring Boot skills and agents, authored as markdown.
- `pdd/skills/<name>/SKILL.md` — the PDD methodology skills.
- `pdd-workflow.ts` — the ordered `## Implementation workflow` section that references the PDD skills.

The markdown under `java/` and `pdd/` is **bundled into JSON at build time** by `scripts/build-content.mjs`. After editing any of it, run `npm run gen:content` (or `npm run build`) so `java-content.json` / `pdd-content.json` are regenerated — otherwise your changes won't show up. This is the most common gotcha.

## Adding a stack plugin

1. Implement the `StackPlugin` interface (`src/plugins/types.ts`) under `src/plugins/<stack>/`:
   - `detect(repo)` → `{ confidence, facts }`. Confidence ≥ `THRESHOLD` (0.5) wins; otherwise the generic fallback handles the repo.
   - `sections(facts)` → the `CLAUDE.md` sections (use the helpers and pull option lists from `catalog/section-options.ts`).
   - `skills` / `commands` / `agents` / `settings` builders, and optional `fields` / `mapConfirmedFacts` for values the user confirms mid-run.
2. Register it in `src/plugins/registry.ts` (`PLUGINS`).
3. Add a fixture repo under `test/fixtures/<name>/` and a `test/<stack>-detect.test.ts`.

No engine changes are needed — the pipeline is plugin-agnostic.

## Tests

- `vitest`, one spec per area under `test/`. Detection tests run against sample repos in `test/fixtures/`.
- Cover new behavior, and keep the suite green: `npm test` must pass, and `npm run typecheck` must be clean, before you open a PR.
- Prefer testing through the public surface (a plugin's `detect`/`sections`, the pipeline's `buildPlan`) rather than internals.

## Pull requests

- Keep diffs focused; match the surrounding style (the code is heavily commented with *why*, not *what* — follow suit).
- Run `npm run build && npm test` before pushing.
- Describe the user-visible change and how you verified it.

By contributing you agree your work is licensed under the project's [MIT License](./LICENSE).
