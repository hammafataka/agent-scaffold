import { StackPlugin, Facts, FieldSpec, FieldKind, McpServerSpec } from "../types";
import { detectSpringBoot } from "./detect";
import { springSections } from "./sections";
import { springSkills } from "../../catalog/skills";
import { springCommands } from "../../catalog/commands";
import { springAgents } from "../../catalog/agents";
import { springSettings } from "./settings";
import { atlassian, context7, github, postgres } from "../../catalog/mcp-servers";

// Summary lines for the CLI's "Detected" note (moved out of cli.ts so each plugin
// owns its own presentation).
function springDescribe(facts: Facts): string[] {
  const lines: string[] = [];
  const stack = [
    facts.springBootVersion ? `Spring Boot ${facts.springBootVersion}` : null,
    facts.javaVersion ? `Java ${facts.javaVersion}` : null,
    facts.buildTool ? String(facts.buildTool) : null,
  ].filter(Boolean);
  if (stack.length) lines.push(stack.join("  ·  "));

  const starters = [
    facts.hasWeb ? "Web" : null,
    facts.hasJpa ? "JPA" : null,
    facts.hasSecurity ? "Security" : null,
  ].filter(Boolean);
  if (starters.length) lines.push(`Starters: ${starters.join(", ")}`);

  if (facts.migrationTool && facts.migrationTool !== "none") lines.push(`Migrations: ${facts.migrationTool}`);
  if (facts.activeProfile) lines.push(`Active profile: ${facts.activeProfile}`);
  if (facts.runCmd) lines.push(`Run: ${facts.runCmd}`);
  if (facts.testCmd) lines.push(`Test: ${facts.testCmd}`);
  return lines;
}

function springMcpServers(facts: Facts): McpServerSpec[] {
  return [
    context7(true),
    // Direct DB inspection pairs naturally with a JPA + migrations backend.
    postgres(false),
    atlassian(false),
    github(false),
  ].map((s) => (facts.hasJpa || s.name !== "postgres" ? s : { ...s, condition: false }));
}

function springFields(facts: Facts): FieldSpec[] {
  if (facts.migrationTool !== "manual-sql") return [];
  const fields: FieldSpec[] = [
    {
      key: "sqlDir",
      question: "SQL migration files directory:",
      kind: FieldKind.Text,
      required: true,
      detectedValue: facts.sqlDir !== undefined ? String(facts.sqlDir) : "docs/sql",
    },
    {
      key: "sqlPrefix",
      question: "SQL file prefix (e.g. 'fcm', 'schema'):",
      kind: FieldKind.Text,
      required: false,
      detectedValue: facts.sqlPrefix !== undefined ? String(facts.sqlPrefix) : undefined,
    },
  ];
  return fields;
}

function mapSpringConfirmedFacts(confirmed: Record<string, string>): Partial<Facts> {
  const updated: Partial<Facts> = {};
  const dbMig = confirmed["dbMigration"] ?? "";
  if (dbMig.startsWith("Flyway")) updated.migrationTool = "flyway";
  else if (dbMig.startsWith("Liquibase")) updated.migrationTool = "liquibase";
  else if (dbMig.startsWith("Manual SQL")) updated.migrationTool = "manual-sql";
  else if (dbMig === "No migration tool") updated.migrationTool = "none";
  return updated;
}

export const springBootPlugin: StackPlugin = {
  id: "spring-boot",
  displayName: "Spring Boot",
  detect: detectSpringBoot,
  describe: springDescribe,
  fields: springFields,
  sections: springSections,
  mapConfirmedFacts: mapSpringConfirmedFacts,
  skills: springSkills,
  commands: springCommands,
  agents: springAgents,
  settings: springSettings,
  mcpServers: springMcpServers,
};
