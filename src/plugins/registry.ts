import { StackPlugin, RepoSnapshot, DetectionResult } from "./types";
import { springBootPlugin } from "./spring-boot/index";
import { genericPlugin } from "./generic/index";

// Real stack plugins (generic is the fallback, not in this list).
export const PLUGINS: StackPlugin[] = [springBootPlugin];

const THRESHOLD = 0.5;

export function selectPlugin(
  repo: RepoSnapshot,
  plugins: StackPlugin[],
): { plugin: StackPlugin; detection: DetectionResult } {
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
