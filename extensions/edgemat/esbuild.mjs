// Bundles the extension (CommonJS, VS Code's module loader) and the core on its own (for the smoke
// test and other Node tools). `node esbuild.mjs --watch` rebuilds on change.
import * as esbuild from "esbuild";
import * as fs from "node:fs";

const watch = process.argv.includes("--watch");
const mcpVersion = JSON.parse(fs.readFileSync("../../packages/edgemat-mcp/package.json", "utf8")).version;

const common = { bundle: true, platform: "node", format: "cjs", target: "node18", sourcemap: true, logLevel: "info" };

const builds = [
  { ...common, entryPoints: ["src/extension.ts"], outfile: "dist/extension.js", external: ["vscode"] },
  { ...common, entryPoints: ["src/core/index.ts"], outfile: "dist/core.js" },
  // The surface page's script, for the webview.
  { bundle: true, platform: "browser", format: "iife", target: "es2022", sourcemap: true, logLevel: "info", entryPoints: ["src/webview/surface.ts"], outfile: "dist/webview/surface.js" },
  { bundle: true, platform: "browser", format: "iife", target: "es2022", sourcemap: true, logLevel: "info", entryPoints: ["src/webview/setup.ts"], outfile: "dist/webview/setup.js" },
  { bundle: true, platform: "browser", format: "iife", target: "es2022", sourcemap: true, logLevel: "info", entryPoints: ["src/webview/material.ts"], outfile: "dist/webview/material.js" },
  // The MCP server ships inside the extension (src/mcp.ts copies it to a fixed path and registers it), built
  // as packages/edgemat-mcp builds it, with the MCP SDK bundled in, so any Node 20 runs it.
  { ...common, target: "node20", entryPoints: ["../../packages/edgemat-mcp/src/server.ts"], outfile: "dist/mcp/edgemat-mcp.cjs", define: { __VERSION__: JSON.stringify(mcpVersion) }, banner: { js: "#!/usr/bin/env node" } },
];

if (watch) {
  const contexts = await Promise.all(builds.map((b) => esbuild.context(b)));
  await Promise.all(contexts.map((c) => c.watch()));
} else {
  await Promise.all(builds.map((b) => esbuild.build(b)));
}
