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

// The map's sources stay inside the package: "../src/core/<file>.ts" from dist/, not the path up to the
// extension's source, which in a consumer resolved outside the package (node_modules/extensions/...), so a
// tool attributing bundled code by its map's paths missed it (EDGEfab, 2026-11-13). The text is in the map.
const mapFile = "dist/index.cjs.map";
const map = JSON.parse(fs.readFileSync(mapFile, "utf8"));
const core = "extensions/edgemat/src/core/";
map.sources = map.sources.map((s) => {
  const at = s.replace(/\\/g, "/").indexOf(core);
  if (at < 0) throw new Error(`A source outside EDGEmat's core: ${s}`);
  return `../src/core/${s.replace(/\\/g, "/").slice(at + core.length)}`;
});
if (!map.sourcesContent || map.sourcesContent.length !== map.sources.length) throw new Error("The map has no source text");
fs.writeFileSync(mapFile, JSON.stringify(map));
