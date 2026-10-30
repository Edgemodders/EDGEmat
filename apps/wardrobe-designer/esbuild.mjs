// Bundles the Node mod, with EDGEmat's core, into dist/mod.mjs. REDnode gives the "rednode" package
// at run time. The core's dependencies are CommonJS, so the bundle gets a require of its own.

import * as esbuild from "esbuild";

const options = {
  entryPoints: ["src/mod.ts"],
  outfile: "dist/mod.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: true,
  external: ["rednode"],
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  logLevel: "info",
};

if (process.argv.includes("--watch")) await (await esbuild.context(options)).watch();
else await esbuild.build(options);
