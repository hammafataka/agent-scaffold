import { McpServerSpec, McpServerConfig, PlannedWrite, WriteAction } from "../plugins/types";

const PATH = ".mcp.json";

interface McpJson {
  mcpServers?: Record<string, McpServerConfig>;
  [key: string]: unknown;
}

// Build (or update) the project-scoped .mcp.json. Existing entries always win — a server
// the user already configured (possibly with real credentials wired locally) is never
// overwritten. Returns null when there is nothing new to add.
export function planMcpWrite(specs: McpServerSpec[], existingRaw: string | null): PlannedWrite | null {
  const toAdd = specs.filter((s) => s.condition !== false);
  if (toAdd.length === 0) return null;

  let json: McpJson = {};
  if (existingRaw) {
    try {
      json = JSON.parse(existingRaw);
    } catch {
      json = {};
    }
  }

  const servers = (json.mcpServers ??= {});
  let added = 0;
  for (const spec of toAdd) {
    if (spec.name in servers) continue;
    servers[spec.name] = spec.config;
    added++;
  }
  if (added === 0 && existingRaw) return null;

  return {
    path: PATH,
    content: JSON.stringify(json, null, 2) + "\n",
    action: existingRaw ? WriteAction.Update : WriteAction.Create,
    note: added ? `${added} server${added === 1 ? "" : "s"}` : undefined,
  };
}
