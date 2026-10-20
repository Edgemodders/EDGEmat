// The tiling check (design, "Open questions": a tiled texture on a game garment). Builds a WolvenKit
// project from your own game: a UV test pattern texture, two metal_base materials at LayerTile 1 and 4,
// and the slim-fits pants' meshes for both bodies, with "leather" on tile 1 and "flames_blue_pink" on
// tile 4. Then packs it. Run `npm run build` first. Steps and what to look for: docs/testing.md.
//
//   node scripts/tiling-check.mjs <project folder>
//
// Items: Items.Pants_01_basic_01 (Comfy rocker slim-fits, leather, tile 1) and
// Items.Pants_01_basic_02 (Light Azure slim-fits, flames_blue_pink, tile 4).

import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";

const require = createRequire(import.meta.url);
const core = require("../dist/core.js");

const projDir = process.argv[2] ? path.resolve(process.argv[2]) : undefined;
if (!projDir) { console.error("Usage: node scripts/tiling-check.mjs <project folder>"); process.exit(1); }
const settings = core.vscodeUserSettings();
const game = await core.resolveGame(settings, {}, true);
const choice = core.resolveBridge(settings);
if (!game) { console.error("FAIL: no game folder found"); process.exit(1); }
if (!choice) { console.error("FAIL: REDbridge.exe not found"); process.exit(1); }

const name = path.basename(projDir);
const archive = path.join(projDir, "source", "archive");
const tex = "edgemat\\tests\\uv_test_pattern_d01.xbm";
const normal = "base\\characters\\garment\\citizen_casual\\legs\\l1_012_pants__jeans_tight\\textures\\l1_012_wa_pants__jeans_tight_n01.xbm";
const dir = "base\\characters\\garment\\player_equipment\\legs\\l1_012_pants__jeans_tight";
const looks = [{ material: "leather", tile: 1 }, { material: "flames_blue_pink", tile: 4 }];

const bridge = new core.BridgeClient({ exe: choice.exe, gamePath: game.path, dotnetRoot: choice.dotnetRoot });
bridge.on("error", (e) => console.error(`bridge error: ${e.message}`));
bridge.start();
let failed = false;
try {
  for (const d of ["archive", "raw", "resources"]) fs.mkdirSync(path.join(projDir, "source", d), { recursive: true });
  const proj = path.join(projDir, `${name}.cpmodproj`);
  if (!fs.existsSync(proj)) {
    fs.writeFileSync(proj, `<?xml version="1.0" encoding="utf-8"?>\r\n<CP77Mod xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">\r\n  <Name>${name}</Name>\r\n  <ModName>${name}</ModName>\r\n  <Author></Author>\r\n  <Email />\r\n  <Description />\r\n  <Version>1.0.0</Version>\r\n</CP77Mod>\r\n`);
  }
  console.log(`project ${projDir}`);
  await core.writeTexture(bridge, archive, tex, core.uvTestPattern(), "color");
  console.log(`  ${tex}`);
  for (const l of looks) {
    const mi = `edgemat\\tests\\uv_test_tile${l.tile}.mi`;
    await core.writeTexturedMaterial(bridge, archive, mi, { baseColor: tex, normal, layerTile: l.tile });
    console.log(`  ${mi}: LayerTile ${l.tile}`);
  }
  for (const body of ["pma", "pwa"]) {
    const mesh = `${dir}\\l1_012_${body}_pants__jeans_tight.mesh`;
    for (const l of looks) await core.applyMaterial(bridge, archive, mesh, l.material, `edgemat\\tests\\uv_test_tile${l.tile}.mi`);
    // Read back: each look's material now goes through the test .mi.
    for (const l of looks) {
      const m = (await core.meshMaterials(bridge, mesh, l.material, archive))[0]?.materials[0];
      const ok = m?.base === core.MetalBase && m.baseColor === tex;
      failed ||= !ok;
      console.log(`  ${ok ? "ok  " : "FAIL"} ${mesh.split("\\").pop()} ${l.material}: ${m?.base} through ${m?.instances.join(" > ")}`);
    }
  }
  const out = path.join(projDir, "packed", "archive", "pc", "mod");
  fs.mkdirSync(out, { recursive: true });
  const p = await bridge.pack(archive, out, name);
  console.log(`packed ${p.files} files into ${p.archive}`);
} catch (e) {
  failed = true;
  console.error(`FAIL: ${e instanceof Error ? e.message : e}`);
} finally {
  bridge.stop();
}
process.exit(failed ? 1 : 0);
