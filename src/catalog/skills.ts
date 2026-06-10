import { Facts, SkillSpec } from "../plugins/types";
import content from "./java-content.json";

const s = (f: Facts, k: string): string => String(f[k] ?? "");

// Curated, fact-independent skills authored under src/catalog/java/skills/.
const curatedSkills = (): SkillSpec[] => (content.skills as SkillSpec[]).map((sk) => ({ ...sk }));

// Body for the add-migration skill, branched by the detected migration style.
function addMigrationBody(migrationTool: string, sqlDir: string, sqlPrefix: string): string {
  if (migrationTool === "flyway") {
    return "Add a Flyway migration under `src/main/resources/db/migration/`.\n\nName it `V<next-number>__<snake_case_description>.sql` (e.g. `V7__add_user_index.sql`). Find the next number by listing existing `V*` files. Never edit an applied migration — add a new one.";
  }
  if (migrationTool === "liquibase") {
    return "Add a Liquibase changeset. Create a new changelog file and include it from the master changelog. Use a unique `id` and your author tag. Never edit an applied changeset — add a new one.";
  }
  // manual-sql: snapshot + diff-file convention. When the actual directory/prefix were
  // detected, document the concrete naming scheme (e.g. fcm-1.1.14.sql +
  // fcm1.1.13-to-1.1.14.diff.sql). Otherwise stay neutral — never invent paths the repo
  // doesn't use.
  if (!sqlDir && !sqlPrefix) {
    return [
      "Hand-written SQL migrations: each release has a full snapshot plus a diff from the previous version.",
      "",
      "To add a migration from version `A` to a new version `B`:",
      "1. Find the latest full snapshot in your SQL migrations directory.",
      "2. Write the incremental changes to a new diff file for the `A`→`B` transition.",
      "3. Create the new full snapshot for `B` = previous snapshot + the diff applied.",
      "",
      "Never edit an already-released snapshot or diff — always add the next version.",
    ].join("\n");
  }
  const dir = sqlDir || "docs/sql";
  const prefix = sqlPrefix || "schema";
  return [
    `Hand-written SQL migrations live under \`${dir}/\`. Each release has a full snapshot plus a diff from the previous version.`,
    "",
    "To add a migration from version `A` to the new version `B`:",
    `1. Find the latest snapshot in \`${dir}/\` (e.g. \`${prefix}-A.sql\`).`,
    `2. Write the incremental changes to a diff file named \`${prefix}A-to-B.diff.sql\` (e.g. \`${prefix}1.1.13-to-1.1.14.diff.sql\`).`,
    `3. Create the new full snapshot \`${prefix}-B.sql\` = previous snapshot + the diff applied.`,
    "",
    "Never edit an already-released snapshot or diff — always add the next version.",
  ].join("\n");
}

export function springSkills(facts: Facts): SkillSpec[] {
  const runCmd = s(facts, "runCmd");
  const testCmd = s(facts, "testCmd");
  const migrationTool = s(facts, "migrationTool");
  const hasMigration =
    migrationTool === "flyway" || migrationTool === "liquibase" || migrationTool === "manual-sql";

  return [
    {
      name: "run",
      description: "Start the Spring Boot application locally.",
      body: `Use this to run the app.\n\n\`\`\`bash\n${runCmd}\n\`\`\`\n\nThe app starts on the configured port. Stop with Ctrl-C.`,
    },
    {
      name: "test",
      description: "Run the test suite and confirm it passes.",
      body: `Run all tests:\n\n\`\`\`bash\n${testCmd}\n\`\`\`\n\n"Done" requires a green build with new code covered by tests.`,
    },
    {
      name: "add-migration",
      description: "Create a new database migration in the correct location and naming scheme.",
      condition: hasMigration,
      body: addMigrationBody(migrationTool, s(facts, "sqlDir"), s(facts, "sqlPrefix")),
    },
    ...curatedSkills(),
  ];
}
