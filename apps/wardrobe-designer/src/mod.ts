// Wardrobe Designer (design, "Wardrobe Designer"), W1: restyle what V wears by words. It reads what V
// wears and V's body from the game, finds each item in EDGEmat's item index, describes the picked item's
// layered materials with EDGEmat's core over REDnode's REDbridge, and asks REDagent for a recipe. The
// recipe is applied with mat_edit's checks into a work project in the app's data folder, packed, and
// swapped into the running game, where V and the inventory's preview show it at once. Restore puts the
// game's look back. W2: a print or pattern in the words becomes a texture made by the player's Gemini key
// (REDnode's shared keys), over the whole material the planner picks.

import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";
import { agent, api, archives, game, kernel, pkg, secrets, ui, type ButtonProps, type GameRef, type UiNode } from "rednode";
import type { BridgeClient } from "../../../extensions/edgemat/src/core/bridgeClient";
import { defaultCacheDir } from "../../../extensions/edgemat/src/core/config";
import { loadItems, type ItemEntry, type ItemLook } from "../../../extensions/edgemat/src/core/find";
import { bridgeOver } from "../../../extensions/edgemat/src/core/kernelBridge";
import { generateTexture } from "../../../extensions/edgemat/src/core/imageServices";
import { buildLibrary, isCurrent, loadLibrary, type Library } from "../../../extensions/edgemat/src/core/library";
import { imageAsPng } from "../../../extensions/edgemat/src/core/material";
import { applyPatterns, applyRecipe, describeLook, RestyleBrief, type Look, type PatternImage, type Recipe } from "../../../extensions/edgemat/src/core/restyle";
import { materialSlug } from "../../../extensions/edgemat/src/core/material";
import { writePng } from "../../../extensions/edgemat/src/core/maps";
import { loadReshape, reshapeBack, reshapeChange, reshapeFit, reshapeModel, reshapeViews, ReshapeDefaults, type ReshapeViews } from "../../../extensions/edgemat/src/core/reshape";
import { Tripo } from "../../../extensions/edgemat/src/core/tripo";

/**
 * Where V wears clothing: the attachment slots on V's body, so the window lists what V visibly wears,
 * with the words it shows. The base game's slots, then Equipment-EX's outfit slots when it is installed
 * (its EquipmentEx.reds, OutfitSlots()): with its outfit on, Equipment-EX hides the base equipment and
 * wears the outfit's items in these, so the game's equipment system names items V is not wearing.
 */
const BaseSlots: [string, string][] = [
  ["AttachmentSlots.Head", "Head"],
  ["AttachmentSlots.Eyes", "Face"],
  ["AttachmentSlots.Torso", "Outer torso"],
  ["AttachmentSlots.Chest", "Inner torso"],
  ["AttachmentSlots.Legs", "Legs"],
  ["AttachmentSlots.Feet", "Feet"],
  ["AttachmentSlots.Outfit", "Outfit"],
];
const ExSlots: [string, string][] = [
  "Head", "Balaclava", "Mask", "Glasses", "Eyes", "EyeLeft", "EyeRight", "Wreath", "EarLeft", "EarRight",
  "Neckwear", "NecklaceTight", "NecklaceShort", "NecklaceLong", "TorsoUnder", "TorsoInner", "TorsoMiddle", "TorsoOuter", "TorsoAux",
  "Back", "Waist", "ShoulderLeft", "ShoulderRight", "ElbowLeft", "ElbowRight", "WristLeft", "WristRight",
  "Hands", "HandLeft", "HandRight", "HandPropLeft", "HandPropRight", "FingersLeft", "FingersRight", "FingernailsLeft", "FingernailsRight",
  "LegsInner", "LegsMiddle", "LegsOuter", "ThighLeft", "ThighRight", "KneeLeft", "KneeRight", "AnkleLeft", "AnkleRight",
  "Feet", "ToesLeft", "ToesRight", "ToenailsLeft", "ToenailsRight", "BodyUnder", "BodyInner", "BodyMiddle", "BodyOuter",
].map((n) => [`OutfitSlots.${n}`, n.replace(/([a-z])([A-Z])/g, (_, a: string, b: string) => `${a} ${b.toLowerCase()}`)]);

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
const settingsFile = path.join(pkg.dataDir, "settings.json");

