// Wardrobe Designer (design, "Wardrobe Designer"), W1: restyle what V wears by words. It reads what V
// wears and V's body from the game, finds each item in EDGEmat's item index, describes the picked item's
// layered materials with EDGEmat's core over REDnode's REDbridge, and asks REDagent for a recipe. The
// recipe is applied with mat_edit's checks into a work project in the app's data folder, packed, and
// swapped into the running game, where V and the inventory's preview show it at once. Restore puts the
// game's look back.

import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";
import { agent, api, archives, game, kernel, pkg, ui, type GameRef } from "rednode";
import type { BridgeClient } from "../../../extensions/edgemat/src/core/bridgeClient";
import { defaultCacheDir } from "../../../extensions/edgemat/src/core/config";
import { loadItems, type ItemEntry, type ItemLook } from "../../../extensions/edgemat/src/core/find";
import { bridgeOver } from "../../../extensions/edgemat/src/core/kernelBridge";
import { buildLibrary, isCurrent, loadLibrary, type Library } from "../../../extensions/edgemat/src/core/library";
import { applyRecipe, describeLook, RestyleBrief, type Look, type Recipe } from "../../../extensions/edgemat/src/core/restyle";

/** The clothing slots, as the game's equipment areas, with the words the window shows. */
const Slots = [
  ["Head", "Head"],
  ["Face", "Face"],
  ["OuterChest", "Outer torso"],
  ["InnerChest", "Inner torso"],
  ["Legs", "Legs"],
  ["Feet", "Feet"],
  ["Outfit", "Outfit"],
] as const;

/** The most layered materials described for one item, so a plan stays quick and cheap. */
const MaxMaterials = 4;

/** The word in restyled setups' names: ...\ml_x_wardrobe.mlsetup. */
const Suffix = "wardrobe";

/** The archive's name, in archive\pc\mod once swapped in. */
const ModName = "WardrobeDesigner";

// EDGEmat's own cache, so the item index and the material library EDGEmat built are used again.
const dir = defaultCacheDir();

// The work project (a WolvenKit-shaped folder) and the packed archive, in the app's data folder.
const archiveDir = path.join(pkg.dataDir, "work", "source", "archive");
const packedDir = path.join(pkg.dataDir, "packed");
const stateFile = path.join(pkg.dataDir, "restyles.json");

interface Worn {
  slot: string;
  label: string;
  item?: ItemEntry;
  /** The TweakDB id as the game gives it, when the item is not in the index. */
  hash?: string;
}

/** What the work project holds: each restyled item's files, and game files copied in only to undo one. */
interface State {
  restyles: Record<string, { name: string | null; words: string[]; files: string[]; when: string }>;
  originals: string[];
}

// ---------- the window ----------

const status = ui.text("Waiting for V to be in the world...", { tone: "dim" });
const slotButtons = Slots.map(([, label], i) => ui.button(label, () => void pick(i), { variant: "ghost", disabled: true }));
const picked = ui.text("Pick a piece of clothing V wears.", { tone: "dim" });
let words = "";
const wordsInput = ui.input({ label: "How should it look?", placeholder: "red leather, yellow denim...", onChange: (v) => (words = v), onSubmit: (v) => { words = v; void restyle(); } });
const restyleButton = ui.button("Restyle", () => void restyle(), { disabled: true });
const restoreButton = ui.button("Restore", () => void restore(), { variant: "ghost", disabled: true });
const log = ui.list({ height: 280, keep: 1000 });

ui.window({
  title: "Wardrobe Designer",
  width: 480,
  height: 600,
  anchor: "left",
  x: 40,
  children: [
    status,
    ui.row(...slotButtons.slice(0, 4)),
    ui.row(...slotButtons.slice(4)),
    picked,
    wordsInput,
    ui.row(restyleButton, restoreButton, ui.button("Refresh", () => void readWorn(), { variant: "ghost" })),
    log,
  ],
});

const say = (line: string) => {
  log.push(line);
  console.log(line);
};
const seconds = (since: number) => `${((Date.now() - since) / 1000).toFixed(1)} s`;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const failed = (what: string, e: unknown) => {
  say(`${what} failed: ${message(e)}`);
  status.set({ text: `${what} failed: ${message(e)}`, tone: "danger" });
};

/** One thing at a time: a restyle or restore turns the buttons off until it is done. */
let busy = false;
const setBusy = (on: boolean) => {
  busy = on;
  restyleButton.set({ disabled: on || !current });
  restoreButton.set({ disabled: on || !current || !readState().restyles[current.item.id] });
  slotButtons.forEach((b, i) => b.set({ disabled: on || !worn[i]?.item }));
};

