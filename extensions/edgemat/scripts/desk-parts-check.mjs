// The Desk parts check: game surfaces and game materials on a game mesh's materials on the Desk, through
// EDGEmat's core (desk.ts, parts.ts), as the Desk view's commands and mat_apply desk_id run it. A Desk and a
// project of its own in a scratch folder, so the modder's Desk is not touched.
// 1. The mesh on the Desk and its copy. 2. A game surface on one material (files in <mesh folder>\edgemat\<mesh
// name>, not counted as an edited setup). 3. A game material on another, then back to the game's. 4. Add to
// Project: the changed mesh and the surface's files go in. 5. A second change on the Desk is a conflict with
// the project's copy. Run `npm run build` first. Steps: docs/testing.md, "Desk parts check".
//
//   node scripts/desk-parts-check.mjs [--mesh <game path>] [--surface "concrete"] [--keep]

import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as os from "node:os";
import * as path from "node:path";

const require = createRequire(import.meta.url);
const core = require("../dist/core.js");

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

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
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "edgemat-desk-parts-"));
let failed = false;
const check = (ok, line) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${line}`);
  if (!ok) failed = true;
};
const lower = (s) => (s ?? "").toLowerCase();
try {
  let mesh = opt("mesh");
  if (!mesh) {
    const found = (await bridge.search("s1_055", 2000)).items.map((i) => i.name).filter((n) => /\.mesh$/i.test(n) && !/shadow/i.test(n));
    mesh = found[0];
    if (!mesh) throw new Error("No s1_055 mesh in the game: pass --mesh");
  }
  const desk = new core.Desk(path.join(scratch, "cache"));
  const { entry } = desk.open("mesh", mesh);
  const archive = await desk.partArchive(bridge, entry);
  console.log(`1. ${mesh} on a scratch Desk, entry ${entry.id}`);
  check(fs.existsSync(path.join(archive, mesh)), "the entry's copy of the mesh is in its folder");
  const show = async (title, from = archive) => {
    const { parts } = await core.partsOf(bridge, lib, from, mesh);
    console.log(`${title}:`);
    for (const p of parts) console.log(`  ${p.name}: ${p.wears.kind}, ${p.wears.plain}`);
    return parts;
  };
  const parts = await show("   Its materials");
  check(parts.length >= 1, `${parts.length} materials`);
  const gameMi = Object.fromEntries(parts.map((p) => [p.name, p.wears.mi]));

  // 2. A game surface.
  const first = parts[0].name;
  const folder = core.deskPartFolder(mesh);
  const s = await core.useSurface(bridge, lib, archive, mesh, first, { surface: opt("surface", "concrete") }, folder);
  desk.markPart(entry.id, first, true);
  console.log(`2. ${s.surface?.title ?? "?"} on ${first}: wrote ${s.written.join(", ")}`);
  check(lower(s.mi).startsWith(lower(folder) + "\\"), `the .mi is in ${folder}`);
  check(s.written.every((f) => fs.existsSync(path.join(archive, f))), "every file written is in the entry's folder");
  check(!fs.existsSync(path.join(game.path, "archive", "pc", "mod", path.basename(s.mi))), "nothing went to the game folder");
  check(desk.edited(entry).length === 0, "the surface's setup is not counted as an edited setup");
  check(desk.partFiles(desk.get(entry.id)).length === 2, `the part files: ${desk.partFiles(desk.get(entry.id)).join(", ")}`);
  const after = await show("   Now");
  check(after.find((p) => p.name === first)?.wears.kind === "surface", `${first} wears a surface`);
  const gameRead = await show("   The game's mesh, unchanged", fs.mkdirSync(path.join(scratch, "empty"), { recursive: true }) ?? path.join(scratch, "empty"));
  check(lower(gameRead.find((p) => p.name === first)?.wears.mi) === lower(gameMi[first]), "the game's own mesh is as it was");

  // 3. A game material on another, then back to the game's.
  const second = parts[Math.min(1, parts.length - 1)].name;
  const list = await core.gameMaterials(bridge, core.defaultCacheDir());
  const pick = core.searchGameMaterials(list, "metal")[0] ?? list.materials[0];
  const g = await core.useGameMaterial(bridge, archive, mesh, second, pick.path);
  desk.markPart(entry.id, second, true);
  console.log(`3. ${pick.name} on ${second}`);
  const withGame = await show("   Now");
  check(lower(withGame.find((p) => p.name === second)?.wears.mi) === lower(pick.path), `${second} wears ${path.basename(pick.path)}`);
  if (second !== first) {
    const b = await core.backToGame(bridge, archive, mesh, second);
    desk.markPart(entry.id, second, false);
    const back = await show("   Back to the game's");
    check(lower(back.find((p) => p.name === second)?.wears.mi) === lower(gameMi[second]), `${second} is back on ${path.basename(b.mi)}`);
    check(lower(back.find((p) => p.name === first)?.wears.kind) === "surface", `${first} keeps its surface`);
    check(JSON.stringify(desk.get(entry.id).parts) === JSON.stringify([first]), `the entry's changed materials: ${desk.get(entry.id).parts?.join(", ")}`);
  }

  // 4. Add to Project.
  const project = { archive: path.join(scratch, "project", "source", "archive") };
  fs.mkdirSync(project.archive, { recursive: true });
  const c0 = await desk.conflicts(bridge, project, "check", [entry.id]);
  check(c0.length === 0, "no conflict with an empty project");
  const r = await desk.toProject(bridge, project, "check", { ids: [entry.id] });
  console.log(`4. Added: ${r.written.join(", ")}`);
  for (const n of r.notes) console.log(`   ${n}`);
  check(r.added.includes(entry.id), "the entry went in");
  check(r.written.some((f) => lower(f) === lower(mesh)), "the mesh went in");
  check(r.written.some((f) => lower(f) === lower(s.mi)) && r.written.some((f) => lower(f) === lower(s.setup)), "the surface's .mi and setup went in");
  const inProject = await show("   In the project", project.archive);
  check(lower(inProject.find((p) => p.name === first)?.wears.mi) === lower(s.mi), `the project's ${first} wears the surface`);

  // 5. Changed again on the Desk: the project's copy now differs.
  const other = core.searchGameMaterials(list, "glass")[0] ?? list.materials[1];
  await core.useGameMaterial(bridge, archive, mesh, first, other.path);
  check(core.dropPartFiles(archive, first, folder).length === 2 && desk.partFiles(desk.get(entry.id)).length === 0, "the surface files go when a game material replaces the surface");
  desk.markPart(entry.id, first, true);
  const c1 = await desk.conflicts(bridge, project, "check", [entry.id]);
  console.log(`5. ${other.name} on ${first} on the Desk: ${JSON.stringify(c1)}`);
  check(c1.length === 1 && c1[0].parts.includes(first), `a conflict on ${first}`);

  const kept = await desk.toProject(bridge, project, "check", { ids: [entry.id] });
  check(kept.kept.includes(entry.id), "without replace, the project keeps its copy");
  const replaced = await desk.toProject(bridge, project, "check", { ids: [entry.id], replace: true });
  const now = await show("   Replaced", project.archive);
  check(replaced.written.some((f) => lower(f) === lower(mesh)) && lower(now.find((p) => p.name === first)?.wears.mi) === lower(other.path), `with replace, the project's ${first} wears ${path.basename(other.path)}`);
} catch (e) {
  check(false, e instanceof Error ? e.stack ?? e.message : String(e));
} finally {
  bridge.stop();
  if (args.includes("--keep")) console.log(`Kept: ${scratch}`);
  else fs.rmSync(scratch, { recursive: true, force: true });
}
console.log(failed ? "FAILED" : "PASSED");
process.exit(failed ? 1 : 0);
