// Curated MCP servers offered for the project-scoped .mcp.json. Shared across plugins —
// each plugin picks which apply and which are recommended (pre-checked) for its stack.
//
// Secrets are NEVER inlined. Configs that need credentials use `${ENV_VAR}` placeholders;
// Claude Code expands them from the developer's environment at load time, so the committed
// .mcp.json stays shareable.

import { McpServerSpec } from "../plugins/types";

// Up-to-date library/framework documentation lookup. Useful on every stack.
export function context7(recommended = true): McpServerSpec {
  return {
    name: "context7",
    description: "Up-to-date docs for any library/framework (Context7)",
    recommended,
    config: { command: "npx", args: ["-y", "@upstash/context7-mcp"] },
  };
}

// Browser automation — drive the running app for E2E verification and UI debugging.
export function playwright(recommended: boolean): McpServerSpec {
  return {
    name: "playwright",
    description: "Browser automation for verifying the running app (Playwright)",
    recommended,
    config: { command: "npx", args: ["-y", "@playwright/mcp@latest"] },
  };
}

// GitHub issues/PRs beyond what the `gh` CLI covers. Token comes from the environment.
export function github(recommended = false): McpServerSpec {
  return {
    name: "github",
    description: "GitHub issues & PRs (needs GITHUB_PERSONAL_ACCESS_TOKEN in your env)",
    recommended,
    config: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: "${GITHUB_PERSONAL_ACCESS_TOKEN}" },
    },
  };
}

// Jira/Confluence via mcp-atlassian. URL and token come from the environment so the
// committed config carries no credentials and works across team members.
export function atlassian(recommended = false): McpServerSpec {
  return {
    name: "atlassian",
    description: "Jira & Confluence (needs JIRA_URL + JIRA_PERSONAL_TOKEN in your env)",
    recommended,
    config: {
      command: "uvx",
      args: ["mcp-atlassian"],
      env: {
        JIRA_URL: "${JIRA_URL}",
        JIRA_PERSONAL_TOKEN: "${JIRA_PERSONAL_TOKEN}",
      },
    },
  };
}

// Direct Postgres access for inspecting schemas and data during development.
export function postgres(recommended = false): McpServerSpec {
  return {
    name: "postgres",
    description: "Read-only Postgres inspection (needs DATABASE_URL in your env)",
    recommended,
    config: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-postgres", "${DATABASE_URL}"],
    },
  };
}
