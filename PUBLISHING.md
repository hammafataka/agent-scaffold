# Publishing

`claude-scaffold` publishes to npm as a CLI package, so anyone can run it with `npx @mfataka/claude-scaffold` — no clone, no global install. Publishing is **automated**: running the **Publish** workflow from the Actions tab builds, tests, bumps the version, and publishes.

## One-time setup

1. **Name.** The unscoped `claude-scaffold` is already taken on npm by an unrelated package, so this publishes under your scope as **`@mfataka/claude-scaffold`** (set in `package.json`). The workflow publishes with `--access public`, which scoped packages require to be public. (The installed CLI command stays the unscoped `claude-scaffold` — that's the `bin` name, independent of the package name.)

2. **Create an npm automation token.** On npmjs.com → *Access Tokens* → *Generate New Token* → **Automation** (bypasses 2FA in CI). Copy it.

3. **Add it as a repo secret.** GitHub repo → *Settings* → *Secrets and variables* → *Actions* → *New repository secret*, named **`NPM_TOKEN`**.

That's it. No `npm login` on your machine, ever.

## Releasing

Releases are triggered from the GitHub UI — no local `npm version` or tag-pushing needed.

1. GitHub repo → **Actions** → **Publish** → **Run workflow**.
2. Pick the **Version bump** — `patch` (bug fixes), `minor` (new stacks / features), or `major` (breaking changes).
3. Run it.

[`.github/workflows/publish.yml`](.github/workflows/publish.yml) then:

1. runs `npm ci`, `npm run typecheck`, `npm test`, `npm run build`,
2. bumps `package.json` with `npm version <bump>`, commits, and tags `v<version>`,
3. pushes the commit + tag back to the repo,
4. publishes with `npm publish --provenance --access public`.

[Provenance](https://docs.npmjs.com/generating-provenance-statements) is signed via GitHub's OIDC (`id-token: write` in the workflow) and shows up as a verified badge on the npm page — proof the tarball was built from this repo, untampered.

> **Branch protection:** the workflow pushes the version commit to the branch you ran it from (default `main`). If that branch requires PRs or status checks for pushes, either allow GitHub Actions to bypass it, or run Publish from an unprotected release branch. The build/test steps run *before* the bump, so a red build never publishes.

## What ships

`package.json` whitelists `files: ["dist"]`, so the tarball contains only the bundled CLI (`dist/cli.js`) and `package.json`/`README`/`LICENSE` — not `src/`, tests, or fixtures. The authored markdown under `src/catalog/` is bundled into `dist` at build time, so it travels inside the binary. `@clack/*` stay external and are pulled from the user's `node_modules` via the declared `dependencies`.

Preview the exact contents any time:

```bash
npm pack --dry-run
```

## Verifying a release

```bash
npx @mfataka/claude-scaffold@latest --dry-run
```

Run it inside a sample repo and confirm detection + the planned writes look right.

## CI

Separately, [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push to `main` and every PR:

- **test** — `npm ci` + `npm run typecheck` + `npm test` across Node 18 and 20.
- **build** — `npm run build` + `npm pack --dry-run` to confirm the publishable tarball assembles.

So problems surface on the PR, before you ever cut a release.

## Manual fallback

If you ever need to publish by hand (token issues, an emergency patch):

```bash
npm login
npm publish        # prepublishOnly runs `npm run build && npm test` first
```

`prepublishOnly` guarantees a hand-publish can't ship a stale or broken `dist`.
