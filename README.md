# claude-scaffold

Bootstrap a repo's Claude Code config — `CLAUDE.md`, skills, slash commands, agents, permissions, and a development methodology — by reading the project and asking you only the few things it can't detect.

Setting up Claude Code well is mostly retyping the same `CLAUDE.md` you've written ten times: the build command, the test command, the migration convention, the "never touch prod config" rule. `claude-scaffold` detects what it can from the repo — stack, version, modules, migration style, run/test commands — and interviews you for the rest, one question at a time, with the detected answer pre-filled. You end with config that reflects *your* project, not a generic template.

## Quickstart

Run it inside any repo:

```bash
npx @mfataka/claude-scaffold
```

It detects the stack, shows you what it found, and asks what to generate. Walk through the prompts — press `←` at any point to go back — and it writes the files. Re-run it any time: it **merges** into an existing `CLAUDE.md` instead of clobbering your edits, and skips skill/command files that already exist.

Non-interactive (CI, scripted setup): `--yes` accepts every detected default and prompts only for genuinely-required fields it can't know (Overview, Architecture, Never do). `--dry-run` previews the writes without touching disk.

```bash
npx @mfataka/claude-scaffold --yes --dry-run
```

`--yes` needs a terminal for those required fields; in a non-TTY environment the tool exits with a clear message rather than writing blank sections.

## What it generates

Pick any subset — "Everything", or hand-choose each output:

- **`CLAUDE.md`** — an interview-built instructions file. Sections come pre-filled with what detection found (stack summary, modules, build/run commands, migration style, active profile); you confirm or correct each. Optional sections left blank (Behavior, High-blast-radius areas, Gotchas) are dropped rather than left as empty headings.
- **`.claude/skills/`** — task skills wired to your project: `run`, `test`, and a migration-aware `add-migration` that knows your tool and naming scheme.
- **`.claude/commands/`** — slash commands (`/build`, `/verify`).
- **`.claude/agents/`** — review/build subagents for the stack.
- **`.claude/settings.json`** — a permission allow-list for your build wrapper, plus `PreToolUse` **guardrail hooks** (`protected-paths`, `secret-scan`) shipped as tunable scripts under `.claude/hooks/guards/`. Merged at the JSON level — existing entries are kept.
- **PDD methodology** — the `walk-and-talk` → `write-prd` → `tdd` → `to-tickets` skills installed under `.claude/skills/pdd/`, tied together by an `## Implementation workflow` section written into `CLAUDE.md` as one ordered pipeline.

## Stacks

Detection is plugin-based. Today:

- **Spring Boot** (Maven or Gradle, single- or multi-module) — version, Java toolchain, starters, modules (including nested `settings.gradle` / `pom.xml` declarations), migration tool (Flyway / Liquibase / manual SQL), active profile, and run/build/test commands.
- **Generic** — the fallback for everything else: the same interview flow, you fill the details in.

Adding a stack is a new plugin under `src/plugins/` — see [CONTRIBUTING](./CONTRIBUTING.md).

## Install

`npx @mfataka/claude-scaffold` needs no install. To keep it on your PATH:

```bash
npm install -g @mfataka/claude-scaffold
claude-scaffold          # the installed command is unscoped
```

### Local install (development or a private fork)

To hack on it, or keep your own edits to the catalog and have them take effect immediately:

```bash
git clone git@github.com:hammafataka/claude-scaffold.git
cd claude-scaffold
npm install
npm run build
npm link          # puts `claude-scaffold` on your PATH, pointing at this checkout
```

Iterate with `npm run dev` (runs the CLI from source via `tsx`) and `npm test`. Authored content lives under `src/catalog/` as plain markdown and is bundled by `scripts/build-content.mjs` — edit the markdown, re-run `npm run build`.

## Releasing

Maintainers: publish from the GitHub **Actions → Publish → Run workflow** button — pick `patch`/`minor`/`major` and it bumps, tags, and publishes to npm. PRs and pushes run typecheck/test/build via CI. See [PUBLISHING.md](./PUBLISHING.md).

## License

[MIT](./LICENSE).
