// The normal check (EDGEmat #11, from EDGEfab): which way the game reads a normal map's green, settled in
// the game. Puts one test material on the Comfy rocker slim-fits' "leather" look, both bodies: rows of
// round raised dots, every other row encoded the other way. RED rows have their green pointing up the image,
// as EDGEmat's normalMap() makes them today (greenUp = true); BLUE rows have it pointing down (DirectX). Both
// go through the same import as EDGEmat's real materials (writeTexture "normal"), so the row that looks
// raised in the game is the convention the code should use. A white arrow in each tile's corner points up the
// image, so the light can be put along it. Packed into the project's packed folder. Run `npm run build`
// first. Steps: docs/testing.md, "Normal check".
//
//   node scripts/normal-check.mjs <project folder> [--tile 2] [--strength 3]
//
// --tile: how often the dots repeat across the pants (LayerTile). --strength: the dots' height.

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
  console.error("Usage: node scripts/normal-check.mjs <project folder> [--tile 2] [--strength 3]");
  process.exit(1);
}
const tile = Number(opt("tile", "2"));
const strength = Number(opt("strength", "3"));
if (!(tile > 0) || !(strength > 0)) {
  console.error("FAIL: --tile and --strength are numbers above 0");
  process.exit(1);
}

const settings = core.vscodeUserSettings();
const game = await core.resolveGame(settings, {}, true);
const choice = core.resolveBridge(settings);
if (!game) { console.error("FAIL: no game folder found"); process.exit(1); }
if (!choice) { console.error("FAIL: REDbridge.exe not found"); process.exit(1); }

const name = path.basename(projDir);
const archive = path.join(projDir, "source", "archive");
const folder = String.raw`edgemat\tests\normal`;
const colorTex = `${folder}\\dots_d01.xbm`;
const normalTex = `${folder}\\dots_n01.xbm`;
const mi = `${folder}\\dots.mi`;
const dir = String.raw`base\characters\garment\player_equipment\legs\l1_012_pants__jeans_tight`;
const material = "leather";

// The pictures: 512 px, 8 × 8 cells of 64 px. Cell (0, 0) holds the arrow; every other cell a dot.
const S = 512, C = 64, R = 22;
const blank = () => ({ width: S, height: S, data: new Uint8Array(S * S * 4) });
const isArrowCell = (cx, cy) => cx === 0 && cy === 0;
const blueRow = (cy) => cy % 2 === 1;
// Height: a dome in each dot cell (bright is raised, as normalMap() reads it).
const height = blank();
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  const cx = Math.floor(x / C), cy = Math.floor(y / C);
  let v = 0;
  if (!isArrowCell(cx, cy)) {
    const d = Math.hypot(x - (cx * C + C / 2), y - (cy * C + C / 2)) / R;
    if (d < 1) v = Math.round(255 * Math.sqrt(1 - d * d));
  }
  height.data.set([v, v, v, 255], (y * S + x) * 4);
}
const up = core.normalMap(height, strength, true);
const down = core.normalMap(height, strength, false);
const normal = blank();
const color = blank();
// The arrow: a white triangle pointing up the image, in cell (0, 0).
const inArrow = (x, y) => {
  const tx = x - C / 2, ty = y - 10; // apex at (32, 10), base at y 54
  return ty >= 0 && ty <= 44 && Math.abs(tx) <= (ty / 44) * 20;
};
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  const i = (y * S + x) * 4;
  const cx = Math.floor(x / C), cy = Math.floor(y / C);
  const src = blueRow(cy) ? down : up;
  normal.data.set(src.data.subarray(i, i + 4), i);
  const c = isArrowCell(cx, cy) ? (inArrow(x % C, y % C) ? [255, 255, 255] : [60, 60, 60]) : blueRow(cy) ? [70, 110, 230] : [220, 70, 70];
  color.data.set([...c, 255], i);
}

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
  await core.writeTexture(bridge, archive, colorTex, core.writePng(color), "color");
  await core.writeTexture(bridge, archive, normalTex, core.writePng(normal), "normal");
  console.log(`  ${colorTex}: red rows and blue rows, a white arrow up the image`);
  console.log(`  ${normalTex}: red rows green up (EDGEmat today), blue rows green down; strength ${strength}`);
  // Fairly smooth, so the dots catch the light.
  await core.writeTexturedMaterial(bridge, archive, mi, { baseColor: colorTex, normal: normalTex, layerTile: tile, roughnessScale: 0, roughnessBias: 0.35 });
  console.log(`  ${mi}: LayerTile ${tile}`);
  for (const body of ["pma", "pwa"]) {
    const mesh = `${dir}\\l1_012_${body}_pants__jeans_tight.mesh`;
    await core.applyMaterial(bridge, archive, mesh, material, mi);
    const m = (await core.meshMaterials(bridge, mesh, material, archive))[0]?.materials[0];
    const ok = m?.base === core.MetalBase && m.baseColor === colorTex;
    failed ||= !ok;
    console.log(`  ${ok ? "ok  " : "FAIL"} ${mesh.split("\\").pop()} ${material}: ${m?.base} through ${m?.instances.join(" > ")}`);
  }
  const out = path.join(projDir, "packed", "archive", "pc", "mod");
  fs.mkdirSync(out, { recursive: true });
  const p = await bridge.pack(archive, out, name);
  console.log(`packed ${p.files} files into ${p.archive}`);
  console.log(`Copy it into <game>\\archive\\pc\\mod with the game closed, then REDnode's Console (F10): addItem("Items.Pants_01_basic_01")`);
} catch (e) {
  failed = true;
  console.error(`FAIL: ${e instanceof Error ? e.stack ?? e.message : e}`);
} finally {
  await bridge.stopAndWait();
}
process.exit(failed ? 1 : 0);
