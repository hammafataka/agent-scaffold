import { Facts, PermissionSpec, GuardSpec } from "../types";

// PreToolUse guard: block edits to protected paths (prod config, generated/build output).
// Reads the hook JSON on stdin and exits 2 to block. Tunable — edit the case patterns.
const PROTECTED_PATHS_SCRIPT = `#!/usr/bin/env bash
# PreToolUse guard — block edits to protected paths. Exit 2 blocks the tool call.
set -euo pipefail
input="$(cat)"
if command -v jq >/dev/null 2>&1; then
  path="$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.path // empty')"
else
  path="$(printf '%s' "$input" | grep -oE '"file_path"[[:space:]]*:[[:space:]]*"[^"]+"' | head -n1 | sed -E 's/.*"file_path"[[:space:]]*:[[:space:]]*"([^"]+)".*/\\1/')"
fi
[ -z "$path" ] && exit 0

case "$path" in
  *application-prod*)
    echo "Blocked: $path is prod config — supply it via deploy env, not in-repo." >&2; exit 2 ;;
  */build/*|*/generated/*|*/.gitnexus/*)
    echo "Blocked: $path is generated/build output." >&2; exit 2 ;;
esac
exit 0
`;

// PreToolUse guard: block writing obvious hardcoded secrets into source.
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

export function springSettings(facts: Facts): PermissionSpec[] {
  const buildTool = String(facts.buildTool ?? "");
  const wrapper =
    buildTool === "maven" ? "Bash(./mvnw:*)" : buildTool === "gradle" ? "Bash(./gradlew:*)" : null;
  const allow: string[] = [];
  if (wrapper) allow.push(wrapper);

  const guards: GuardSpec[] = [
    guard("protected-paths", PROTECTED_PATHS_SCRIPT),
    guard("secret-scan", SECRET_SCAN_SCRIPT),
  ];

  return [{ allow, guards }];
}
