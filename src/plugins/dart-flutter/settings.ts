import { Facts, PermissionSpec, GuardSpec } from "../types";

// PreToolUse guard: block edits to generated/build output. Dart/Flutter generate a lot of
// committed-or-not code (*.g.dart, *.freezed.dart, …) that must never be hand-edited — the
// source annotation changes and build_runner regenerates. Exit 2 blocks the tool call.
const PROTECTED_PATHS_SCRIPT = `#!/usr/bin/env bash
# PreToolUse guard — block edits to generated/build output. Exit 2 blocks the tool call.
set -euo pipefail
input="$(cat)"
if command -v jq >/dev/null 2>&1; then
  path="$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.path // empty')"
else
  path="$(printf '%s' "$input" | grep -oE '"file_path"[[:space:]]*:[[:space:]]*"[^"]+"' | head -n1 | sed -E 's/.*"file_path"[[:space:]]*:[[:space:]]*"([^"]+)".*/\\1/')"
fi
[ -z "$path" ] && exit 0

case "$path" in
  *.g.dart|*.freezed.dart|*.config.dart|*.gr.dart|*.mocks.dart|*.chopper.dart)
    echo "Blocked: $path is generated — edit the source and re-run build_runner." >&2; exit 2 ;;
  */build/*|*/.dart_tool/*|*/ios/Pods/*|*/android/.gradle/*|*/.fvm/*)
    echo "Blocked: $path is generated/build output." >&2; exit 2 ;;
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

export function dartFlutterSettings(facts: Facts): PermissionSpec[] {
  const framework = String(facts.framework ?? "");
  const allow: string[] = [];
  // The toolchain CLIs. fvm-prefixed commands (e.g. `fvm flutter run`) are covered by the
  // `fvm:*` allow entry, so add it whenever a Flutter version is pinned.
  if (framework === "flutter") allow.push("Bash(flutter:*)");
  allow.push("Bash(dart:*)");
  if (facts.flutterSdk && (String(facts.runCmd ?? "").startsWith("fvm ") || String(facts.testCmd ?? "").startsWith("fvm "))) {
    allow.push("Bash(fvm:*)");
  }
  if (facts.isMelos) allow.push("Bash(melos:*)");
  if (facts.serverFramework === "dart_frog") allow.push("Bash(dart_frog:*)");

  const guards: GuardSpec[] = [
    guard("protected-paths", PROTECTED_PATHS_SCRIPT),
    guard("secret-scan", SECRET_SCAN_SCRIPT),
  ];

  return [{ allow, guards }];
}
