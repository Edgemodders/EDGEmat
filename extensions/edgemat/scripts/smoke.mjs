// The test outside VS Code (M1, M2): builds the material library from the game with the bundled core
// (dist/core.js, so run `npm run build` first) and checks its counts against the game's own listing, then the surface page's data and images.
//
//   node scripts/smoke.mjs [--cache <dir>]
//
// Finds the game and REDbridge from the VS Code settings, as the extension does (edgemat.*, then
// redcode.*). The library goes to EDGEmat's normal cache folder unless --cache is given.

import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";

const require = createRequire(import.meta.url);
const core = require("../dist/core.js");

const i = process.argv.indexOf("--cache");
const cache = i >= 0 ? process.argv[i + 1] : core.defaultCacheDir();
const settings = core.vscodeUserSettings();

const game = await core.resolveGame(settings, {}, true);
const choice = core.resolveBridge(settings);
if (!game) { console.error("FAIL: no game folder found"); process.exit(1); }
if (!choice) { console.error("FAIL: REDbridge.exe not found"); process.exit(1); }
console.log(`game   ${game.path} (${game.from})`);
console.log(`bridge ${choice.exe} (${choice.from})`);
console.log(`cache  ${cache}`);

const bridge = new core.BridgeClient({ exe: choice.exe, gamePath: game.path, dotnetRoot: choice.dotnetRoot });
bridge.on("error", (e) => console.error(`bridge error: ${e.message}`));
bridge.start();
const checks = [];
const check = (ok, what) => { checks.push(ok); console.log(`${ok ? "ok  " : "FAIL"} ${what}`); };
try {
  const info = await bridge.info();
  console.log(`REDbridge ${info.version}, WolvenKit ${info.wolvenKit}, ${info.archives} archives, ${info.files} files`);
  let last = "";
  const lib = await core.buildLibrary(bridge, cache, (message, done, total) => {
    if (message !== last || (done && done % 100 === 0)) { last = message; console.log(`  ${message}${total ? ` ${done}/${total}` : ""}`); }
  });

  const templatesInGame = (await bridge.search(".mltemplate", 2000)).items.filter((x) => x.name.toLowerCase().endsWith(".mltemplate"));
  const microblendsInGame = (await bridge.search("\\microblends\\", 2000)).items.filter((x) => x.name.toLowerCase().endsWith(".xbm"));
  const thumbs = new Set([...lib.templates, ...lib.microblends].map((x) => x.thumbnail).filter(Boolean));
  const thumbsOnDisk = [...thumbs].filter((t) => fs.existsSync(core.thumbnailFile(cache, t))).length;

  console.log(`\nbuilt in ${lib.seconds} s`);
  check(lib.counts.templates === new Set(templatesInGame.map((x) => x.name)).size, `surfaces: ${lib.counts.templates} in the library, ${new Set(templatesInGame.map((x) => x.name)).size} in the game`);
  check(lib.counts.microblends === new Set(microblendsInGame.map((x) => x.name)).size, `microblends: ${lib.counts.microblends} in the library, ${new Set(microblendsInGame.map((x) => x.name)).size} in the game`);
  check(lib.counts.setups > 0 && lib.counts.masks > 0, `counted ${lib.counts.setups} setups and ${lib.counts.masks} mask sets`);
  check(thumbsOnDisk === thumbs.size && thumbs.size > 0, `thumbnails: ${thumbsOnDisk} of ${thumbs.size} on disk`);
  const colors = lib.templates.reduce((n, t) => n + t.colors.length, 0);
  check(colors > 0 && lib.templates.every((t) => t.defaults.colorScale), `presets: ${colors} colors; every surface has a default color`);
  check(lib.failed.length === 0, `failed files: ${lib.failed.length}${lib.failed.length ? "\n       " + lib.failed.slice(0, 10).join("\n       ") : ""}`);
  console.log(`     missing in the game itself: ${lib.missing.length}${lib.missing.length ? " (" + lib.missing.join(", ") + ")" : ""}`);
  check(await core.isCurrent(core.loadLibrary(cache), bridge), "the cached library reads back and matches the game's archives");
  const leather = core.searchTemplates(lib, "leather");
  check(leather.length > 0, `search "leather": ${leather.length} surfaces, such as ${leather.slice(0, 3).map((t) => t.name).join(", ")}`);
  console.log(`\nlibrary.json ${(fs.statSync(core.libraryFile(cache)).size / 1e6).toFixed(1)} MB, ${path.join(cache, "thumbs")}`);

  // M2: the surface page's data for every surface, and its images for one.
  console.log("\nsurface page");
  const pages = lib.templates.map((t) => core.describeSurface(t));
  const unnamed = pages.flatMap((p) => p.colors).filter((c) => !c.plain || !/^#[0-9a-f]{6}$/.test(c.hex)).length;
  check(pages.every((p) => p.defaultColor && p.roughness.length && p.metal.length && p.bumps.length) && unnamed === 0,
    `every surface described: a default color, roughness, metal and bump presets; ${pages.reduce((n, p) => n + p.colors.length, 0)} colors, ${unnamed} without a plain name or swatch`);
  const names = new Set(pages.flatMap((p) => p.colors.map((c) => c.plain)));
  console.log(`     ${names.size} distinct plain color names`);
  const red = core.parseColor("dark red"), leatherPage = core.describeSurface(leather[0]);
  const nearest = red && core.nearestColors(leatherPage, red, 1)[0];
  check(!!nearest && nearest.plain.includes("red"), `closest to "dark red" on ${leather[0].name}: ${nearest?.plain} (${nearest?.name}, distance ${nearest?.distance})`);
  check(core.parseColor("banana") === undefined && core.swatchHex(core.parseColor("#a03030")) === "#a03030", "reading typed colors: words, hex, and unknown words refused");
  const started = Date.now();
  const tex = leatherPage.textures.filter((x) => !x.isDefault && x.path);
  const made = [];
  for (const x of tex) made.push(await core.textureImage(bridge, cache, x.path, x.kind === "color" ? 512 : 192, x.kind === "normal" ? "relief" : "color", x.kind === "color" ? "soft" : "full"));
  check(made.length > 0 && made[0] && fs.existsSync(core.imageFile(cache, made[0])), `page images for ${leather[0].name}: ${made.filter(Boolean).length} of ${tex.length} made in ${Date.now() - started} ms`);

  // M2: the setup editor's data, on the in-game test sneakers (behavior spec, "In-game tests").
  console.log("\nsetup editor");
  const sneakers = "base\\characters\\garment\\player_equipment\\feet\\s1_055_shoe__converse\\textures\\ml_s1_055_pma_shoe__red_yellow_graphic.mlsetup";
  const t0 = Date.now();
  const opened = await core.openSetup(bridge, lib, cache, { gamePath: sneakers });
  const layers = opened.info.layers;
  check(layers.length === 20 && opened.info.shownCount === 19 && layers[11].hidden === "opacity 0",
    `read in ${Date.now() - t0} ms: ${layers.length} layers, ${opened.info.shownCount} shown; layer 11 hidden (${layers[11].hidden})`);
  check(opened.masks?.name === "ml_s1_055_pma_shoe__converse_masksset" && opened.masks.count === 20 && opened.maskChoices.length === 2,
    `mask set found beside it: ${opened.masks?.name} (${opened.masks?.count} masks), of ${opened.maskChoices.length} in the folder`);
  check(layers[7].surface.title.startsWith("rubber bumper") && layers[7].share > 0.05 && fs.existsSync(opened.composite.file),
    `layer 7 (the sole, in-game test R1-B): ${layers[7].surface.title}, ${(layers[7].share * 100).toFixed(1)}% of the texture; color map written`);
  check(layers.every((l) => l.surface.unused || l.surface.found) && layers.every((l) => l.warnings.length === 0),
    "every surface found in the library; no warnings on a game setup");
  // The two older WolvenKit JSON shapes, made from the current one.
  const current = JSON.parse((await bridge.toJson(sneakers)).json);
  const wrap = (l) => ({ Properties: l });
  const v001 = { Header: { WKitJsonVersion: "0.0.1" }, Data: { RootChunk: { Properties: { ...current.Data.RootChunk, layers: current.Data.RootChunk.layers.map(wrap) } } } };
  const oldest = { Chunks: [{ Properties: { ...current.Data.RootChunk, layers: current.Data.RootChunk.layers.map(wrap) } }] };
  const same = (a, b) => JSON.stringify(a.layers) === JSON.stringify(b.layers);
  check(same(core.parseSetup(v001), opened.setup) && same(core.parseSetup(oldest), opened.setup), "the 0.0.1 and oldest JSON shapes read the same layers");
} finally {
  bridge.stop();
}
const failed = checks.filter((c) => !c).length;
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
