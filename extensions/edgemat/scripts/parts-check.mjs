// The parts check (EDGEmat #12): game materials on the parts of a prop EDGEfab made, through EDGEmat's core
// (`parts.ts`), as the UI and mat_apply run it. 1. The parts and what each wears. 2. A game surface on one
// part (a one-layer setup). 3. The game's materials that suit any shape, read once (about a minute) and
// searched. 4. A game material on another part; one that does not fit is refused. 5. A third part back on
// the model's own texture. Packed for the game. Run `npm run build` first. Steps: docs/testing.md, "Parts check".
//
//   node scripts/parts-check.mjs <project folder> [--mesh <game path>] [--surface "car paint metallic"]
//        [--color red] [--surface-part <name>] [--material-part <name>] [--material <words or .mi>]
//        [--model-part <name>]
//
// Parts default to: the first part for the surface, the second for the game material, the third back on
// the model. The project is changed: use a copy.

import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";

const require = createRequire(import.meta.url);
const core = require("../dist/core.js");

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const projDir = args[0] && !args[0].startsWith("--") ? path.resolve(args[0]) : undefined;
if (!projDir) {
  console.error("Usage: node scripts/parts-check.mjs <project folder> [--mesh <game path>] [--surface <words>] [--color <words>] [--material <words>]");
  process.exit(1);
}
const archive = path.join(projDir, "source", "archive");

const settings = core.vscodeUserSettings();
const game = await core.resolveGame(settings, {}, true);
const choice = core.resolveBridge(settings);
if (!game || !choice) {
  console.error(`FAIL: ${game ? "REDbridge.exe not found" : "no game folder found"}`);
  process.exit(1);
}
const lib = core.loadLibrary(core.defaultCacheDir());
if (!lib) {
  console.error("FAIL: no Game Materials library: run the smoke test or open EDGEmat once");
  process.exit(1);
}
const bridge = new core.BridgeClient({ exe: choice.exe, gamePath: game.path, dotnetRoot: choice.dotnetRoot });
bridge.start();
let failed = false;
const check = (ok, line) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${line}`);
  if (!ok) failed = true;
};
try {
  // The prop: the mesh named, else the first mesh with an EDGEfab record.
  let mesh = opt("mesh");
  if (!mesh) {
    const meshes = [];
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.mesh$/i.test(e.name)) meshes.push(path.relative(archive, p));
      }
    };
    walk(archive);
    mesh = meshes.find((m) => core.propRecord(archive, m));
    if (!mesh) throw new Error("No mesh with an EDGEfab record in the project");
  }
  const show = async (title) => {
    const { parts, record } = await core.partsOf(bridge, lib, archive, mesh);
    console.log(`${title}: ${path.basename(mesh)}${record ? ` (EDGEfab's record ${path.basename(record.file)})` : ""}`);
    for (const p of parts) console.log(`  ${p.name}: ${p.wears.kind}, ${p.wears.plain}${p.model ? "" : " (no model texture)"}`);
    return parts;
  };
  const parts = await show("1. Parts");
  check(parts.length > 0, `${parts.length} parts`);
  const partNamed = (o, i) => opt(o) ?? parts[Math.min(i, parts.length - 1)].name;

  // 2. A game surface.
  const sPart = partNamed("surface-part", 0);
  let t = Date.now();
  const s = await core.useSurface(bridge, lib, archive, mesh, sPart, { surface: opt("surface", "car paint metallic"), color: opt("color", "red") });
  console.log(`2. ${sPart}: ${s.surface?.title}, color ${s.color}, tiling ${s.tile}, in ${Date.now() - t} ms`);
  for (const n of s.notes) console.log(`  ${n}`);
  for (const f of s.written) console.log(`  wrote ${f}`);
  const mi = JSON.parse((await bridge.fileToJson(path.join(archive, s.mi))).json).Data;
  check(mi.EmbeddedFiles.length === 0 && mi.RootChunk.values.some((v) => core.jsonValue(v.MultilayerSetup) === s.setup), "its .mi names its own setup, nothing embedded");
  const setup = core.parseSetup(JSON.parse((await bridge.fileToJson(path.join(archive, s.setup))).json));
  check(setup.layers.length === 1 && setup.layers[0].opacity === 1 && setup.layers[0].colorScale === s.color, `its setup has one layer, ${path.basename(setup.layers[0].material)} in ${setup.layers[0].colorScale}`);

  // 3. The game's materials that suit any shape.
  t = Date.now();
  let shown = 0;
  const list = await core.gameMaterials(bridge, core.defaultCacheDir(), (done, of) => {
    if (done - shown >= 2000) {
      shown = done;
      console.log(`  read ${done} of ${of}`);
    }
  });
  console.log(`3. ${list.materials.length} game materials suit any shape, of ${list.read} read, in ${((Date.now() - t) / 1000).toFixed(1)} s`);
  check(list.materials.length > 20, "a list to choose from");
  for (const q of ["glass", "glow blue", "metal", "concrete", "wood"]) {
    const found = core.searchGameMaterials(list, q, 200);
    console.log(`  "${q}": ${found.length}${found.length ? `, such as ${found.slice(0, 3).map((m) => m.path).join(", ")}` : ""}`);
  }
  const decal = (await bridge.search("decal", 50)).items?.map((f) => f.name).find((n) => /\.mi$/i.test(n));
  if (decal) {
    const fit = await core.materialFit(bridge, decal);
    check(!fit.fits, `a decal is refused: ${path.basename(decal)}, ${fit.why}`);
  }

  // 4. A game material on another part.
  const mPart = partNamed("material-part", 1);
  const want = opt("material", "glass");
  const pick = /\.mi$/i.test(want) ? want : core.searchGameMaterials(list, want, 1)[0]?.path;
  if (!pick) throw new Error(`No game material for "${want}"`);
  const g = await core.useGameMaterial(bridge, archive, mesh, mPart, pick);
  console.log(`4. ${mPart}: ${pick} (${g.fit.why})`);
  check(g.fit.fits, "it suits any shape");
  let refused = false;
  try {
    await core.useGameMaterial(bridge, archive, mesh, mPart, decal ?? "base\\surfaces\\textures\\decals\\blood\\blood_b.mi");
  } catch (e) {
    refused = /does not suit/.test(String(e));
  }
  check(refused, "a decal on a part is refused without force");

  // 5. Back on the model's texture.
  const bPart = partNamed("model-part", 2);
  await core.useSurface(bridge, lib, archive, mesh, bPart, { surface: "concrete", color: "grey" }).catch(() => undefined);
  const b = await core.backToModel(bridge, archive, mesh, bPart);
  console.log(`5. ${bPart}: back on ${b.mi}`);
  const after = await show("Parts now");
  check(after.find((p) => p.name === sPart)?.wears.kind === "surface", `${sPart} wears a surface`);
  check(after.find((p) => p.name === mPart)?.wears.kind === "game", `${mPart} wears a game material`);
  check(after.find((p) => p.name === bPart)?.wears.kind === "model", `${bPart} wears the model's texture`);

  const packed = path.join(projDir, "packed", "archive", "pc", "mod");
  fs.mkdirSync(packed, { recursive: true });
  const name = path.basename(projDir);
  const p = await bridge.pack(archive, packed, name);
  console.log(`packed ${p.files} files into ${p.archive}`);
} catch (e) {
  failed = true;
  console.error(`FAIL: ${e instanceof Error ? e.stack ?? e.message : e}`);
} finally {
  bridge.stop();
}
console.log(failed ? "\nthe parts check FAILED" : "\nthe parts check passed");
process.exit(failed ? 1 : 0);
