// The test outside VS Code (M1 to M3): builds the material library from the game with the bundled core
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

  // M2: finding an item's materials (behavior spec, section 1), on the test set.
  console.log("\nfind");
  let t1 = Date.now();
  const items = await core.loadItems(bridge, cache);
  check(items.length > 1500 && items.some((i) => i.name === "Sunny Ammo synthetic high-tops"), `clothing items: ${items.length}, with in-game names, in ${Date.now() - t1} ms`);
  const shoes = core.searchItems(items, "sunny ammo high-tops")[0];
  const jeans = core.searchItems(items, "Pants_03_basic_01")[0];
  check(shoes?.id === "Items.CasualShoes_01_basic_01" && jeans?.id === "Items.Pants_03_basic_01", `search: "sunny ammo high-tops" finds ${shoes?.id}; "Pants_03_basic_01" finds ${jeans?.id}`);
  t1 = Date.now();
  const shoeWalk = await core.itemMaterials(bridge, shoes);
  const ml = (look) => look.meshes.flatMap((m) => m.materials.filter((x) => x.multilayered));
  const fem = shoeWalk.looks.find((l) => l.body === "feminine"), mas = shoeWalk.looks.find((l) => l.body === "masculine");
  check(!!fem && !!mas && ml(fem)[0]?.setup === sneakers && /ml_s1_055_pma_shoe__converse_masksset\.mlmask$/.test(ml(fem)[0]?.mask ?? "") && fem.meshes[0].mesh.includes("_pwa_") && mas.meshes[0].mesh.includes("_pma_"),
    `sneakers walked in ${Date.now() - t1} ms: two bodies (pwa and pma meshes), each with red_yellow_graphic's setup and the converse mask set`);
  const jeansWalk = await core.itemMaterials(bridge, jeans);
  const jf = jeansWalk.looks.find((l) => l.body === "feminine");
  check(!!jf && jf.meshes[0].mesh.includes("l1_066"), `jeans: the feminine body wears ${jf?.meshes[0].mesh.split("\\").pop()} (spec: l1_066 rogue pants)`);
  const jacketPath = "base\\characters\\garment\\corp_arasaka\\torso\\t2_078_jacket__samurai\\t2_078_ma_jacket__samurai.mesh";
  const jacket = await core.meshMaterials(bridge, jacketPath);
  const def = jacket.find((l) => l.appearance === "default"), noBags = jacket.find((l) => l.appearance === "no_bags");
  check(ml({ meshes: [def] }).length === 2 && new Set(ml({ meshes: [def] }).map((x) => x.setup)).size === 1 && noBags?.materials.some((x) => /mesh_decal\.mt$/.test(x.base)),
    `jacket mesh: ${jacket.length} appearances; body and bags share one setup; no_bags hides parts with mesh_decal.mt`);
  const given = await core.openSetup(bridge, lib, cache, { gamePath: ml(fem)[0].setup }, ml(fem)[0].mask);
  check(given.maskFrom === "given" && given.masks?.name === "ml_s1_055_pma_shoe__converse_masksset", "opening a found setup uses the mask set its material names");

  // M2: colors for REDcode's 3D view (renderMaterials, first version: color only).
  console.log("\n3D view");
  const isPng = (u) => !!u && u[0] === 0x89 && u[1] === 0x50 && u[2] === 0x4e && u[3] === 0x47;
  let t2 = Date.now();
  const shoeMaps = await core.renderMaterials(bridge, lib, cache, { mesh: fem.meshes[0].mesh, appearance: "red_yellow_graphic", materials: ["red_yellow_graphic", "dec_lights"] });
  check(isPng(shoeMaps.red_yellow_graphic?.baseColor) && shoeMaps.red_yellow_graphic.fidelity === "approximate" && !shoeMaps.dec_lights,
    `sneakers in ${Date.now() - t2} ms: the layered material's color map; dec_lights has no color texture, so the viewer keeps its flat color`);
  t2 = Date.now();
  const jacketMaps = await core.renderMaterials(bridge, lib, cache, { mesh: jacketPath, appearance: "default" });
  check(Object.keys(jacketMaps).length === 5 && isPng(jacketMaps.bags?.baseColor) && isPng(jacketMaps.decals?.baseColor),
    `jacket in ${Date.now() - t2} ms: ${Object.keys(jacketMaps).length} materials, the two layered ones and three textured decals`);

  // M3: editing a setup and saving it into a project (design, "Phases"; behavior spec, sections 6, 9 and 10).
  console.log("\nedit and save");
  const jacketSetup = "base\\characters\\garment\\corp_arasaka\\torso\\t2_078_jacket__samurai\\textures\\ml_t2_078_ma_jacket__samurai.mlsetup";
  const js = await core.openSetup(bridge, lib, cache, { gamePath: jacketSetup });
  const tmp = path.join(cache, "smoke");
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  const origFile = path.join(tmp, "orig.mlsetup"), sameFile = path.join(tmp, "same.mlsetup"), freshFile = path.join(tmp, "fresh.mlsetup");
  await bridge.extract(jacketSetup, origFile);
  await bridge.fromJson(sameFile, { json: JSON.stringify(core.setupToJson(js.setup)) });
  await bridge.fromJson(freshFile, { json: JSON.stringify(core.setupToJson({ ...js.setup, json: undefined })) });
  const fresh = core.parseSetup(JSON.parse((await bridge.fileToJson(freshFile)).json));
  check(fs.readFileSync(origFile).equals(fs.readFileSync(sameFile)) && core.sameSetup(fresh, js.setup),
    "an unedited setup writes back byte for byte; one written fresh (from an older JSON shape) reads back the same");
  const biggest = js.info.layers.filter((l) => l.shown).sort((a, b) => (b.share ?? 0) - (a.share ?? 0));
  const [bodyLayer, otherLayer] = [biggest[0].index, biggest[1].index];
  const toRed = core.patchFromWords(js.setup, bodyLayer, { color: "dark red" }, lib);
  let ed = core.applyLayerEdit(js.setup, bodyLayer, toRed.patch, lib);
  const leatherWords = core.patchFromWords(ed.setup, otherLayer, { surface: "leather standard clean", roughness: "glossy" }, lib);
  ed = core.applyLayerEdit(ed.setup, otherLayer, leatherWords.patch, lib);
  const shownAfter = core.withSetup(js, ed.setup, lib, cache).info.layers;
  check(shownAfter[bodyLayer].color?.plain.includes("red") && shownAfter[otherLayer].surface.title.startsWith("leather standard clean") && shownAfter[otherLayer].warnings.length === 0,
    `words to presets: layer ${bodyLayer} ${shownAfter[bodyLayer].color?.plain}; layer ${otherLayer} ${shownAfter[otherLayer].surface.title}, ${shownAfter[otherLayer].roughness?.plain}`);
  const refused = (patch) => { try { core.applyLayerEdit(ed.setup, bodyLayer, patch, lib); return false; } catch { return true; } };
  check(refused({ colorScale: "None" }) && refused({ colorScale: "abcdef_nope" }) && refused({ opacity: 9 }) && !refused({ opacity: 0.5 }),
    "refused: None as a preset, a color the surface lacks, opacity outside the game's range");
  const projDir = path.join(tmp, "smoke_project");
  fs.mkdirSync(path.join(projDir, "source", "archive"), { recursive: true });
  fs.writeFileSync(path.join(projDir, "smoke_project.cpmodproj"), "<WolvenKitProject />");
  const project = core.projectAt(projDir);
  let t3 = Date.now();
  const uses = await core.meshesUsing(bridge, jacketSetup, project.archive);
  check(uses.length === 3 && uses.every((u) => u.materials.includes("ml_t2_078_ma_jacket__samurai_masksset")),
    `meshes that use the jacket's setup, found in ${Date.now() - t3} ms: ${uses.map((u) => `${u.mesh.split("\\").pop()} (${u.materials.join(", ")})`).join("; ")}`);
  const target = core.newPathFor(jacketSetup, core.suffixFor(project.name));
  t3 = Date.now();
  const saved = await core.saveToProject(bridge, { setup: ed.setup, archive: project.archive, target, from: jacketSetup, meshes: uses.map((u) => u.mesh), suffix: core.suffixFor(project.name) });
  const back = core.parseSetup(JSON.parse((await bridge.fileToJson(path.join(project.archive, target))).json));
  let repointed = 0;
  for (const u of saved.meshes) {
    const looks = await core.meshMaterials(bridge, path.join(project.archive, u.mesh));
    const named = new Set(looks.flatMap((l) => l.materials.map((m) => m.setup?.toLowerCase())).filter(Boolean));
    if (named.has(target.toLowerCase()) && !named.has(jacketSetup.toLowerCase())) repointed++;
  }
  check(core.sameSetup(back, ed.setup) && saved.written.length === 4 && repointed === 3,
    `saved in ${Date.now() - t3} ms as ${target.split("\\").pop()}: the setup reads back with the edits; ${repointed} of 3 meshes name it and no longer the game's`);
  const again = await core.meshesUsing(bridge, target, project.archive);
  check(again.length === 3, "saving again finds the project's own copies of the meshes");
  const fromProject = await core.openSetup(bridge, lib, cache, { file: path.join(project.archive, target) });
  const rogue = await core.openSetup(bridge, lib, cache, { gamePath: jf.meshes[0].materials.find((x) => x.multilayered).setup });
  check(fromProject.maskFrom === "material" && !!fromProject.composite && rogue.masks?.name === "ml_l1_066_wa_pants__rogue_masksset" && !!rogue.composite,
    `mask sets named by meshes: the saved setup opened from the project uses ${fromProject.masks?.name}; the rogue pants' setup, whose masks sit in another folder, uses ${rogue.masks?.name}`);
} finally {
  bridge.stop();
}
const failed = checks.filter((c) => !c).length;
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