/**
 * Which image service makes patterns: OpenAI's GPT Image by default, the one Reshape uses too, so a
 * player needs one image key for both (owner, 2026-11-02); Gemini when the player switches.
 */
type ImageService = "openai" | "gemini";
const ServiceNames: Record<ImageService, string> = { openai: "GPT Image", gemini: "Gemini" };
const KeyHelp: Record<ImageService, string> = { openai: "OpenAI key (platform.openai.com > API keys)", gemini: "Google Gemini key (aistudio.google.com > Get API key)" };
let patternService: ImageService = (() => {
  try {
    const s = JSON.parse(fs.readFileSync(settingsFile, "utf8")) as { patterns?: string };
    return s.patterns === "gemini" ? "gemini" : "openai";
  } catch {
    return "openai";
  }
})();

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
/** One button for each item V wears, made again each time the window reads V (see mainView). */
let slotButtons: UiNode<ButtonProps>[] = [];
const picked = ui.text("Pick a piece of clothing V wears.", { tone: "dim" });
let words = "";
const wordsInput = ui.input({ label: "How should it look?", placeholder: "red leather, yellow denim...", onChange: (v) => (words = v), onSubmit: (v) => { words = v; void restyle(); } });
const restyleButton = ui.button("Restyle", () => void restyle(), { disabled: true });
const restoreButton = ui.button("Restore", () => void restore(), { variant: "ghost", disabled: true });
const log = ui.list({ height: 200, keep: 1000 });
const patternsButton = ui.button(`Patterns: ${ServiceNames[patternService]}`, () => switchPatterns(), { variant: "ghost" });

function switchPatterns(): void {
  patternService = patternService === "openai" ? "gemini" : "openai";
  patternsButton.set({ label: `Patterns: ${ServiceNames[patternService]}` });
  try {
    fs.mkdirSync(pkg.dataDir, { recursive: true });
    fs.writeFileSync(settingsFile, JSON.stringify({ patterns: patternService }, null, 2));
  } catch (e) {
    say(`Saving the setting failed: ${message(e)}`);
  }
  say(`Patterns are now made with ${ServiceNames[patternService]} (your ${KeyHelp[patternService]})`);
}

// Reshape (W3): the picked item's shape changed by words, through pictures, then made 3D.
let shapeWords = "";
const shapeText = ui.text("Pick a piece of clothing, then press Reshape to see it from four sides.", { tone: "dim" });
const shapeInput = ui.input({ label: "Change its shape", placeholder: "make the brim twice as wide...", onChange: (v) => (shapeWords = v), onSubmit: (v) => { shapeWords = v; void changeShape(); } });
const reshapeButton = ui.button("Reshape", () => void startReshape(), { variant: "ghost", disabled: true });
const changeButton = ui.button("Change", () => void changeShape(), { disabled: true });
const backButton = ui.button("Back", () => backShape(), { variant: "ghost", disabled: true });
const makeButton = ui.button("Make it", () => void makeShape(), { variant: "ghost", disabled: true });
// The pictures, side by side (ui.image, REDnode 0.55.0); a click opens one larger. The manifest needs
// 0.56.1, so the guard matters only for a development copy on an older REDnode: the shape line
// then says where they are instead.
const canShow = typeof ui.image === "function";
/** A white square, for a picture slot before there is a picture (an empty path shows an error). */
const blank = `data:image/png;base64,${writePng({ width: 4, height: 4, data: new Uint8Array(64).fill(255) }).toString("base64")}`;
const beforeImage = canShow ? ui.image!(blank, { width: 210, alt: "As it is, from four sides", onClick: () => showLarger("before") }) : undefined;
const afterImage = canShow ? ui.image!(blank, { width: 210, alt: "Changed, from four sides", onClick: () => showLarger("after") }) : undefined;
let largerWindow: { close(): void } | undefined;

