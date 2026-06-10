import { StackPlugin, Facts, FieldSpec, FieldKind } from "../types";
import { detectSpringBoot } from "./detect";
import { springSections } from "./sections";
import { springSkills } from "../../catalog/skills";
import { springCommands } from "../../catalog/commands";
import { springAgents } from "../../catalog/agents";
import { springSettings } from "./settings";

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
  fields: springFields,
  sections: springSections,
  mapConfirmedFacts: mapSpringConfirmedFacts,
  skills: springSkills,
  commands: springCommands,
  agents: springAgents,
  settings: springSettings,
};
