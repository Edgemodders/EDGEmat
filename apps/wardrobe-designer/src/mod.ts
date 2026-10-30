// Wardrobe Designer, the W0 build (design, "Wardrobe Designer"): checks the steps the app needs before
// it changes anything. It reads what V wears and V's body from the game, finds each item in EDGEmat's
// item index, describes the picked item's layered materials with EDGEmat's core over REDnode's REDbridge,
// and asks REDagent for a restyle plan as a recipe. It writes nothing: W1 applies the recipe.

import * as zlib from "node:zlib";
import { agent, api, game, kernel, ui, type GameRef } from "rednode";
import type { BridgeClient } from "../../../extensions/edgemat/src/core/bridgeClient";
import { defaultCacheDir } from "../../../extensions/edgemat/src/core/config";
import { itemMaterials, loadItems, type ItemEntry, type ItemLook } from "../../../extensions/edgemat/src/core/find";
import { bridgeOver } from "../../../extensions/edgemat/src/core/kernelBridge";
import { loadLibrary } from "../../../extensions/edgemat/src/core/library";
import { openSetup } from "../../../extensions/edgemat/src/core/openSetup";

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

// EDGEmat's own cache, so the item index and the material library EDGEmat built are used again.
const dir = defaultCacheDir();

interface Worn {
  slot: string;
  label: string;
  item?: ItemEntry;
  /** The TweakDB id as the game gives it, when the item is not in the index. */
  hash?: string;
}

interface Described {
  item: { id: string; name: string | null; slot: string };
  body: ItemLook["body"];
  look?: { mesh: string; appearance: string };
  materials: { name: string; setup: string; layers: { layer: number; surface: string; surfacePath: string; color?: string; colorPreset?: string; share?: number }[] }[];
}

// ---------- the window ----------

const status = ui.text("Waiting for V to be in the world...", { tone: "dim" });
const slotButtons = Slots.map(([, label], i) => ui.button(label, () => void pick(i), { variant: "ghost", disabled: true }));
const picked = ui.text("Pick a piece of clothing V wears.", { tone: "dim" });
let words = "";
const wordsInput = ui.input({ label: "How should it look?", placeholder: "red leather, yellow denim...", onChange: (v) => (words = v), onSubmit: (v) => { words = v; void plan(); } });
const planButton = ui.button("Plan", () => void plan(), { disabled: true });
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
    ui.row(planButton, ui.button("Refresh", () => void readWorn(), { variant: "ghost" })),
    log,
  ],
});

const say = (line: string) => {
  log.push(line);
  console.log(line);
};
const seconds = (since: number) => `${((Date.now() - since) / 1000).toFixed(1)} s`;
const failed = (what: string, e: unknown) => {
  const message = e instanceof Error ? e.message : String(e);
  say(`${what} failed: ${message}`);
  status.set({ text: `${what} failed: ${message}`, tone: "danger" });
};

// ---------- REDbridge and the item index ----------

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

/** A TweakDB id as the game shows it: the name's length and its CRC32, as 0x + 16 hex digits. */
function tweakDbId(name: string): string {
  const crc = zlib.crc32(Buffer.from(name, "utf8")).toString(16).padStart(8, "0");
  return `0x${name.length.toString(16).padStart(8, "0")}${crc}`.toUpperCase().replace(/^0X/, "0x");
}

// ---------- what V wears ----------

let worn: Worn[] = [];
let body: ItemLook["body"] = "any";
let current: Described | undefined;