/** One of the two pictures in its own, larger window. */
function showLarger(which: "before" | "after"): void {
  const v = shape;
  if (!v || !ui.image) return;
  const file = which === "before" ? v.sheet : v.changes.at(-1)?.sheet ?? v.sheet;
  largerWindow?.close();
  largerWindow = ui.window({
    id: "picture",
    title: which === "before" ? "As it is" : `Changed: ${v.changes.at(-1)?.words ?? "nothing yet"}`,
    width: 640,
    height: 700,
    anchor: "right",
    x: -40,
    children: [ui.text("Front and left side above, back and right side below.", { tone: "dim" }), ui.image(file, { width: 600, alt: which === "before" ? "As it is" : "Changed" }), ui.button("Close", () => largerWindow?.close(), { variant: "ghost" })],
    onClose: () => (largerWindow = undefined),
  });
}

// ---------- the window's two views ----------
// One window, two views: the keys (first, while a key is missing) and the main view. The window kit
// cannot swap a window's content, so a view change closes the window and opens it again with the same
// id and size: REDnode keeps its place by both, so it stays where the player put it.

const WindowSize = { width: 480, height: canShow ? 900 : 760 };
let view: "main" | "keys" | undefined;
let mainWindow: { close(): void } | undefined;
const refreshButton = ui.button("Refresh", () => void readWorn(), { variant: "ghost" });
const keysButton = ui.button("Keys", () => void openKeys(), { variant: "ghost" });

/** The main view: the items V wears as buttons, three to a row, then Restyle and Reshape. */
function mainView() {
  slotButtons = worn.map((w, i) => ui.button(slotLabel(w), () => void pick(i), { variant: w.item ? "primary" : "ghost", disabled: busy || !w.item }));
  const rows = [];
  for (let i = 0; i < slotButtons.length; i += 3) rows.push(ui.row(...slotButtons.slice(i, i + 3)));
  return [
    status,
    ...(rows.length ? rows : [ui.text("What V wears shows here, one button for each piece.", { tone: "dim" })]),
    picked,
    wordsInput,
    ui.row(restyleButton, restoreButton, refreshButton),
    ui.row(patternsButton, keysButton),
    ui.heading("Reshape"),
    shapeText,
    ...(beforeImage && afterImage ? [ui.row(beforeImage, afterImage)] : []),
    shapeInput,
    ui.row(reshapeButton, changeButton, backButton, makeButton),
    log,
  ];
}

function show(next: "main" | "keys", children: UiNode<any>[]): void {
  mainWindow?.close();
  view = next;
  mainWindow = ui.window({
    id: "main",
    title: next === "main" ? "Wardrobe Designer" : "Wardrobe Designer: your keys",
    ...WindowSize,
    anchor: "left",
    x: 40,
    children,
    onClose: () => {
      mainWindow = undefined;
      view = undefined;
    },
  });
}

/**
 * The main view, made again (its item buttons follow what V wears). Only while it shows, unless
 * `force`: not over the keys view, and not again after the player closed the window.
 */
function openMain(force = false): void {
  if (view !== "main" && !force) return;
  show("main", mainView());
}

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
  refreshButton.set({ disabled: on });
  shapeButtons();
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

/** Whether Equipment-EX is installed: its outfit slots are in TweakDB. Asked once a session. */
let equipmentEx: Promise<boolean> | undefined;
const hasEquipmentEx = () =>
  (equipmentEx ??= (async () => {
    try {
      return !!(await api.TweakDBInterface.GetAttachmentSlotRecord("OutfitSlots.Head"));
    } catch {
      return false;
    }
  })());

