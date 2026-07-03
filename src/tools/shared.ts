import { McpServerSpec, PlannedWrite, RepoSnapshot, WriteAction } from "../plugins/types";
import { Section, parseDocument, serializeDocument } from "../core/md-document";
import { mergeSections, MergeStatus } from "../core/md-merger";

// Skip-if-exists write, shared by every adapter (mirrors the generators' behavior:
// a hand-tuned file is never clobbered).
export function writeOnce(path: string, content: string, repo: RepoSnapshot): PlannedWrite {
  const already = repo.exists(path);
  return {
    path,
    content,
    action: already ? WriteAction.Skip : WriteAction.Create,
    note: already ? "exists" : undefined,
  };
}

// Simple YAML frontmatter block. Values are emitted verbatim — keep them single-line.
export function frontmatter(fields: Record<string, string>): string {
  const lines = Object.entries(fields).map(([k, v]) => `${k}: ${v}`);
  return `---\n${lines.join("\n")}\n---`;
}

// Build (or merge into) a markdown instructions file at `path`. Create drops sections
// left blank; update merges section-by-section, keeping the user's existing content
// (same semantics as the original CLAUDE.md flow — now shared by every tool that keeps
// its instructions as one markdown file).
export function planInstructionsWrite(
  path: string,
  title: string,
  sections: Section[],
  repo: RepoSnapshot,
): PlannedWrite {
  const existingRaw = repo.exists(path) ? repo.readFile(path) : null;
  if (existingRaw) {
    const { doc, report } = mergeSections(parseDocument(existingRaw), sections);
    const counts = { [MergeStatus.Filled]: 0, [MergeStatus.Kept]: 0, [MergeStatus.Added]: 0 };
    for (const e of report) counts[e.status]++;
    const parts = [MergeStatus.Filled, MergeStatus.Kept, MergeStatus.Added]
      .filter((s) => counts[s] > 0)
      .map((s) => `${counts[s]} ${s}`);
    return {
      path,
      content: serializeDocument(doc),
      action: WriteAction.Update,
      note: parts.length ? parts.join(", ") : undefined,
    };
  }
  const nonEmpty = sections.filter((s) => s.body.trim() !== "");
  return {
    path,
    content: serializeDocument({ title, preamble: "", sections: nonEmpty }),
    action: WriteAction.Create,
  };
}

// Merge MCP servers into a JSON file at `path` under `rootKey` ("mcpServers" for
// Claude/Cursor/Gemini, "servers" for VS Code). Existing entries always win. `transform`
// lets an adapter rewrite env placeholders (e.g. ${VAR} → ${env:VAR} for VS Code).
export function planMcpJsonWrite(opts: {
  path: string;
  rootKey: string;
  specs: McpServerSpec[];
  repo: RepoSnapshot;
  transform?: (config: McpServerSpec["config"]) => Record<string, unknown>;
}): PlannedWrite | null {
  const toAdd = opts.specs.filter((s) => s.condition !== false);
  if (toAdd.length === 0) return null;

  const existingRaw = opts.repo.exists(opts.path) ? opts.repo.readFile(opts.path) : null;
  let json: Record<string, unknown> = {};
  if (existingRaw) {
    try {
      json = JSON.parse(existingRaw);
    } catch {
      json = {};
    }
  }

  if (typeof json[opts.rootKey] !== "object" || json[opts.rootKey] === null) json[opts.rootKey] = {};
  const servers = json[opts.rootKey] as Record<string, unknown>;
  let added = 0;
  for (const spec of toAdd) {
    if (spec.name in servers) continue;
    servers[spec.name] = opts.transform ? opts.transform(spec.config) : spec.config;
    added++;
  }
  if (added === 0 && existingRaw) return null;

  return {
    path: opts.path,
    content: JSON.stringify(json, null, 2) + "\n",
    action: existingRaw ? WriteAction.Update : WriteAction.Create,
    note: added ? `${added} server${added === 1 ? "" : "s"}` : undefined,
  };
}
