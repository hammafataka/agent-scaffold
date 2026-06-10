import { PermissionSpec, GuardSpec, PlannedWrite, WriteAction } from "../plugins/types";

const PATH = ".claude/settings.json";

interface HookCommand {
  type: "command";
  command: string;
}
interface HookMatcher {
  matcher: string;
  hooks: HookCommand[];
}
interface SettingsJson {
  permissions?: { allow?: string[] };
  hooks?: Record<string, HookMatcher[]>;
}

// Merge a guard's hook into the settings `hooks` map without duplicating an existing
// matcher entry or command.
function mergeGuardHook(json: SettingsJson, guard: GuardSpec): void {
  json.hooks ??= {};
  const list = (json.hooks[guard.event] ??= []);
  let entry = list.find((e) => e.matcher === guard.matcher);
  if (!entry) {
    entry = { matcher: guard.matcher, hooks: [] };
    list.push(entry);
  }
  if (!entry.hooks.some((h) => h.command === guard.command)) {
    entry.hooks.push({ type: "command", command: guard.command });
  }
}

// Build (or update) .claude/settings.json: merge the permission allow-list and wire any
// guard hooks. Returns null when there's nothing to add. Guard *scripts* are emitted
// separately by planGuardScriptWrites.
export function planSettingsWrite(
  specs: PermissionSpec[],
  existingRaw: string | null,
): PlannedWrite | null {
  const toAdd = specs.flatMap((s) => s.allow);
  const guards = specs.flatMap((s) => s.guards ?? []);
  if (toAdd.length === 0 && guards.length === 0) return null;

  let json: SettingsJson = {};
  if (existingRaw) {
    try {
      json = JSON.parse(existingRaw);
    } catch {
      json = {};
    }
  }

  if (toAdd.length > 0) {
    json.permissions ??= {};
    const current = json.permissions.allow ?? [];
    json.permissions.allow = Array.from(new Set([...current, ...toAdd]));
  }
  for (const guard of guards) mergeGuardHook(json, guard);

  return {
    path: PATH,
    content: JSON.stringify(json, null, 2) + "\n",
    action: existingRaw ? WriteAction.Update : WriteAction.Create,
  };
}

// Emit each guard's script file. Skips a script that already exists so a hand-tuned
// guard is never overwritten. De-dupes by path across specs.
export function planGuardScriptWrites(
  specs: PermissionSpec[],
  exists: (path: string) => boolean,
): PlannedWrite[] {
  const seen = new Set<string>();
  const writes: PlannedWrite[] = [];
  for (const guard of specs.flatMap((s) => s.guards ?? [])) {
    if (seen.has(guard.path)) continue;
    seen.add(guard.path);
    const already = exists(guard.path);
    writes.push({
      path: guard.path,
      content: guard.content,
      action: already ? WriteAction.Skip : WriteAction.Create,
      note: already ? "exists" : undefined,
    });
  }
  return writes;
}