/**
 * Reads what V visibly wears, from the attachment slots on V's body (the base game's, and Equipment-EX's
 * when it is installed), and makes the main view's item buttons again. `soon`: just after a load, when the
 * game may not have dressed V yet, so a NotReady is passed on for readWornSoon to try again.
 */
async function readWorn(soon = false): Promise<void> {
  try {
    const t = Date.now();
    status.set({ text: "Reading what V wears...", tone: "dim" });
    const player = await api.GetPlayer(game.instance);
    if (!player) throw new NotReady("V is not in the world.");
    const ts = await api.GameInstance.GetTransactionSystem(game.instance);
    const gender = String(await player.GetResolvedGenderName());
    body = gender === "Female" ? "feminine" : gender === "Male" ? "masculine" : "any";
    const index = await getItems();
    const ex = await hasEquipmentEx();
    const restyled = readState().restyles;
    const found: Worn[] = [];
    for (const [slot, label] of [...BaseSlots, ...(ex ? ExSlots : [])]) {
      const item = await ts.GetItemInSlot(player, slot);
      const id = item ? ((await item.GetItemID()) as { id?: string } | null) : null;
      const hash = id?.id && !/^0x0+$/i.test(String(id.id)) ? String(id.id).toUpperCase().replace(/^0X/, "0x") : undefined;
      if (!hash || found.some((w) => w.hash === hash)) continue;
      found.push({ slot, label, hash, item: index.get(hash) });
    }
    if (soon && !found.length) throw new NotReady("V wears nothing yet.");
    worn = found;
    say(`V (${body} body) wears ${worn.length} item(s)${ex ? ", with Equipment-EX's slots" : ""}, read in ${seconds(t)}`);
    for (const w of worn) say(`  ${w.label}: ${w.item ? `${w.item.name ?? "(no name)"}, ${w.item.id}${restyled[w.item.id] ? `, restyled: ${restyled[w.item.id].words.join(", then ")}` : ""}` : `${w.hash}, not in EDGEmat's item index`}`);
    status.set({ text: "Pick a piece of clothing, then say how it should look. * marks one you restyled.", tone: "normal" });
    openMain();
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

/** A slot button's words: where V wears it, what it is, and * for an item restyled. */
function slotLabel(w: Worn): string {
  const name = w.item?.name ?? w.item?.id ?? "(not in the index)";
  return `${w.label}: ${name}${w.item && readState().restyles[w.item.id] ? " *" : ""}`;
}

/** Each slot button names what V wears there, with * for an item restyled. */
function labelSlots(): void {
  worn.forEach((w, i) => slotButtons[i]?.set({ label: slotLabel(w), disabled: busy || !w.item, variant: w.item ? "primary" : "ghost" }));
}

// ---------- one item's materials ----------

async function pick(i: number, quiet = false): Promise<void> {
  const w = worn[i];
  if (!w?.item || (busy && !quiet)) return;
  const item = w.item;
  try {
    const t = Date.now();
    current = undefined;
    shape = undefined;
    showShape();
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
      if (m.pattern) say(`      wears the pattern "${m.wears?.words ?? "?"}", repeat ${m.wears?.repeat ?? "?"}; the layers below are hidden under it`);
      for (const l of m.layers) say(`      layer ${l.layer}: ${l.surface}, ${l.color ?? "no color"}${l.share === undefined ? "" : `, ${l.share}%`}`);
    }
    for (const o of look.other) say(`    ${o}`);
    current = look;
    // A reshape started on this item before (its pictures and changes) is picked up where it was.
    shape = loadReshape(reshapeWork(look));
    showShape();
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
    'Answer with only one JSON object, no other text: {"materials": [{"setup": "<the setup as the context names it>", "edits": [{"layer": <index>, "surface": "<only if it changes>", "color": "<words, #rrggbb, or a preset of the layer\'s surface>", "roughness": "<optional words>", "microblend": "<optional>"}]}], "patterns": [{"setup": "<the setup>", "words": "<the pattern and its colors>", "repeat": <number>, "shine": "matte|satin|glossy"}], "notes": "<one or two plain sentences for the player>"}. Leave out patterns when the words ask for none.',
  ].join("\n");

/** What the planner gets: the item, V's body, and each layered material's shown layers. */
const planContext = (look: Look) => ({
  item: look.item,
  body: look.body,
  materials: look.materials.map((m) => ({ name: m.name, setup: m.setup, restyled: m.restyled || undefined, wears: m.pattern ? m.wears ?? {} : undefined, layers: m.layers })),
});

/** The JSON object in an answer, also when it is wrapped in a code block or a sentence. */
function parseRecipe(text: string): Recipe | undefined {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    const r = JSON.parse(text.slice(start, end + 1)) as Recipe;
    if (!Array.isArray(r.materials) && !Array.isArray(r.patterns)) return undefined;
    return { ...r, materials: Array.isArray(r.materials) ? r.materials : [] };
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
  for (const p of recipe.patterns ?? []) say(`  ${p.setup}: the pattern "${p.words}", repeat ${p.repeat ?? 4}, ${p.shine ?? "satin"}`);
  if (recipe.notes) say(`  Notes: ${recipe.notes}`);
  console.log(`recipe ${JSON.stringify(recipe)}`);
  return recipe;
}

// ---------- patterns ----------

/**
 * The player's key for an image service, through REDnode's shared keys: at once when this app is
 * allowed and a key is saved; else REDnode's own Key request window asks the player (to allow it, and
 * to paste a key when none is saved). Null when the player says no.
 */
async function imageKey(service: ImageService, why = `To make the pattern you asked for as a texture with ${ServiceNames[service]}, with your own key and credits`): Promise<string | null> {
  const key = await secrets.shared(service);
  if (key) return key;
  status.set({ text: `REDnode is asking for your ${service === "openai" ? "OpenAI" : "Gemini"} key, in its own window...`, tone: "dim" });
  say(`${ServiceNames[service]} needs your ${KeyHelp[service]}: REDnode asks for it in its own window`);
  return secrets.askShared(service, { reason: why });
}

/** A pattern's image from the chosen service: a seamless texture from its words, as PNG. */
const patternImage = (service: ImageService, key: string): PatternImage => async (words) => {
  const t = Date.now();
  status.set({ text: `${ServiceNames[service]} is making the pattern "${words}"...`, tone: "dim" });
  const img = await generateTexture(service, words, { key });
  say(`  ${ServiceNames[service]} (${img.model}) made "${words}" in ${seconds(t)}`);
  const png = await imageAsPng(await getBridge(), img.bytes, img.mime.includes("jpeg") ? ".jpg" : ".png");
  return { png, made: { service: service === "openai" ? "OpenAI" : "Google Gemini", model: img.model, prompt: img.prompt, words } };
};

// ---------- restyle, pack and swap ----------


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
  // Equipment-EX dresses the preview in its outfit slots too.
  for (const [slot] of [...BaseSlots, ...((await hasEquipmentEx()) ? ExSlots : [])]) {
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
    // The key before anything is written, so a pattern the player has no key for changes nothing.
    const patterns = recipe.patterns?.filter((p) => p?.setup && p?.words) ?? [];
    const service = patternService;
    const key = patterns.length ? await imageKey(service) : null;
    if (patterns.length && !key) {
      status.set({ text: `Patterns need your ${KeyHelp[service]}: nothing was changed. Try again to be asked once more.`, tone: "danger" });
      say(`No ${service === "openai" ? "OpenAI" : "Gemini"} key: nothing was changed`);
      return;
    }
    const r = await applyRecipe(await getBridge(), await getLibrary(), look, recipe, archiveDir, Suffix);
    for (const n of r.notes) say(`  ${n}`);
    const made = key ? await applyPatterns(await getBridge(), look, patterns, archiveDir, patternImage(service, key)) : undefined;
    for (const n of made?.notes ?? []) say(`  ${n}`);
    const written = [...r.written, ...(made?.written ?? [])];
    if (!r.changed.length && !made?.applied.length) {
      status.set({ text: `Nothing to change.${recipe.notes ? ` ${recipe.notes}` : ""}`, tone: "danger" });
      return;
    }
    const what = [...r.changed.map((c) => `${c.target}, layer(s) ${c.layers.join(", ")}`), ...(made?.applied ?? []).map((a) => `${a.material}: "${a.words}" x${a.repeat}`)];
    say(`Saved ${written.length} file(s) in ${seconds(t2)}: ${what.join("; ")}`);
    const s = readState();
    const had = s.restyles[look.item.id];
    const files = [...(had?.files ?? [])];
    for (const f of written) if (!files.some((x) => sameFile(x, f))) files.push(f);
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

// ---------- reshape ----------

/** The reshape of the picked item: its pictures and changes, kept in the work project's raw folder. */
let shape: ReshapeViews | undefined;
const rawDir = path.join(pkg.dataDir, "work", "source", "raw");
const reshapeWork = (look: Look) => path.join(rawDir, "edgemat", "reshape", materialSlug(`${look.item.id} ${look.body}`));
const tripoCredits = ReshapeDefaults.credits.model + ReshapeDefaults.credits.retopology;
/** Make it asks to be pressed twice: it spends the player's Tripo credits. */
let confirmMake = false;

function shapeButtons(): void {
  reshapeButton.set({ disabled: busy || !current });
  changeButton.set({ disabled: busy || !shape });
  backButton.set({ disabled: busy || !shape?.changes.length });
  makeButton.set({ disabled: busy || !shape?.changes.length || !shape.fit.ok, label: confirmMake ? `Sure? About ${tripoCredits} Tripo credits` : "Make it", variant: confirmMake ? "danger" : "ghost" });
}

/** The shape line and the pictures: the item as it is, and its latest change. */
function showShape(): void {
  const v = shape;
  const last = v?.changes.at(-1);
  if (!v || !current) {
    shapeText.set({ text: current ? "Press Reshape to see it from four sides." : "Pick a piece of clothing, then press Reshape to see it from four sides.", tone: "dim" });
    beforeImage?.set({ src: blank });
    afterImage?.set({ src: blank });
  } else {
    const now = last ? `changed: "${last.words}"${v.changes.length > 1 ? ` (${v.changes.length} changes)` : ""}` : "as it is; say how its shape should change";
    const can = v.fit.ok ? `Make it puts it on V (about ${tripoCredits} Tripo credits).` : `It can be changed in pictures, but not made yet: ${v.fit.why}.`;
    shapeText.set({ text: `${current.item.name ?? current.item.id}, ${now}. ${can}${canShow ? "" : ` Pictures: ${last?.sheet ?? v.sheet}`}`, tone: v.fit.ok ? "normal" : "dim" });
    // A path set again shows the file as it is now (REDnode serves it by its time and size).
    beforeImage?.set({ src: v.sheet });
    afterImage?.set({ src: last?.sheet ?? v.sheet });
  }
  shapeButtons();
}

/** The picked item drawn from four sides, in its look as V wears it: the start of a reshape. */
async function startReshape(): Promise<void> {
  const look = current;
  if (busy || !look) return;
  const t = Date.now();
  setBusy(true);
  try {
    status.set({ text: "Drawing it from four sides...", tone: "dim" });
    shape = await reshapeViews(await getBridge(), await getLibrary(), dir, look.meshes, { archive: archiveDir, raw: rawDir }, reshapeWork(look), { log: (l) => say(`  ${l}`) });
    say(`Reshape ${look.item.name ?? look.item.id}: drawn in ${seconds(t)}: ${shape.sheet}`);
    status.set({ text: shape.fit.ok ? "Say how its shape should change, and press Change." : `This one can be changed in pictures, not made yet: ${shape.fit.why}.`, tone: "normal" });
  } catch (e) {
    failed("Drawing it", e);
  } finally {
    setBusy(false);
    showShape();
  }
}

/** The pictures changed by words with GPT Image, building on the last change. */
async function changeShape(): Promise<void> {
  const look = current, v = shape, want = shapeWords.trim();
  if (busy || !look || !v) return;
  if (!want) return void status.set({ text: "Say how its shape should change first.", tone: "danger" });
  const t = Date.now();
  setBusy(true);
  try {
    const key = await imageKey("openai", "To change the pictures of your clothing with GPT Image, with your own key and credits");
    if (!key) return void status.set({ text: "Reshape's pictures need your OpenAI key: nothing was changed.", tone: "danger" });
    status.set({ text: `GPT Image is changing the pictures: "${want}"...`, tone: "dim" });
    const c = await reshapeChange(await getBridge(), v, want, { key, what: look.item.name ?? "garment", service: "openai", log: (l) => say(`  ${l}`) });
    say(`Changed in ${seconds(t)}: ${c.sheet}`);
    status.set({ text: v.fit.ok ? "Look at the pictures: change again, Back, or Make it." : "Look at the pictures: change again or Back.", tone: "accent" });
  } catch (e) {
    failed("Changing the pictures", e);
  } finally {
    setBusy(false);
    showShape();
  }
}

function backShape(): void {
  if (busy || !shape?.changes.length) return;
  const gone = reshapeBack(shape);
  say(`Back: "${gone?.words}" taken away`);
  confirmMake = false;
  showShape();
}

/**
 * The latest change made 3D by Tripo, fitted on V and swapped in. Asked twice, since it spends the
 * player's Tripo credits; recorded as a restyle, so Restore takes it away.
 */
async function makeShape(): Promise<void> {
  const look = current, v = shape, change = shape?.changes.at(-1);
  if (busy || !look || !v || !change || !v.fit.ok) return;
  if (!confirmMake) {
    confirmMake = true;
    shapeButtons();
    status.set({ text: `Make it spends about ${tripoCredits} of your Tripo credits and takes about 4 minutes: press it again to go ahead.`, tone: "dim" });
    setTimeout(() => {
      confirmMake = false;
      shapeButtons();
    }, 10_000);
    return;
  }
  confirmMake = false;
  const t = Date.now();
  setBusy(true);
  try {
    const key = (await secrets.shared("tripo")) ?? (await secrets.askShared("tripo", { reason: "To make a 3D model of your changed clothing with Tripo, with your own key and credits" }));
    if (!key) return void status.set({ text: "Make it needs your Tripo key: nothing was made.", tone: "danger" });
    const tripo = new Tripo(key, { log: (l) => say(`  ${l}`) });
    const made = await reshapeModel(tripo, v, change, {
      log: (l) => say(`  ${l}`),
      progress: (step, p) => status.set({ text: `Tripo is ${step === "model" ? "making the model" : "bringing it to the game's size"}: ${Math.round(p)}%...`, tone: "dim" }),
    });
    status.set({ text: "Fitting it on V...", tone: "dim" });
    const r = await reshapeFit(await getBridge(), v, change, made, { archive: archiveDir, raw: rawDir }, { folder: `edgemat\\reshape\\${materialSlug(change.words)}`, log: (l) => say(`  ${l}`) });
    for (const n of r.notes) say(`  ${n}`);
    say(`Made in ${seconds(t)} (${made.credits} Tripo credits): ${r.written.length} file(s)`);
    const s = readState();
    const had = s.restyles[look.item.id];
    const files = [...(had?.files ?? [])];
    for (const f of r.written) if (!files.some((x) => sameFile(x, f))) files.push(f);
    s.restyles[look.item.id] = { name: look.item.name, words: [...(had?.words ?? []), `reshaped: ${change.words}`], files, when: new Date().toISOString() };
    const kept = Object.values(s.restyles).flatMap((x) => x.files);
    for (const f of s.originals) if (!kept.some((x) => sameFile(x, f))) removeFile(f);
    s.originals = [];
    writeState(s);
    status.set({ text: "Packing and swapping it in...", tone: "dim" });
    await packAndSwap(look.item.id);
    status.set({ text: `Made and put on V in ${seconds(t)}. Restore takes it away.`, tone: "accent" });
    labelSlots();
    if (pickedSlot !== undefined) await pick(pickedSlot, true);
  } catch (e) {
    failed("Making it", e);
  } finally {
    setBusy(false);
    showShape();
  }
}

// ---------- keys ----------

/** The keys the app's features use, kept by REDnode for every EDGE tool. */
const KeyLines = (): { service: string; what: string; where: string }[] => [
  { service: "openai", what: "OpenAI: GPT Image makes patterns and Reshape's pictures", where: "platform.openai.com > API keys. A few US cents a pattern, a few tens of cents a picture" },
  { service: "tripo", what: "Tripo: makes Reshape's 3D models", where: "Tripo's developer console > API Keys. About 60 credits (US$0.60) a model" },
  ...(patternService === "gemini" ? [{ service: "gemini", what: "Google Gemini: makes patterns (your choice)", where: "aistudio.google.com > Get API key. A few US cents a pattern" }] : []),
];

/** Each key's state: whether this app has it (set, and allowed). A key saved but not yet allowed reads as missing. */
const keyReady = async () => {
  const lines = KeyLines();
  return { lines, ready: await Promise.all(lines.map(async (l) => !!(await secrets.shared(l.service).catch(() => null)))) };
};

/**
 * The keys view, in the main window (owner, 2026-11-02: the first view while a key is missing, so it is
 * not overlooked). Each key Ready or Needed, with Set, which opens REDnode's own Key request window (the
 * key is typed there, never in this app). When every key is Ready it goes on to the main view by itself;
 * Continue goes on without the missing ones (their features say so when pressed).
 */
async function openKeys(): Promise<void> {
  const { lines, ready } = await keyReady();
  const goOn = ui.button(ready.every(Boolean) ? "Continue" : "Continue without them", () => openMain(true), { variant: ready.every(Boolean) ? "primary" : "ghost" });
  const rows = lines.flatMap((l, i) => {
    const state = ui.text(ready[i] ? "Ready" : "Needed", { tone: ready[i] ? "accent" : "danger" });
    const set: UiNode<ButtonProps> = ui.button(ready[i] ? "Set" : "Set...", async () => {
      const key = await secrets.askShared(l.service, { reason: l.what });
      ready[i] = !!key;
      state.set(key ? { text: "Ready", tone: "accent" } : { text: "Needed", tone: "danger" });
      set.set({ disabled: !!key });
      if (ready.every(Boolean)) {
        say("Keys: every key is ready");
        openMain(true);
      } else goOn.set({ label: "Continue without them" });
    }, { variant: ready[i] ? "ghost" : "primary", disabled: ready[i] });
    return [ui.heading(l.what), ui.text(l.where, { tone: "dim" }), ui.row(state, set)];
  });
  show("keys", [
    ui.text("Wardrobe Designer uses AI services on your own accounts and credits. REDnode keeps the keys for every EDGE tool: Set opens REDnode's window, where you type the key. Wardrobe Designer never sees you type it.", { tone: "dim" }),
    ...rows,
    ui.text("REDagent plans every restyle with your Anthropic key, set in REDagent. Only restyling colors and fabrics? Then you need no key here.", { tone: "dim" }),
    goOn,
  ]);
}

// ---------- start ----------

// The first view: the keys while one is missing, else the main view. Keys reopens them any time.
void keyReady()
  .then(({ ready }) => (ready.every(Boolean) ? openMain(true) : openKeys()))
  .catch((e) => {
    console.log(`Keys: ${message(e)}`);
    openMain(true);
  });

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
