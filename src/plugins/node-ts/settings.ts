import { Facts, PermissionSpec, GuardSpec } from "../types";

// PreToolUse guard: block edits to build output, lockfiles, and generated code. The
// lockfile is only ever written by the package manager; generated ORM clients and build
// dirs are regenerated, never hand-edited. Exit 2 blocks the tool call.
const PROTECTED_PATHS_SCRIPT = `#!/usr/bin/env bash
# PreToolUse guard — block edits to build output / lockfiles / generated code. Exit 2 blocks the tool call.
set -euo pipefail
input="$(cat)"
if command -v jq >/dev/null 2>&1; then
  path="$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.path // empty')"
else
  path="$(printf '%s' "$input" | grep -oE '"file_path"[[:space:]]*:[[:space:]]*"[^"]+"' | head -n1 | sed -E 's/.*"file_path"[[:space:]]*:[[:space:]]*"([^"]+)".*/\\1/')"
fi
[ -z "$path" ] && exit 0

case "$path" in
  *package-lock.json|*pnpm-lock.yaml|*yarn.lock|*bun.lockb|*bun.lock)
    echo "Blocked: $path is a lockfile — change package.json and re-run the package manager." >&2; exit 2 ;;
  */node_modules/*|*/dist/*|*/build/*|*/.next/*|*/.nuxt/*|*/.svelte-kit/*|*/coverage/*|*/.turbo/*)
    echo "Blocked: $path is build output / vendored code." >&2; exit 2 ;;
  *.generated.ts|*.generated.js|*/generated/*)
    echo "Blocked: $path is generated — change the source schema/config and regenerate." >&2; exit 2 ;;
esac
exit 0
`;

// PreToolUse guard: block writing obvious hardcoded secrets into source. Reused verbatim
// from the spring-boot plugin — secret shapes are stack-independent.
const SECRET_SCAN_SCRIPT = `#!/usr/bin/env bash
# PreToolUse guard — block hardcoded secrets in new content. Exit 2 blocks the tool call.
set -euo pipefail
input="$(cat)"
if command -v jq >/dev/null 2>&1; then
  content="$(printf '%s' "$input" | jq -r '.tool_input.content // .tool_input.new_string // empty')"
else
  content="$input"
fi
[ -z "$content" ] && exit 0

if printf '%s' "$content" | grep -qiE '(AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(password|secret|token|api[_-]?key)[[:space:]]*[:=][[:space:]]*["'"'"']?[A-Za-z0-9/+_-]{16,})'; then
  echo "Blocked: looks like a hardcoded secret/credential — use environment variables instead." >&2
  exit 2
fi
exit 0
`;

function guard(name: string, content: string): GuardSpec {
  const path = `.claude/hooks/guards/${name}.sh`;
  return {
    event: "PreToolUse",
    matcher: "Edit|Write|MultiEdit",
    path,
    command: `bash "$CLAUDE_PROJECT_DIR/${path}"`,
    content,
  };
}

export function nodeTsSettings(facts: Facts): PermissionSpec[] {
  const pm = String(facts.packageManager ?? "npm");
  const allow: string[] = [];
  // Script-running via the detected package manager, plus npx for one-off tools.
  allow.push(`Bash(${pm} run:*)`);
  if (pm === "npm") allow.push("Bash(npm test:*)", "Bash(npm start)");
  else allow.push(`Bash(${pm} test:*)`);
  allow.push("Bash(npx:*)");
  if (facts.testRunner === "vitest") allow.push("Bash(vitest:*)");
  if (facts.monorepoTool === "turborepo") allow.push("Bash(turbo:*)");
  if (facts.monorepoTool === "nx") allow.push("Bash(nx:*)");

  const guards: GuardSpec[] = [
    guard("protected-paths", PROTECTED_PATHS_SCRIPT),
    guard("secret-scan", SECRET_SCAN_SCRIPT),
  ];

  return [{ allow: Array.from(new Set(allow)), guards }];
}
