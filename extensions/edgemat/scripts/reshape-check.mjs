// The reshape check (design, "Reshape: a garment's shape changed by words"): Reshape on one item, a step
// at a time, through EDGEmat's core (`reshape.ts`), as Wardrobe Designer runs it. 1. Views: the garment
// drawn from four sides. 2. Change: the views changed by words (GPT Image by default). 3. Model: Tripo's
// multiview to model and its retopology. 4. Fit (one-bone garments): imported over the mesh in the
// project, Tripo's texture as its material, packed. Each step's files stay in the project's
// source\raw\edgemat\reshape\<item> folder and are reused, so a step can be looked at before paying for
// the next. Run `npm run build` first. Steps and what to look for: docs/testing.md, "Reshape check".
//
//   node scripts/reshape-check.mjs <project folder> [--item Items.Hat_02_basic_01] [--body feminine]
//        [--words "make the brim twice as wide"] [--what "cowboy hat"] [--until views|edit|model|fit]
//        [--redraw] [--again] [--from last|game] [--service openai|gemini] [--model <model>]
//        [--task <Tripo task id>] [--faces 6000] [--front -z] [--model-front +x] [--anchor 0.3]
//
// --until stops after that step (default: views, so nothing is paid for until asked). The views are drawn
// once per work folder; --redraw draws them again and starts the changes over. A change with the same words
// and model as the last one is kept; --again asks once more; --from game changes the game's look instead
// of building on the last change; --picture <file> adds a picture made before (or by hand) as the change,
// with no image service asked. --task reuses a finished Tripo task. Keys come from the shared key store
// (openai or gemini, tripo), never printed. GPT Image: a few tens of US cents a change. Tripo: about 60
// credits for the model and its retopology.

import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { getKey } from "../src/core/keys.mjs";

const require = createRequire(import.meta.url);
const core = require("../dist/core.js");

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const projDir = args[0] && !args[0].startsWith("--") ? path.resolve(args[0]) : undefined;
if (!projDir) {
  console.error("Usage: node scripts/reshape-check.mjs <project folder> [--item <record>] [--body feminine|masculine] [--words <words>] [--what <noun>] [--until views|edit|model|fit] [--redraw] [--again] [--from last|game] [--service openai|gemini] [--task <id>]");
  process.exit(1);
}
const itemId = opt("item", "Items.Hat_02_basic_01");
const body = opt("body", "feminine");
const words = opt("words", "make the brim twice as wide");
const until = opt("until", "views");
const Steps = ["views", "edit", "model", "fit"];
if (!Steps.includes(until)) {
  console.error(`--until is one of ${Steps.join(", ")}`);
  process.exit(1);
}
const upTo = (step) => Steps.indexOf(step) <= Steps.indexOf(until);
const service = opt("service", core.ReshapeDefaults.service);
const model = opt("model", core.ReshapeDefaults.models[service]);

const settings = core.vscodeUserSettings();
const game = await core.resolveGame(settings, {}, true);
const choice = core.resolveBridge(settings);
if (!game || !choice) {
  console.error(`FAIL: ${game ? "REDbridge.exe not found" : "no game folder found"}`);
  process.exit(1);
}

