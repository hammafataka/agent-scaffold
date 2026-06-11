import { RepoSnapshot, DetectionResult, Facts } from "../types";

export function detectSpringBoot(repo: RepoSnapshot): DetectionResult {
  const rootPom = repo.readFile("pom.xml");
  const rootGradle = repo.readFile("build.gradle.kts") ?? repo.readFile("build.gradle");
  const rootBuild = rootPom ?? rootGradle;

  // Choose the build system, then gather EVERY build file (root + modules) so a
  // multi-module project is detected as a whole — starters/migrations often live in
  // submodules, not the root.
  const isMaven = rootPom != null || (rootGradle == null && repo.glob(/(^|\/)pom\.xml$/).length > 0);
  const buildFilePattern = isMaven ? /(^|\/)pom\.xml$/ : /(^|\/)build\.gradle(\.kts)?$/;
  const buildFiles = repo.glob(buildFilePattern);
  // Always include the directly-read root build file (glob may not surface it), then add
  // every module build file so a multi-module project is detected as a whole.
  const allBuildText = [rootBuild ?? "", ...buildFiles.map((f) => repo.readFile(f) ?? "")].join("\n");

  if (!allBuildText.trim()) return { confidence: 0, facts: {} };
  if (!/org\.springframework\.boot/.test(allBuildText)) return { confidence: 0, facts: {} };

  const facts: Facts = {};
  const buildTool: "maven" | "gradle" = isMaven ? "maven" : "gradle";
  facts.buildTool = buildTool;

  // Version / Java come from the root build (which declares the Boot version + toolchain);
  // fall back to the aggregate if the root doesn't carry them.
  const verSrc = rootBuild ?? allBuildText;
  const verMatch =
    verSrc.match(/spring-boot-starter-parent<\/artifactId>\s*<version>([^<]+)</) ||
    verSrc.match(/org\.springframework\.boot["')\s:]+version\s*["']?([\d.]+)/) ||
    verSrc.match(/id\(["']org\.springframework\.boot["']\)\s*version\s*["']([\d.]+)["']/);
  if (verMatch) facts.springBootVersion = verMatch[1];

  const javaMatch =
    verSrc.match(/<java\.version>([^<]+)</) ||
    verSrc.match(/VERSION_(\d+)/) ||
    verSrc.match(/sourceCompatibility\s*=\s*["']?(\d+)/) ||
    verSrc.match(/languageVersion.*?JavaLanguageVersion\.of\((\d+)\)/);
  if (javaMatch) facts.javaVersion = javaMatch[1];

  // Starters — scanned across all modules. The web check accepts the classic `web`
  // starter plus Spring Boot's `webmvc` / `webflux` variants.
  facts.hasWeb = /spring-boot-starter-web(mvc|flux)?\b/.test(allBuildText);
  facts.hasJpa = /spring-boot-starter-data-jpa\b/.test(allBuildText);
  facts.hasSecurity = /spring-boot-starter-security\b/.test(allBuildText);

  // Migration tool — also scanned across all modules.
  if (/flyway/.test(allBuildText) || repo.glob(/db\/migration\/.+\.sql$/).length > 0) {
    facts.migrationTool = "flyway";
  } else if (/liquibase/.test(allBuildText) || repo.glob(/(changelog|db\/changelog).+\.(xml|ya?ml)$/i).length > 0) {
    facts.migrationTool = "liquibase";
  } else {
    facts.migrationTool = "none";
  }

  // Manual SQL convention: hand-written .sql snapshots + diff files (e.g. under docs/sql).
  // Only considered when no managed migration tool was found.
  if (facts.migrationTool === "none") {
    const sqlFiles = repo.glob(/\.sql$/);
    const docsSql = sqlFiles.filter((f) => /(^|\/)docs\/sql\//.test(f));
    const pool = docsSql.length ? docsSql : sqlFiles;
    if (pool.length) {
      facts.migrationTool = "manual-sql";
      const sample = pool[pool.length - 1];
      facts.sqlDir = docsSql.length ? "docs/sql" : (sample.includes("/") ? sample.slice(0, sample.lastIndexOf("/")) : ".");
      const base = sample.split("/").pop() ?? "";
      const prefix = base.match(/^([A-Za-z]+)/);
      if (prefix) facts.sqlPrefix = prefix[1];
    }
  }

  // Modules — discovered from the build's own module declarations so nested modules
  // (e.g. `modules/fare-common`) are found, not just top-level dirs. Gradle reads the
  // `include` entries in settings.gradle(.kts); Maven reads `<module>` entries in the
  // root pom. Falls back to any directory that owns a build file. Each module tracks
  // its repo-relative path plus its leaf name (what we display and key prompts on).
  // A module tracks two distinct things that are easy to conflate:
  //   - `dir`: the repo-relative directory, used for file lookups (build file, app config).
  //   - `projectPath`: the Gradle project path (`:`-separated, no leading `:`), used to
  //     scope tasks like `bootRun`. For Maven this mirrors the dir.
  // These DIVERGE when settings.gradle reassigns `projectDir` (e.g. `include 'fare-worker'`
  // living under `servers/fare-worker`). Deriving the task path from the directory then
  // produces `:servers:fare-worker:bootRun`, which Gradle rejects — `servers` is not a
  // project. So we must keep the project path separate from the directory.
  interface Module {
    dir: string;
    projectPath: string;
    name: string;
  }
  const seen = new Set<string>();
  const modules: Module[] = [];
  // `projectPath` defaults to the leaf name — the safe assumption when we can't read it
  // from a Gradle `include` literal (the module is registered flat under the root, even
  // if its directory is nested). Pass it explicitly when a literal include is available.
  const addModule = (dir: string, projectPath?: string) => {
    const d = dir.replace(/^\/+|\/+$/g, "");
    if (!d || seen.has(d)) return;
    seen.add(d);
    const name = d.split("/").pop()!;
    modules.push({ dir: d, projectPath: projectPath ?? name, name });
  };

  if (isMaven) {
    const modBlock = (rootPom ?? "").match(/<modules>([\s\S]*?)<\/modules>/);
    if (modBlock) {
      for (const m of modBlock[1].matchAll(/<module>\s*([^<]+?)\s*<\/module>/g)) {
        addModule(m[1]);
      }
    }
  } else {
    // Gradle project paths use `:` separators (optional leading `:`). Capture each
    // `include`'s argument list (a parenthesised block or the rest of the line), then pull
    // every quoted project path out of it. The colon-form IS the project path; its default
    // directory is the same string with `:` mapped to `/`.
    const settings = repo.readFile("settings.gradle.kts") ?? repo.readFile("settings.gradle") ?? "";
    for (const inc of settings.matchAll(/\binclude\b\s*(\([\s\S]*?\)|[^\n]*)/g)) {
      for (const q of inc[1].matchAll(/['"]([:\w.\-]+)['"]/g)) {
        const projectPath = q[1].replace(/^:/, "");
        addModule(projectPath.split(":").join("/"), projectPath);
      }
    }
  }

  // Fallback only when no declarations were found: any directory that owns a build file.
  // This covers settings.gradle files that register modules programmatically (e.g. a
  // `registerModule(name)` helper calling `include name` with a reassigned projectDir) —
  // the include literals aren't statically visible, so we discover modules by directory
  // and let `projectPath` default to the leaf name.
  if (modules.length === 0) {
    for (const f of buildFiles) {
      const dir = f.includes("/") ? f.slice(0, f.lastIndexOf("/")) : "";
      if (dir) addModule(dir);
    }
  }

  const moduleNames = modules.map((m) => m.name);
  if (moduleNames.length > 1) {
    facts.moduleCount = moduleNames.length;
    facts.modules = moduleNames.join(",");
  }

  // Bootable module: the one holding the @SpringBootApplication class. Pick the module
  // whose path is the longest prefix of the application file's path (handles nesting).
  // Falls back to the root `project(":x") { apply plugin: boot }` pattern. Empty for a
  // single/root app.
  let bootModule = ""; // leaf name (shown in the doc, marks the application module)
  let bootModuleDir = ""; // repo-relative dir (drives file lookups + Maven `-pl`)
  let bootModuleProjectPath = ""; // Gradle project path (drives the scoped run target)
  for (const f of repo.glob(/Application\.(java|kt)$/)) {
    if (!/@SpringBootApplication/.test(repo.readFile(f) ?? "")) continue;
    const owner = modules
      .filter((m) => f === m.dir || f.startsWith(m.dir + "/"))
      .sort((a, b) => b.dir.length - a.dir.length)[0];
    if (owner) {
      bootModule = owner.name;
      bootModuleDir = owner.dir;
      bootModuleProjectPath = owner.projectPath;
      break;
    }
  }
  if (!bootModule && rootGradle) {
    const m = rootGradle.match(/project\(\s*["']:([\w.-]+)["']\s*\)\s*\{[^}]*springframework\.boot/);
    if (m && moduleNames.includes(m[1])) {
      bootModule = m[1];
      const mod = modules.find((mod) => mod.name === m[1]);
      bootModuleDir = mod?.dir ?? m[1];
      bootModuleProjectPath = mod?.projectPath ?? m[1];
    }
  }
  if (bootModule) facts.bootModule = bootModule;

  // Profiles from application config (root first, then the boot module's resources).
  const appYml =
    repo.readFile("src/main/resources/application.yml") ||
    repo.readFile("src/main/resources/application.yaml") ||
    repo.readFile("src/main/resources/application.properties") ||
    (bootModuleDir &&
      (repo.readFile(`${bootModuleDir}/src/main/resources/application.yml`) ||
        repo.readFile(`${bootModuleDir}/src/main/resources/application.yaml`) ||
        repo.readFile(`${bootModuleDir}/src/main/resources/config/application.yaml`) ||
        repo.readFile(`${bootModuleDir}/src/main/resources/config/application.yml`)));
  if (appYml) {
    const prof = appYml.match(/active:\s*([^\n#]+)/) || appYml.match(/spring\.profiles\.active\s*=\s*(.+)/);
    if (prof) facts.activeProfile = prof[1].trim();
  }

  // Layering heuristic: a layered package structure has controller + (service|repository) dirs.
  const srcPaths = repo.glob(/src\/main\/(java|kotlin)\//);
  const hasDir = (re: RegExp) => srcPaths.some((path) => re.test(path));
  if (hasDir(/\/controllers?\//) && (hasDir(/\/services?\//) || hasDir(/\/repositor(y|ies)\//))) {
    facts.layering = "layered";
  }

  // Commands (prefer wrapper). The run target points at the bootable module when known.
  const hasMvnw = repo.exists("mvnw");
  const hasGradlew = repo.exists("gradlew");
  if (buildTool === "maven") {
    const mvn = hasMvnw ? "./mvnw" : "mvn";
    // Maven's reactor selects a module by its directory (`-pl`), not a project path.
    facts.runCmd = bootModuleDir
      ? `${mvn} -pl ${bootModuleDir} spring-boot:run`
      : `${mvn} spring-boot:run`;
    facts.buildCmd = `${mvn} clean package`;
    facts.testCmd = `${mvn} test`;
  } else {
    const gw = hasGradlew ? "./gradlew" : "gradle";
    // Gradle scopes a task by project path (already `:`-separated), NOT by directory.
    facts.runCmd = bootModuleProjectPath
      ? `${gw} :${bootModuleProjectPath}:bootRun`
      : `${gw} bootRun`;
    facts.buildCmd = `${gw} clean build`;
    facts.testCmd = `${gw} test`;
  }

  return { confidence: 0.9, facts };
}
