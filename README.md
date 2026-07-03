# agent-scaffold

Bootstrap a repo's AI coding-agent config — instructions files, skills/rules, slash commands, agents, permissions, MCP servers, and a development methodology — for **Claude Code, Cursor, GitHub Copilot, Gemini CLI, Windsurf, and every AGENTS.md-reading tool**, by reading the project and asking you only the few things it can't detect.

Setting up a coding agent well is mostly retyping the same instructions file you've written ten times: the build command, the test command, the migration convention, the "never touch prod config" rule — and then doing it *again* in a different format for the next tool. `agent-scaffold` detects what it can from the repo — stack, version, modules, migration style, run/test commands, and which agent tools are already in use — interviews you once for the rest, and writes each selected tool's config in its native layout.

> Formerly published as `@mfataka/claude-scaffold`. The old command name still works.

## Quickstart

Run it inside any repo:

```bash
npx @mfataka/agent-scaffold
```

It detects the stack, shows you what it found, asks which tools to configure (tools with existing config come pre-checked), and asks what to generate. Walk through the prompts — press `←` at any point to go back — and it writes the files. Re-run it any time: it **merges** into existing instruction files (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.github/copilot-instructions.md`) instead of clobbering your edits, and skips rule/command files that already exist.

Non-interactive (CI, scripted setup): `--yes` accepts every detected default and prompts only for genuinely-required fields it can't know. `--dry-run` previews the writes without touching disk.

```bash
npx @mfataka/agent-scaffold --yes --dry-run
```

`--yes` needs a terminal for those required fields; in a non-TTY environment the tool exits with a clear message rather than writing blank sections.

Other flags: `--tools <list>` picks the target tools without the prompt (`claude,cursor,copilot,gemini,agents-md,windsurf`); `--stack <id>` skips detection and forces a stack plugin (`spring-boot`, `dart-flutter`, `node-ts`, `generic`) — useful in polyglot repos; `--help` / `--version` do what you expect.

## Supported tools

One interview, emitted per tool in its native layout:

| Tool | Instructions | Skills / rules | Commands | Agents | Permissions | MCP |
|---|---|---|---|---|---|---|
| **Claude Code** | `CLAUDE.md` | `.claude/skills/` | `.claude/commands/` | `.claude/agents/` | `.claude/settings.json` + guard hooks | `.mcp.json` |
| **AGENTS.md** (Codex, OpenCode, Zed, Jules, Amp…) | `AGENTS.md` | — | — | — | — | — |
| **Cursor** | `.cursor/rules/*.mdc` | `.cursor/rules/*.mdc` | `.cursor/commands/` | — | — | `.cursor/mcp.json` |
| **GitHub Copilot** | `.github/copilot-instructions.md` | `.github/instructions/` | `.github/prompts/` | `.github/chatmodes/` | — | `.vscode/mcp.json` |
| **Gemini CLI** | `GEMINI.md` | — | `.gemini/commands/*.toml` | — | — | `.gemini/settings.json` |
| **Windsurf** | `.windsurf/rules/` | `.windsurf/rules/` | `.windsurf/workflows/` | — | — | — |

Adapters skip what a tool can't express; a pipeline stage only runs when at least one selected tool can use its output. MCP configs use `${ENV_VAR}` placeholders (rewritten to `${env:VAR}` for VS Code) so no credentials ever land in the repo.

## What it generates

Pick any subset — "Everything", or hand-choose each output:

- **Instructions file** — interview-built. Sections come pre-filled with what detection found (project description from the README/manifest, stack summary, modules, build/run commands, migration style); you confirm or correct each. Optional sections left blank are dropped rather than left as empty headings.
- **Skills / rules** — task knowledge wired to your project: `run`, `test`, `verify`, a migration-aware `add-migration`, plus stack pattern guides (JPA patterns, react-patterns, effective-dart, …).
- **Slash commands / prompts / workflows** — `/build`, `/verify`, and stack-specific extras like `/codegen`.
- **Agents / chat modes** — review/build/security subagents for the stack.
- **Permissions & guardrails** (Claude Code) — a permission allow-list for your build wrapper, plus `PreToolUse` guard hooks (`protected-paths`, `secret-scan`) shipped as tunable scripts under `.claude/hooks/guards/`. Merged at the JSON level — existing entries are kept.
- **MCP servers** — curated per stack: docs lookup (Context7) everywhere, browser automation (Playwright) for frontends, plus opt-in Jira/Confluence, GitHub, and Postgres entries. Existing entries are never overwritten.
- **PDD methodology** (Claude Code) — the `walk-and-talk` → `write-prd` → `tdd` → `to-tickets` skills installed under `.claude/skills/pdd/`, tied together by an `## Implementation workflow` section in `CLAUDE.md`.

## Stacks

Detection is plugin-based. Today:

- **Spring Boot** (Maven or Gradle, single- or multi-module) — version, Java toolchain, starters, modules (including nested `settings.gradle` / `pom.xml` declarations), migration tool (Flyway / Liquibase / manual SQL), active profile, and run/build/test commands.
- **Dart / Flutter** (apps, packages, plugins, Dart CLIs, and `dart_frog`/`shelf`/`serverpod` servers — single package or a melos monorepo) — framework and SDK versions, project type, state management (Riverpod / Bloc / Provider / GetX / MobX / …), routing, `build_runner` codegen (freezed / json_serializable / …), lint ruleset, target platforms, melos packages, plus run/build/test/analyze commands and dedicated **State management**, **Code generation**, and **Linting & analysis** sections.
- **Node.js / TypeScript** (frontend apps, servers, CLIs, and libraries — single package or a workspaces/turborepo/nx monorepo) — framework (Next.js / Nuxt / Remix / SvelteKit / Astro / Vite / NestJS / Fastify / Hono / Express / …), package manager (npm / pnpm / yarn / bun, from the lockfile or `packageManager` field), TypeScript vs JS, test runner (vitest / jest / …) and E2E tooling, linter/formatter (eslint / biome / prettier), ORM and migration command (Prisma / Drizzle / TypeORM / …), workspace packages, plus dev/build/test/lint/typecheck commands from your scripts and dedicated **Database & migrations** and **Linting & formatting** sections.
- **Generic** — the fallback for everything else: the same interview flow, you fill the details in (with the README's first paragraph pre-filling the overview).

Detection ignores embedded sample projects (`fixtures/`, `testdata/`, `vendor/`, …) so a repo carrying test fixtures for another stack still detects as itself.

Adding a stack is a new plugin under `src/plugins/`; adding a tool is a new adapter under `src/tools/` — see [CONTRIBUTING](./CONTRIBUTING.md).

## Install

`npx @mfataka/agent-scaffold` needs no install. To keep it on your PATH:

```bash
npm install -g @mfataka/agent-scaffold
agent-scaffold           # the installed command is unscoped (claude-scaffold still works too)
```

### Local install (development or a private fork)

To hack on it, or keep your own edits to the catalog and have them take effect immediately:

```bash
git clone git@github.com:hammafataka/claude-scaffold.git
cd claude-scaffold
npm install
npm run build
npm link          # puts `agent-scaffold` on your PATH, pointing at this checkout
```

Iterate with `npm run dev` (runs the CLI from source via `tsx`) and `npm test`. Authored content lives under `src/catalog/` as plain markdown and is bundled by `scripts/build-content.mjs` — edit the markdown, re-run `npm run build`.

## Releasing

Maintainers: publish from the GitHub **Actions → Publish → Run workflow** button — pick `patch`/`minor`/`major` and it bumps, tags, and publishes to npm. PRs and pushes run typecheck/test/build via CI. See [PUBLISHING.md](./PUBLISHING.md).

## License

[MIT](./LICENSE).
