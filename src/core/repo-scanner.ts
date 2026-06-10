import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { RepoSnapshot } from "../plugins/types";

const IGNORED_DIRS = new Set([
  ".git", "node_modules", "dist", "build", "target", ".gradle", ".idea", "out", ".next",
]);
const MAX_DEPTH = 8;

function walk(root: string, dir: string, depth: number, acc: string[]): void {
  if (depth > MAX_DEPTH) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (IGNORED_DIRS.has(e.name)) continue;
      walk(root, join(dir, e.name), depth + 1, acc);
    } else if (e.isFile()) {
      acc.push(relative(root, join(dir, e.name)).split(sep).join("/"));
    }
  }
}

export function scanRepo(root: string): RepoSnapshot {
  const files: string[] = [];
  walk(root, root, 0, files);
  files.sort();

  return {
    root,
    files,
    exists(rel) {
      return existsSync(join(root, rel));
    },
    readFile(rel) {
      try {
        const full = join(root, rel);
        if (!statSync(full).isFile()) return null;
        return readFileSync(full, "utf8");
      } catch {
        return null;
      }
    },
    glob(pattern) {
      return files.filter((f) => pattern.test(f));
    },
  };
}