async function readWorn(): Promise<void> {
  try {
    const t = Date.now();
    status.set({ text: "Reading what V wears...", tone: "dim" });
    const player = await api.GetPlayer(game.instance);
    if (!player) throw new Error("V is not in the world.");
    const data = await api.EquipmentSystem.GetData(player);
    if (!data) throw new Error("The game gave no equipment data for V.");
    const gender = String(await player.GetResolvedGenderName());
    body = gender === "Female" ? "feminine" : gender === "Male" ? "masculine" : "any";
    const index = await getItems();
    worn = [];
    for (const [area, label] of Slots) {
      const id = (await (data as GameRef).$call("GetItemInEquipSlot;gamedataEquipmentAreaInt32", area, 0)) as { id?: string } | null;
      const hash = id?.id && !/^0x0+$/i.test(id.id) ? id.id.toUpperCase().replace(/^0X/, "0x") : undefined;
      worn.push({ slot: area, label, hash, item: hash ? index.get(hash) : undefined });
    }
    worn.forEach((w, i) => {
      const name = w.item?.name ?? w.item?.id ?? (w.hash ? "(not in the index)" : undefined);
      slotButtons[i].set({ label: name ? `${w.label}: ${name}` : `${w.label}: none`, disabled: !w.item, variant: w.item ? "primary" : "ghost" });
    });
    const count = worn.filter((w) => w.hash).length;
    say(`V (${body} body) wears ${count} item(s), read in ${seconds(t)}`);
    for (const w of worn) if (w.hash) say(`  ${w.label}: ${w.item ? `${w.item.name ?? "(no name)"}, ${w.item.id}` : `${w.hash}, not in EDGEmat's item index`}`);
    status.set({ text: "Pick a piece of clothing, then say how it should look.", tone: "normal" });
  } catch (e) {
    failed("Reading what V wears", e);
  }
}

// ---------- one item's materials ----------

async function pick(i: number): Promise<void> {
  const w = worn[i];
  if (!w?.item) return;
  const item = w.item;
  try {
    const t = Date.now();
    current = undefined;
    planButton.set({ disabled: true });
    picked.set({ text: `${item.name ?? item.id}: reading its materials...`, tone: "dim" });
    const b = await getBridge();
    const found = await itemMaterials(b, item);
    for (const warning of found.warnings) say(`  ${warning}`);
    const look = found.looks.find((l) => l.body === body) ?? found.looks.find((l) => l.body === "any") ?? found.looks[0];
    const described: Described = { item: { id: item.id, name: item.name, slot: w.label }, body, materials: [] };
    if (!look) throw new Error(`No look of ${item.id} for a ${body} body.`);
    const lib = loadLibrary(dir);
    say(`${item.name ?? item.id} (${item.id}), ${look.body} look ${look.appAppearance}: ${look.meshes.length} mesh(es)`);
    for (const mesh of look.meshes) {
      described.look ??= { mesh: mesh.mesh, appearance: mesh.appearance };
      say(`  ${mesh.mesh}, look ${mesh.appearance}`);
      for (const use of mesh.materials) {
        if (!use.multilayered || !use.setup) {
          say(`    ${use.name}: ${use.multilayered ? "layered, no setup found" : "textured, not layered"}`);
          continue;
        }
        if (described.materials.length >= MaxMaterials || described.materials.some((m) => m.setup === use.setup)) continue;
        const opened = await openSetup(b, lib, dir, { gamePath: use.setup }, use.mask);
        const layers = opened.info.layers.filter((l) => l.shown).map((l) => ({
          layer: l.index,
          surface: l.surface.title,
          surfacePath: l.surface.path,
          color: l.color?.plain,
          colorPreset: l.color?.name,
          share: l.share === undefined ? undefined : Math.round(l.share * 1000) / 10,
        }));
        described.materials.push({ name: use.name, setup: use.setup, layers });
        say(`    ${use.name}: ${use.setup}`);
        for (const l of layers) say(`      layer ${l.layer}: ${l.surface}, ${l.color ?? "no color"}${l.share === undefined ? "" : `, ${l.share}%`}`);
      }
    }
    current = described;
    picked.set({ text: `${item.name ?? item.id}: ${described.materials.length} layered material(s), read in ${seconds(t)}`, tone: "normal" });
    say(`Read in ${seconds(t)}`);
    planButton.set({ disabled: !described.materials.length });
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
    "The context holds the item, V's body, and each layered material the item uses with its shown layers: index, surface, color and share of the texture (%).",
    "Plan the restyle on these layers. Prefer the game's own surfaces and their color presets: if you have EDGEmat's tools (edgemat__mat_templates, edgemat__mat_colors, edgemat__mat_microblends, edgemat__mat_describe), use them to pick real surfaces and colors. Change only what the words ask for; leave the other layers as they are.",
    "If the words ask for a print or pattern (dots, stripes, camo, a logo), say so in notes: patterns are not supported yet.",
    'Answer with only one JSON object, no other text: {"materials": [{"setup": "<setup game path>", "edits": [{"layer": <index>, "surface": "<template path or name, only if it changes>", "color": "<preset name or plain color words>", "roughness": "<optional words>", "microblend": "<optional>"}]}], "notes": "<one or two plain sentences for the player>"}',
  ].join("\n");

async function plan(): Promise<void> {
  const want = words.trim();
  if (!current) return void status.set({ text: "Pick a piece of clothing first.", tone: "danger" });
  if (!want) return void status.set({ text: "Say how it should look first.", tone: "danger" });
  const t = Date.now();
  planButton.set({ disabled: true });
  status.set({ text: "Asking REDagent for a plan...", tone: "dim" });
  say(`Plan: "${want}" for ${current.item.name ?? current.item.id}`);
  let text = "";
  try {
    const answer = await agent.ask(PlanPrompt(want), { context: current, onText: (piece) => (text += piece) });
    say(`REDagent answered in ${seconds(t)}, $${answer.cost.toFixed(3)}`);
    const recipe = parseRecipe(answer.text || text);
    if (!recipe) {
      say("The answer was not a JSON recipe:");
      for (const line of (answer.text || text).split(/\r?\n/)) say(`  ${line}`);
      status.set({ text: "REDagent did not answer with a recipe (see the log).", tone: "danger" });
      return;
    }
    for (const m of recipe.materials ?? []) {
      say(`  ${m.setup}`);
      for (const e of m.edits ?? []) say(`    layer ${e.layer}: ${Object.entries(e).filter(([k]) => k !== "layer").map(([k, v]) => `${k} ${v}`).join(", ")}`);
    }
    if (recipe.notes) say(`  Notes: ${recipe.notes}`);
    console.log(`recipe ${JSON.stringify(recipe)}`);
    status.set({ text: "A plan is ready (see the log). This W0 build does not apply it yet.", tone: "accent" });
  } catch (e) {
    failed("Asking REDagent", e);
  } finally {
    planButton.set({ disabled: false });
  }
}

interface Recipe {
  materials?: { setup: string; edits?: ({ layer: number } & Record<string, unknown>)[] }[];
  notes?: string;
}

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

// ---------- start ----------

let started = false;
game.onState((s) => {
  if (s.world && !started) {
    started = true;
    void readWorn();
  }
  if (!s.world) started = false;
});
void game.state().then((s) => {
  if (s.world && !started) {
    started = true;
    void readWorn();
  }
});
