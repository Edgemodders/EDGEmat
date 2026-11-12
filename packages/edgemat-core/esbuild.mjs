// Builds @edgemodders/edgemat-core (EDGEmat #7): EDGEmat's core, taken from the extension's source (it has
// no VS Code dependency), as one CommonJS file. Its dependencies (pngjs, vscode-jsonrpc) stay outside, in
// the package's dependencies. The types come from tsc beside it (dist/types).
import * as esbuild from "esbuild";
import * as fs from "node:fs";

fs.rmSync("dist", { recursive: true, force: true });
await esbuild.build({
  entryPoints: ["../../extensions/edgemat/src/core/index.ts"],
  outfile: "dist/index.cjs",
  bundle: true,
  packages: "external",
  platform: "node",
  format: "cjs",
  target: "node20",
  sourcemap: true,
  logLevel: "info",
});
