// The glow check (EDGEmat #6): glow through materialsFromModel, on an item V wears, to settle in the game
// how bright glTF's emissive strengths look (EmissiveEV = 4 + log2(strength), unverified) and that a glow
// map lights only its white parts. Every material of the item's look becomes a dark grey material with a
// glow: by default in bands across the texture (a map), or over the whole item with --whole. Packed into
// the project's packed folder. Run `npm run build` first. Steps: docs/testing.md, "Glow check".
//
//   node scripts/glow-check.mjs <project folder> [--item Items.Hat_02_basic_01] [--body feminine]
//        [--strength 1] [--color 0.2,0.8,1] [--whole]

import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";

const require = createRequire(import.meta.url);
const core = require("../dist/core.js");

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const projDir = args[0] && !args[0].startsWith("--") ? path.resolve(args[0]) : undefined;
if (!projDir) {
  console.error("Usage: node scripts/glow-check.mjs <project folder> [--item <record>] [--body feminine|masculine] [--strength 1] [--color r,g,b] [--whole]");
  process.exit(1);
}
const itemId = opt("item", "Items.Hat_02_basic_01");
const body = opt("body", "feminine");
const strength = Number(opt("strength", "1"));
const color = opt("color", "0.2,0.8,1").split(",").map(Number);
const whole = args.includes("--whole");
if (!(strength > 0) || color.length !== 3 || color.some((c) => !(c >= 0 && c <= 1))) {
  console.error("FAIL: --strength is above 0, --color is three numbers 0 to 1");
  process.exit(1);
}

const settings = core.vscodeUserSettings();
const game = await core.resolveGame(settings, {}, true);
const choice = core.resolveBridge(settings);
if (!game || !choice) {
  console.error(`FAIL: ${game ? "REDbridge.exe not found" : "no game folder found"}`);
  process.exit(1);
}
const name = path.basename(projDir);
const project = { archive: path.join(projDir, "source", "archive"), raw: path.join(projDir, "source", "raw") };
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
  const items = await core.loadItems(bridge, core.defaultCacheDir());
  const item = items.find((i) => i.id === itemId);
  if (!item) throw new Error(`No clothing item ${itemId}`);
  const look = (await core.itemMaterials(bridge, item)).looks.find((l) => l.body === body);
  if (!look) throw new Error(`${itemId} has no ${body} look`);
  console.log(`${item.name} (${item.id}), ${body}: ${look.meshes.length} mesh(es)`);

  // The glow map: eight bands down the texture, white and black in turn.
  let map;
  if (!whole) {
    const S = 512, img = { width: S, height: S, data: new Uint8Array(S * S * 4) };
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) img.data.set(Math.floor((y * 8) / S) % 2 ? [0, 0, 0, 255] : [255, 255, 255, 255], (y * S + x) * 4);
    map = path.join(project.raw, "edgemat", "tests", "glow", "bands.png");
    fs.mkdirSync(path.dirname(map), { recursive: true });
    fs.writeFileSync(map, core.writePng(img));
  }
  const folder = `edgemat\\tests\\glow\\${core.materialSlug(item.id)}`;
  for (const m of look.meshes) {
    const names = [...new Set(m.materials.map((u) => u.name))];
    const r = await core.materialsFromModel(bridge, {
      project,
      mesh: m.mesh,
      folder,
      materials: names.map((n) => ({ name: n, color: [0.05, 0.05, 0.05], roughness: 0.5 })),
      glow: names.map((n) => ({ material: n, color, strength, texture: map })),
      made: { check: "glow", item: item.id, strength },
    });
    for (const x of r.materials) console.log(`  ${path.win32.basename(m.mesh)} ${x.name}: EV ${x.glow?.ev}, color ${x.glow?.color.join(", ")}, ${x.glow?.map ? "in bands" : "all over"}${x.applied ? "" : " (not applied)"}`);
    for (const n of r.notes) console.log(`  ${n}`);
  }
  const packed = path.join(projDir, "packed", "archive", "pc", "mod");
  fs.mkdirSync(packed, { recursive: true });
  const p = await bridge.pack(project.archive, packed, name);
  console.log(`packed ${p.files} files into ${p.archive}`);
  console.log(`Copy it into <game>\\archive\\pc\\mod with the game closed (or swap it in with REDnode), then REDnode's Console (F10): addItem("${item.id}")`);
} catch (e) {
  failed = true;
  console.error(`FAIL: ${e instanceof Error ? e.stack ?? e.message : e}`);
} finally {
  await bridge.stopAndWait();
}
process.exit(failed ? 1 : 0);
