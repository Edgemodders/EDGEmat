// The keep check (EDGEmat #13): materialsFromModel keeps the textures whose source did not change. A model's
// materials into a scratch project, then again with every slot kept and a new glow: only the .mi files are
// written, and in a fraction of the time; then with the color slot not kept: only the color textures are
// written. Outside the game. Run `npm run build` first. Steps: docs/testing.md, "Keep check".
//
//   node scripts/keep-check.mjs <model.glb> [--keep]

import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as os from "node:os";
import * as path from "node:path";

const require = createRequire(import.meta.url);
const core = require("../dist/core.js");

const args = process.argv.slice(2);
const model = args[0] && !args[0].startsWith("--") ? path.resolve(args[0]) : undefined;
if (!model || !fs.existsSync(model)) {
  console.error("Usage: node scripts/keep-check.mjs <model.glb> [--keep]");
  process.exit(1);
}
const settings = core.vscodeUserSettings();
const game = await core.resolveGame(settings, {}, true);
const choice = core.resolveBridge(settings);
if (!game || !choice) {
  console.error(`FAIL: ${game ? "REDbridge.exe not found" : "no game folder found"}`);
  process.exit(1);
}
const bridge = new core.BridgeClient({ exe: choice.exe, gamePath: game.path, dotnetRoot: choice.dotnetRoot });
bridge.start();
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "edgemat-keep-"));
const project = { archive: path.join(scratch, "source", "archive"), raw: path.join(scratch, "source", "raw") };
fs.mkdirSync(project.archive, { recursive: true });
let failed = false;
const check = (ok, line) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${line}`);
  if (!ok) failed = true;
};
const run = async (title, extra) => {
  const t = Date.now();
  const r = await core.materialsFromModel(bridge, { project, model, folder: "edgemat\\keepcheck", ...extra });
  const s = (Date.now() - t) / 1000;
  const written = r.materials.flatMap((m) => m.written), kept = r.materials.flatMap((m) => m.kept);
  console.log(`${title}: ${s.toFixed(1)} s, ${written.length} textures written, ${kept.length} kept, ${r.materials.length} .mi`);
  return { r, s, written, kept };
};
try {
  const first = await run("1. All written");
  const names = first.r.materials.map((m) => m.name);
  check(first.written.length > 0 && first.kept.length === 0, `${first.written.length} textures for ${names.length} materials`);
  const all = Object.fromEntries(names.map((n) => [n, ["baseColor", "roughness", "metal", "normal", "glow"]]));
  const glowing = names[0];
  const second = await run("2. Every slot kept, a new glow", { keep: all, glow: [{ material: glowing, color: [0, 0.4, 1], strength: 2 }] });
  check(second.written.length === 0, "no texture written");
  check(second.kept.length === first.written.length, `${second.kept.length} kept, as many as were written`);
  check(second.r.materials.every((m, i) => m.textures.join() === first.r.materials[i].textures.join()), "each material names the same textures");
  check(second.r.materials.find((m) => m.name === glowing)?.glow?.ev === core.glowEV(2), `${glowing} glows at EV ${core.glowEV(2)}`);
  check(second.s < first.s / 3, `${second.s.toFixed(1)} s against ${first.s.toFixed(1)} s`);
  const noColor = Object.fromEntries(names.map((n) => [n, ["roughness", "metal", "normal", "glow"]]));
  const third = await run("3. The color slot not kept", { keep: noColor });
  const colors = first.written.filter((t) => /_d01\.xbm$/i.test(t));
  check(third.written.length === colors.length && third.written.every((t) => /_d01\.xbm$/i.test(t)), `only the ${colors.length} color textures written`);
  fs.rmSync(path.join(project.archive, first.r.materials[0].textures[0]), { force: true });
  const fourth = await run("4. A kept texture deleted", { keep: all });
  check(fourth.written.length === 1 && fourth.written[0] === first.r.materials[0].textures[0], `the missing ${path.win32.basename(first.r.materials[0].textures[0])} written again`);
} catch (e) {
  check(false, e instanceof Error ? e.stack ?? e.message : String(e));
} finally {
  bridge.stop();
  if (args.includes("--keep")) console.log(`Kept: ${scratch}`);
  else fs.rmSync(scratch, { recursive: true, force: true });
}
console.log(failed ? "FAILED" : "PASSED");
process.exit(failed ? 1 : 0);