// ---------- the work project's record ----------

function readState(): State {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile, "utf8")) as State;
    return { restyles: s.restyles ?? {}, originals: s.originals ?? [] };
  } catch {
    return { restyles: {}, originals: [] };
  }
}

function writeState(s: State): void {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(s, null, 2));
}

const sameFile = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const removeFile = (gamePath: string) => fs.rmSync(path.join(archiveDir, gamePath), { force: true });

// ---------- REDbridge, the item index and the library ----------

let bridge: Promise<BridgeClient> | undefined;
const getBridge = () =>
  (bridge ??= kernel.bridge().then((b) => {
    say(b.version ? `REDbridge ${b.version}, from REDnode` : "REDbridge, from REDnode");
    return bridgeOver((method, params) => b.call(method, params));
  }));

let items: Promise<Map<string, ItemEntry>> | undefined;
const getItems = () =>
  (items ??= (async () => {
    const t = Date.now();
    const list = await loadItems(await getBridge(), dir);
    say(`Item index: ${list.length} clothing items, ${seconds(t)}`);
    return new Map(list.map((i) => [tweakDbId(i.id), i]));
  })());

/**
 * EDGEmat's material library: the one EDGEmat built, when it matches the game; else built here from
 * the player's game, once and again after a game update (about half a minute), so a player needs no
 * EDGEmat in VS Code.
 */
let library: Promise<Library> | undefined;
const getLibrary = () =>
  (library ??= (async () => {
    const b = await getBridge();
    const had = loadLibrary(dir);
    if (had && (await isCurrent(had, b))) return had;
    const t = Date.now();
    const why = had ? "The game was updated: building the material library again" : "Building the material library from your game, once";
    status.set({ text: `${why} (about half a minute)...`, tone: "dim" });
    say(`${why}...`);
    let shown = 0;
    const lib = await buildLibrary(b, dir, (step, done, total) => {
      if (total && done !== undefined && Date.now() - shown > 5000) {
        shown = Date.now();
        say(`  ${step} ${done} of ${total}`);
      }
    });
    say(`Material library: ${lib.templates.length} surfaces, ${lib.microblends.length} microblends, in ${seconds(t)}`);
    return lib;
  })().catch((e) => {
    library = undefined;
    throw e;
  }));

/** A TweakDB id as the game shows it: the name's length and its CRC32, as 0x + 16 hex digits. */
function tweakDbId(name: string): string {
  const crc = zlib.crc32(Buffer.from(name, "utf8")).toString(16).padStart(8, "0");
  return `0x${name.length.toString(16).padStart(8, "0")}${crc}`.toUpperCase().replace(/^0X/, "0x");
}

// ---------- what V wears ----------

let worn: Worn[] = [];
let body: ItemLook["body"] = "any";
let current: Look | undefined;
let pickedSlot: number | undefined;

/** Thrown while the game is still putting V together after a load: worth a try again. */
class NotReady extends Error {}

/**
 * Reads what V wears and labels the slot buttons. `soon`: just after a load, when the game may not
 * have dressed V yet, so a NotReady is passed on for readWornSoon to try again instead of shown.
 */
