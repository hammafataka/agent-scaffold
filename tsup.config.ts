import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  target: "node20",
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
  // Keep clack out of the bundle so the runtime loads a single @clack/core instance
  // from node_modules. Bundling it duplicates the core classes, which breaks our
  // Prompt.onKeypress patch (the patched class isn't the one clack instantiates).
  external: ["@clack/prompts", "@clack/core"],
});