const name = path.basename(projDir);
const project = { archive: path.join(projDir, "source", "archive"), raw: path.join(projDir, "source", "raw") };
const log = (line) => console.log(`  ${line}`);

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

  // 1. Views.
  const items = await core.loadItems(bridge, core.defaultCacheDir());
  const item = items.find((i) => i.id === itemId);
  if (!item) throw new Error(`No clothing item ${itemId}`);
  const what = opt("what", item.name ?? "garment");
  const found = await core.itemMaterials(bridge, item);
  const look = found.looks.find((l) => l.body === body) ?? found.looks[0];
  if (!look) throw new Error(`${itemId} has no look`);
  const work = path.join(project.raw, "edgemat", "reshape", core.materialSlug(`${item.id} ${look.body}`));
  console.log(`${item.name} (${item.id}), ${look.body}: ${look.meshes.length} mesh(es)`);
  let v = args.includes("--redraw") ? undefined : core.loadReshape(work);
  if (!v) {
    v = await core.reshapeViews(bridge, core.loadLibrary(core.defaultCacheDir()), core.defaultCacheDir(), look.meshes.map((m) => ({ mesh: m.mesh, appearance: m.appearance })), project, work, { front: core.axis(opt("front", "-z")), log });
  } else {
    console.log(`  views drawn before (--redraw to draw them again); ${v.changes.length} change(s)`);
  }
  console.log(`Views: ${v.sheet}${v.fit.ok ? `; fits on ${v.fit.bone}` : `; cannot be fitted yet: ${v.fit.why}`}`);
  if (!upTo("edit")) throw "stop";

  // 2. Change.
  let change = v.changes.at(-1);
  if (opt("picture")) {
    // A picture made before (or by hand) as the change: no image service asked.
    change = await core.reshapeAddPicture(bridge, v, fs.readFileSync(path.resolve(opt("picture"))), { words, service, model, from: change?.sheet });
  } else if (args.includes("--again") || !change || change.words !== words.trim() || change.model !== model || opt("from") === "game") {
    const key = getKey(service, { tool: "EDGEmat" });
    if (!key) throw new Error(`No ${service} key in the shared key store`);
    change = await core.reshapeChange(bridge, v, words, { key, what, service, model, from: opt("from", "last"), log });
  } else {
    console.log(`  the same words and model as the last change: kept (--again for a new one)`);
  }
  for (const o of change.outline) console.log(`  ${o.view}: ${o.before.join(" x ")} m before, ${o.after.join(" x ")} m after`);
  console.log(`Changed: ${change.sheet}${change.from ? ` (built on ${path.basename(change.from)})` : ""}`);
  if (!upTo("model")) throw "stop";
  if (until === "fit" && !v.fit.ok) throw new Error(`Not fitted: ${v.fit.why}. Tripo was not asked.`);

  // 3. Model.
  const key = getKey("tripo", { tool: "EDGEmat" });
  if (!key) throw new Error("No Tripo key in the shared key store (service tripo)");
  const tripo = new core.Tripo(key, { log });
  const balance = await tripo.balance();
  if (balance !== undefined) console.log(`  Tripo: ${balance} credits`);
  let last = "";
  const made = await core.reshapeModel(tripo, v, change, {
    task: opt("task"),
    faces: Number(opt("faces", core.ReshapeDefaults.faces)),
    log,
    progress: (step, p) => {
      const line = `${step} ${Math.floor(p / 25) * 25}%`;
      if (line !== last) console.log(`  Tripo: ${line}`);
      last = line;
    },
  });
  console.log(`Model: ${made.low} (task ${made.task}, ${made.credits} credits)`);
  if (!upTo("fit")) throw "stop";

  // 4. Fit.
  const r = await core.reshapeFit(bridge, v, change, made, project, {
    folder: `edgemat\\reshape\\${core.materialSlug(words)}`,
    anchor: Number(opt("anchor", "0.3")),
    modelFront: core.axis(opt("model-front", "+x")),
    log,
  });
  for (const n of r.notes) console.log(`  ${n}`);
  console.log(`Fitted, drawn as the views: ${r.sheet}`);
  const packed = path.join(projDir, "packed", "archive", "pc", "mod");
  fs.mkdirSync(packed, { recursive: true });
  const p = await bridge.pack(project.archive, packed, name);
  console.log(`packed ${p.files} files into ${p.archive}`);
  console.log(`In the game, REDnode's Console (F10): addItem("${item.id}")`);
} catch (e) {
  if (e !== "stop") {
    failed = true;
    console.error(`FAIL: ${e instanceof Error ? e.stack ?? e.message : e}`);
  }
} finally {
  bridge.stop();
}
process.exit(failed ? 1 : 0);
