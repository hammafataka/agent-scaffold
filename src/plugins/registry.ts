import { StackPlugin, RepoSnapshot, DetectionResult } from "./types";
import { springBootPlugin } from "./spring-boot/index";
import { dartFlutterPlugin } from "./dart-flutter/index";
import { nodeTsPlugin } from "./node-ts/index";
import { genericPlugin } from "./generic/index";

// Real stack plugins (generic is the fallback, not in this list). Markers mostly don't
// collide (build.gradle/pom.xml vs. pubspec.yaml vs. package.json); polyglot repos (e.g.
// a Maven backend with a Node frontend at the root) are resolved by confidence — node-ts
// deliberately reports lower confidence than a firm Spring/Dart detection. Use
// `--stack <id>` to override.
export const PLUGINS: StackPlugin[] = [springBootPlugin, dartFlutterPlugin, nodeTsPlugin];

const THRESHOLD = 0.5;

// All selectable plugin ids (for `--stack` validation / help text).
export function pluginIds(): string[] {
  return [...PLUGINS.map((p) => p.id), genericPlugin.id];
}

// Pick the plugin for this repo. `forceId` (from `--stack`) overrides detection — the
// plugin still runs detect() so its facts pre-fill prompts, but confidence is ignored.
export function selectPlugin(
  repo: RepoSnapshot,
  plugins: StackPlugin[],
  forceId?: string,
): { plugin: StackPlugin; detection: DetectionResult } {
  if (forceId) {
    const forced = [...plugins, genericPlugin].find((p) => p.id === forceId);
    if (!forced) {
      throw new Error(`Unknown stack "${forceId}". Available: ${pluginIds().join(", ")}`);
    }
    return { plugin: forced, detection: forced.detect(repo) };
  }
  let best: { plugin: StackPlugin; detection: DetectionResult } | null = null;
  for (const plugin of plugins) {
    const detection = plugin.detect(repo);
    if (!best || detection.confidence > best.detection.confidence) {
      best = { plugin, detection };
    }
  }
  if (best && best.detection.confidence >= THRESHOLD) return best;
  return { plugin: genericPlugin, detection: genericPlugin.detect(repo) };
}