async function readWorn(soon = false): Promise<void> {
  try {
    const t = Date.now();
    status.set({ text: "Reading what V wears...", tone: "dim" });
    const player = await api.GetPlayer(game.instance);
    if (!player) throw new NotReady("V is not in the world.");
    const data = await api.EquipmentSystem.GetData(player);
    if (!data) throw new NotReady("The game gave no equipment data for V.");
    const gender = String(await player.GetResolvedGenderName());
    body = gender === "Female" ? "feminine" : gender === "Male" ? "masculine" : "any";
    const index = await getItems();
    const restyled = readState().restyles;
    worn = [];
    for (const [area, label] of Slots) {
      const id = (await (data as GameRef).$call("GetItemInEquipSlot;gamedataEquipmentAreaInt32", area, 0)) as { id?: string } | null;
      const hash = id?.id && !/^0x0+$/i.test(id.id) ? id.id.toUpperCase().replace(/^0X/, "0x") : undefined;
      worn.push({ slot: area, label, hash, item: hash ? index.get(hash) : undefined });
    }
    labelSlots();
    const count = worn.filter((w) => w.hash).length;
    say(`V (${body} body) wears ${count} item(s), read in ${seconds(t)}`);
    for (const w of worn) if (w.hash) say(`  ${w.label}: ${w.item ? `${w.item.name ?? "(no name)"}, ${w.item.id}${restyled[w.item.id] ? `, restyled: ${restyled[w.item.id].words.join(", then ")}` : ""}` : `${w.hash}, not in EDGEmat's item index`}`);
    status.set({ text: "Pick a piece of clothing, then say how it should look. * marks one you restyled.", tone: "normal" });
  } catch (e) {
    if (soon && e instanceof NotReady) throw e;
    failed("Reading what V wears", e);
  }
}

/** After a load: reads what V wears once the game has dressed V, trying every 2 s for up to 30 s. */
async function readWornSoon(): Promise<void> {
  for (let tries = 1; ; tries++) {
    try {
      return await readWorn(true);
    } catch (e) {
      if (tries >= 15) return failed("Reading what V wears", e);
      status.set({ text: "Waiting for the game to finish loading V...", tone: "dim" });
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

/** Each slot button names what V wears there, with * for an item restyled. */
function labelSlots(): void {
  const restyled = readState().restyles;
  worn.forEach((w, i) => {
    const name = w.item?.name ?? w.item?.id ?? (w.hash ? "(not in the index)" : undefined);
    const mark = w.item && restyled[w.item.id] ? " *" : "";
    slotButtons[i].set({ label: name ? `${w.label}: ${name}${mark}` : `${w.label}: none`, disabled: busy || !w.item, variant: w.item ? "primary" : "ghost" });
  });
}

// ---------- one item's materials ----------

async function pick(i: number, quiet = false): Promise<void> {
  const w = worn[i];
  if (!w?.item || (busy && !quiet)) return;
  const item = w.item;
  try {
    const t = Date.now();
    current = undefined;
    pickedSlot = i;
    restyleButton.set({ disabled: true });
    restoreButton.set({ disabled: true });
    picked.set({ text: `${item.name ?? item.id}: reading its materials...`, tone: "dim" });
    const look = await describeLook(await getBridge(), await getLibrary(), dir, item, body, { archive: archiveDir, suffix: Suffix, max: MaxMaterials });
    for (const warning of look.warnings) say(`  ${warning}`);
    say(`${item.name ?? item.id} (${item.id}), ${look.body} look ${look.appearance}: ${look.meshes.length} mesh(es)`);
    for (const m of look.meshes) say(`  ${m.mesh}, look ${m.appearance}`);
    for (const m of look.materials) {
      say(`    ${m.name}: ${m.restyled ? `${m.target} (restyled)` : m.setup}`);
      for (const l of m.layers) say(`      layer ${l.layer}: ${l.surface}, ${l.color ?? "no color"}${l.share === undefined ? "" : `, ${l.share}%`}`);
    }
    for (const o of look.other) say(`    ${o}`);
    current = look;
    const restyled = readState().restyles[item.id];
    picked.set({ text: `${item.name ?? item.id}: ${look.materials.length} layered material(s)${restyled ? `, restyled (${restyled.words.join(", then ")})` : ""}, read in ${seconds(t)}`, tone: "normal" });
    say(`Read in ${seconds(t)}`);
    restyleButton.set({ disabled: busy || !look.materials.length });
    restoreButton.set({ disabled: busy || !restyled });
  } catch (e) {
    picked.set({ text: `${item.name ?? item.id}: could not read its materials`, tone: "danger" });
    failed("Reading the materials", e);
  }
}

// ---------- the plan ----------

const PlanPrompt = (want: string) =>
  [
    "You are the planner for EDGEmat's Wardrobe Designer, restyling a piece of clothing V wears in Cyberpunk 2077.",
    `The player wants: "${want}".`,
    RestyleBrief,
    'Answer with only one JSON object, no other text: {"materials": [{"setup": "<the setup as the context names it>", "edits": [{"layer": <index>, "surface": "<only if it changes>", "color": "<words, #rrggbb, or a preset of the layer\'s surface>", "roughness": "<optional words>", "microblend": "<optional>"}]}], "notes": "<one or two plain sentences for the player>"}',
  ].join("\n");

/** What the planner gets: the item, V's body, and each layered material's shown layers. */
const planContext = (look: Look) => ({
  item: look.item,
  body: look.body,
  materials: look.materials.map((m) => ({ name: m.name, setup: m.setup, restyled: m.restyled || undefined, layers: m.layers })),
});

/** The JSON object in an answer, also when it is wrapped in a code block or a sentence. */
function parseRecipe(text: string): Recipe | undefined {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    const r = JSON.parse(text.slice(start, end + 1)) as Recipe;
    return Array.isArray(r.materials) ? r : undefined;
  } catch {
    return undefined;
  }
}

async function plan(look: Look, want: string): Promise<Recipe | undefined> {
  const t = Date.now();
  status.set({ text: "Asking REDagent for a plan...", tone: "dim" });
  say(`Plan: "${want}" for ${look.item.name ?? look.item.id}`);
  let text = "";
  const answer = await agent.ask(PlanPrompt(want), { context: planContext(look), onText: (piece) => (text += piece) });
  say(`REDagent answered in ${seconds(t)}, $${answer.cost.toFixed(3)}`);
  const recipe = parseRecipe(answer.text || text);
  if (!recipe) {
    say("The answer was not a JSON recipe:");
    for (const line of (answer.text || text).split(/\r?\n/)) say(`  ${line}`);
    status.set({ text: "REDagent did not answer with a recipe (see the log).", tone: "danger" });
    return undefined;
  }
  for (const m of recipe.materials ?? []) {
    say(`  ${m.setup}`);
    for (const e of m.edits ?? []) say(`    layer ${e.layer}: ${Object.entries(e).filter(([k]) => k !== "layer").map(([k, v]) => `${k} ${v}`).join(", ")}`);
  }
  if (recipe.notes) say(`  Notes: ${recipe.notes}`);
  console.log(`recipe ${JSON.stringify(recipe)}`);
  return recipe;
}

// ---------- restyle, pack and swap ----------

/** The base clothing slots the inventory's preview wears items in. */
const PreviewSlots = ["Head", "Eyes", "Chest", "Torso", "Legs", "Feet", "Outfit"].map((s) => `AttachmentSlots.${s}`);

/**
 * Applies the item's appearance again on the inventory's preview of V, so it loads the swapped files.
 * REDnode does this after a swap only in the slots it refreshed on V, and with the inventory open the
 * game hides V's own items (they read empty_appearance_default), so nothing is refreshed: seen
 * 2026-10-30 with REDnode 0.48.1, without Equipment-EX. Returns the slot, or why there was none.
 */
async function refreshPreview(itemId: string): Promise<string> {
  const hash = tweakDbId(itemId).toLowerCase();
  const ts = await api.GameInstance.GetTransactionSystem(game.instance);
  const layer = await (await api.GameInstance.GetInkSystem())?.GetLayer("inkMenuLayer");
  const menu = await layer?.GetGameController();
  const preview = await menu?.GetPuppet("inventory");
  if (!preview) return "no preview (the inventory has not made one yet)";
  for (const slot of PreviewSlots) {
    const item = await ts.GetItemInSlot(preview, slot);
    const id = item ? await item.GetItemID() : null;
    if (id && String(id.id).toLowerCase() === hash) {
      await ts.ResetItemAppearance(preview, id);
      return slot;
    }
  }
  return "the preview does not wear it";
}

/**
 * Packs the work project and swaps it into the game; V and the inventory's preview show it at once.
 * `itemId`: the item restyled or restored, refreshed on the preview when REDnode did not.
 */
async function packAndSwap(itemId?: string): Promise<void> {
  const b = await getBridge();
  let t = Date.now();
  fs.mkdirSync(packedDir, { recursive: true });
  const packed = await b.pack(archiveDir, packedDir, ModName);
  say(`Packed ${packed.files} file(s), ${(packed.bytes / 1024 / 1024).toFixed(1)} MB, in ${seconds(t)}`);
  for (const w of packed.warnings) say(`  ${w}`);
  t = Date.now();
  const r = await archives.reload([packed.archive]);
  for (const f of r.failed) say(`  Not swapped: ${f.file}: ${f.why}`);
  if (!r.reloaded.length) throw new Error(`the archive was not swapped in${r.failed[0] ? `: ${r.failed[0].why}` : ""}.`);
  say(`Swapped in, ${seconds(t)}${r.refreshed?.length ? `; V refreshed: ${r.refreshed.map((x) => x.slot.replace(/^.*\./, "")).join(", ")}` : "; nothing on V refreshed (with the inventory open, the game shows V's items on the preview)"}${r.preview?.items.length ? "; the inventory's preview too" : r.preview?.note ? `; preview: ${r.preview.note}` : ""}`);
  if (itemId && !r.preview?.items.length) {
    try {
      const done = await refreshPreview(itemId);
      say(/^[A-Z]\w+\./.test(done) ? `  Refreshed it on the inventory's preview (${done.replace(/^.*\./, "")})` : `  Not refreshed on the preview: ${done}`);
    } catch (e) {
      say(`  Refreshing the inventory's preview failed: ${message(e)}`);
    }
  }
}

async function restyle(): Promise<void> {
  const want = words.trim();
  const look = current;
  if (busy) return;
  if (!look) return void status.set({ text: "Pick a piece of clothing first.", tone: "danger" });
  if (!want) return void status.set({ text: "Say how it should look first.", tone: "danger" });
  const t = Date.now();
  setBusy(true);
  try {
    const recipe = await plan(look, want);
    if (!recipe) return;
    status.set({ text: "Making the materials...", tone: "dim" });
    const t2 = Date.now();
    const r = await applyRecipe(await getBridge(), await getLibrary(), look, recipe, archiveDir, Suffix);
    for (const n of r.notes) say(`  ${n}`);
    if (!r.changed.length) {
      status.set({ text: `Nothing to change.${recipe.notes ? ` ${recipe.notes}` : ""}`, tone: "danger" });
      return;
    }
    say(`Saved ${r.written.length} file(s) in ${seconds(t2)}: ${r.changed.map((c) => `${c.target}, layer(s) ${c.layers.join(", ")}`).join("; ")}`);
    const s = readState();
    const had = s.restyles[look.item.id];
    const files = [...(had?.files ?? [])];
    for (const f of r.written) if (!files.some((x) => sameFile(x, f))) files.push(f);
    s.restyles[look.item.id] = { name: look.item.name, words: [...(had?.words ?? []), want], files, when: new Date().toISOString() };
    // Game files copied in to undo an earlier restyle go now: this pack holds restyles again.
    const kept = Object.values(s.restyles).flatMap((x) => x.files);
    for (const f of s.originals) if (!kept.some((x) => sameFile(x, f))) removeFile(f);
    s.originals = [];
    writeState(s);
    status.set({ text: "Packing and swapping it in...", tone: "dim" });
    await packAndSwap(look.item.id);
    status.set({ text: `Restyled in ${seconds(t)}.${recipe.notes ? ` ${recipe.notes}` : ""}`, tone: "accent" });
    labelSlots();
    if (pickedSlot !== undefined) await pick(pickedSlot, true);
  } catch (e) {
    failed("Restyling", e);
  } finally {
    setBusy(false);
  }
}

// ---------- restore ----------

async function restore(): Promise<void> {
  const look = current;
  if (busy || !look) return;
  const s = readState();
  const rec = s.restyles[look.item.id];
  if (!rec) return void status.set({ text: `${look.item.name ?? look.item.id} is as the game made it.`, tone: "normal" });
  const t = Date.now();
  setBusy(true);
  try {
    status.set({ text: "Putting the game's look back...", tone: "dim" });
    delete s.restyles[look.item.id];
    const kept = Object.values(s.restyles).flatMap((x) => x.files);
    const mine = rec.files.filter((f) => !kept.some((x) => sameFile(x, f)));
    for (const f of mine) removeFile(f);
    say(`Restore ${look.item.name ?? look.item.id}: removed ${mine.length} file(s) from the work project`);
    // The game's own meshes, unchanged, go in their place. REDswap clears the game's copies only of
    // the files the new archive holds, so a mesh just left out would keep its restyled copy until a
    // restart (seen 2026-10-30, REDswap 1.0.0). REDbridge reads only the game's archives, so these
    // are the originals. They stay until the next restyle; by then the game has the original loaded.
    const b = await getBridge();
    const meshes = mine.filter((f) => /\.mesh$/i.test(f));
    for (const mesh of meshes) {
      const out = path.join(archiveDir, mesh);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      await b.extract(mesh, out);
      if (!s.originals.some((x) => sameFile(x, mesh))) s.originals.push(mesh);
    }
    say(`  The archive holds the game's own ${meshes.length} mesh(es) in their place, until the next restyle`);
    writeState(s);
    await packAndSwap(look.item.id);
    status.set({ text: `Restored in ${seconds(t)}.`, tone: "accent" });
    labelSlots();
    if (pickedSlot !== undefined) await pick(pickedSlot, true);
  } catch (e) {
    failed("Restoring", e);
  } finally {
    setBusy(false);
  }
}

// ---------- start ----------

let started = false;
game.onState((s) => {
  if (s.world && !started) {
    started = true;
    void readWornSoon();
  }
  if (!s.world) started = false;
});
void game.state().then((s) => {
  if (s.world && !started) {
    started = true;
    void readWornSoon();
  }
});
