// Restyling a clothing item (design, "Wardrobe Designer", W1): the layered materials of the item's look
// for one body, read from a project's restyled copy when there is one, and a recipe of layer changes in
// words applied with mat_edit's checks. Each changed setup is saved beside the game's under a new name,
// with the look's meshes copied into the project and pointed at it. A print or pattern (W2) is a generated
// texture over the whole material instead (design, "Wardrobe Designer", step 6 (a)). Wardrobe Designer and
// the MCP tool mat_restyle both use this.

import * as fs from "node:fs";
import * as path from "node:path";
import { restoreMaterial } from "./apply";
import type { BridgeClient } from "./bridgeClient";
import { applyLayerEdit, patchFromWords, sameSetup, type LayerWords } from "./edit";
import { itemMaterials, namedMaterials, type ItemEntry, type ItemLook } from "./find";
import type { Library } from "./library";
import { makeMaterial, materialSlug, type MadeBy, type Shine } from "./material";
import { openSetup, readSetup, type SetupSource } from "./openSetup";
import { newPathFor, saveToProject } from "./project";

/** One shown layer of a look's material, in plain words, as the planner gets it. */
export interface LookLayer {
  layer: number;
  surface: string;
  surfacePath: string;
  color?: string;
  colorPreset?: string;
  /** How much of the texture the layer shows on, in percent. */
  share?: number;
}

export interface LookMaterial {
  /** The mesh material's name. */
  name: string;
  /** The game's setup, which the recipe names. */
  setup: string;
  /** Where its restyled copy goes (and is, when `restyled`). */
  target: string;
  restyled: boolean;
  mask?: string;
  /** The look's meshes that use it, which a restyle copies and points at the copy. */
  meshes: string[];
  /** Each of those meshes with its own name for the material (the bodies' meshes can differ). */
  uses: { mesh: string; material: string }[];
  /** The generated material a pattern put on it in the project, which its layers no longer show through. */
  pattern?: string;
  /** That pattern as it was made, from its record: what a change to it ("bigger dots") starts from. */
  wears?: { words?: string; repeat?: number; shine?: string };
  layers: LookLayer[];
}

export interface Look {
  item: { id: string; name: string | null; slot: string };
  /** The body the look is for, or "all" for every body's look together. */
  body: ItemLook["body"] | "all";
  /** The .app appearance the item uses for that body, or each body's. */
  appearance: string;
  meshes: { mesh: string; appearance: string }[];
  materials: LookMaterial[];
  /** Materials that are textured, not layered, or whose setup was not found: a restyle leaves them. */
  other: string[];
  warnings: string[];
}

/** A recipe: layer changes in words for each setup, as the planner answers and mat_restyle takes. */
export interface Recipe {
  materials: { setup: string; edits: ({ layer: number } & LayerWords)[] }[];
  /** Prints and patterns: a generated texture over a whole material. */
  patterns?: PatternPlan[];
  notes?: string;
}

/** A pattern over one material of the look, as the planner answers it. */
export interface PatternPlan {
  /** The material's setup, as the look names it. */
  setup: string;
  /** The pattern and its colors in words, for the image service ("bright yellow with large black polka dots"). */
  words: string;
  /** How many times the image repeats across the garment, 1 to 32: fewer is larger. Default 4. */
  repeat?: number;
  shine?: Shine;
}

/** An image for a pattern's words, as PNG, and how it was made: the caller's image service and key. */
export type PatternImage = (words: string) => Promise<{ png: Buffer; made: MadeBy }>;

export interface PatternResult {
  /** Each pattern put on: the game's setup it replaces, the material's name, and the generated .mi. */
  applied: { setup: string; material: string; mi: string; words: string; repeat: number }[];
  /** Files written, relative to the project's source\archive. */
  written: string[];
  notes: string[];
}

export interface RestyleResult {
  /** Each setup changed: the game's, its copy's game path, and the layers changed. */
  changed: { setup: string; target: string; layers: number[] }[];
  /** Files written, relative to the project's source\archive. */
  written: string[];
  notes: string[];
}

/**
 * The planner's brief for a restyle, with the look's materials as its context: Wardrobe Designer asks
 * REDagent with it, and mat_restyle's description says the same to assistants.
 */
export const RestyleBrief = [
  "Plan the restyle on the layers the item already has. The context lists each layered material with its shown layers: index, surface, color, color preset, and share of the texture (%).",
  "Change only what the words ask for. Words that name a new material ('denim', 'metal') change every layer that shows the old material the words replace (all the leather layers, holed or not); leave dirt, wear and small trim layers as they are unless the words name them.",
  "Prefer the game's own surfaces: if you have EDGEmat's tools (edgemat__mat_templates or mat_templates for surfaces, mat_colors for a surface's colors and finishes, mat_microblends), use them to pick real ones.",
  "Colors: plain words ('dark red', 'pale yellow') or #rrggbb always work; EDGEmat picks the closest preset of the layer's surface. A preset name only works on the surface you looked it up on, the new one when the surface changes.",
  "Each layer change may set: surface (a template's game path is safest; a material word such as 'denim' or 'leather' picks the game's plain version of it), color, roughness and metal (a finish in words, such as 'glossy' or 'rough'), bumps, microblend (a game path, a name, or 'plain'), tile and opacity (numbers).",
  "Prints and patterns (polka dots, stripes, checks, plaid, camo, florals, leopard): add an entry to patterns instead of layer edits for that material. A pattern is a generated texture over the whole material, replacing all of its layers (other fabrics, trims, dirt and wear on it), while the garment keeps its folds. So put it only on the material the words mean, usually the largest, and give that material no layer edits.",
  "A pattern's words describe only the pattern and its colors, for an image generator: 'bright yellow with large black polka dots', 'red and black tartan', 'green woodland camo'. Its repeat is how many times the image repeats across the garment's texture: 2 to 3 for large shapes, 4 by default, 8 or more for small ones. Its shine is matte, satin or glossy.",
  "A material with wears already wears a pattern: wears gives its words, repeat and shine, and its listed layers are hidden under it. To change that pattern ('bigger dots', 'make the dots blue'), give a new pattern that starts from wears' words and changes only what is asked: bigger means a smaller repeat, smaller a larger one, and the colors stay unless the words name new ones. When only the size or shine changes, give wears' words exactly as they are: the same picture is then kept, with no new image. Layer changes to it take the pattern off, so its layers show again with the colors listed. A logo or a picture in one place is not supported: say so in notes.",
].join("\n");

/** The words a recipe's layer change may use: mat_edit's, and nothing else. */
const WordKeys: (keyof LayerWords)[] = ["surface", "color", "roughness", "roughnessContrast", "metal", "metalContrast", "bumps", "tile", "offsetU", "offsetV", "opacity", "microblend", "microblendTile", "microblendContrast", "microblendNormalStrength"];

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Where a restyled copy of a project file is, and whether it is there. */
function inProject(archive: string | undefined, gamePath: string): string | undefined {
  const file = archive ? path.join(archive, gamePath) : undefined;
  return file && fs.existsSync(file) ? file : undefined;
}

/**
 * The item's look for `body` (the "any" look, else the first, when it has none for that body), or with
 * "all" every body's look together, and its layered materials in plain words, at most `max` of them.
 * With `archive`, a setup the project restyled (saved at `newPathFor(setup, suffix)`) is read from there,
 * so a second restyle starts from the first.
 */
export async function describeLook(bridge: BridgeClient, lib: Library, dir: string, item: ItemEntry, body: ItemLook["body"] | "all", options: { archive?: string; suffix: string; max?: number }): Promise<Look> {
  const found = await itemMaterials(bridge, item);
  const one = found.looks.find((l) => l.body === body) ?? found.looks.find((l) => l.body === "any") ?? found.looks[0];
  const looks = body === "all" ? found.looks : one ? [one] : [];
  if (!looks.length) throw new Error(`${item.name ?? item.id} has no look${body === "all" ? "" : ` for a ${body} body`}.`);
  const out: Look = {
    item: { id: item.id, name: item.name, slot: item.slot },
    body: body === "all" ? "all" : looks[0].body,
    appearance: looks.map((l) => l.appAppearance).join(", "),
    meshes: [],
    materials: [],
    other: [],
    warnings: [...found.warnings],
  };
  const max = options.max ?? 4;
  for (const mesh of looks.flatMap((l) => l.meshes)) {
    if (out.meshes.some((m) => same(m.mesh, mesh.mesh) && m.appearance === mesh.appearance)) continue;
    out.meshes.push({ mesh: mesh.mesh, appearance: mesh.appearance });
    const patterned = await patternsIn(bridge, options.archive, mesh.mesh, mesh.materials.map((m) => m.name));
    for (const use of mesh.materials) {
      if (!use.multilayered || !use.setup) {
        out.other.push(`${use.name}: ${use.multilayered ? "layered, no setup found" : "textured, not layered"}`);
        continue;
      }
      const had = out.materials.find((m) => same(m.setup, use.setup!));
      if (had) {
        if (!had.meshes.some((m) => same(m, mesh.mesh))) {
          had.meshes.push(mesh.mesh);
          had.uses.push({ mesh: mesh.mesh, material: use.name });
        }
        if (!had.pattern && patterned.get(use.name)) {
          had.pattern = patterned.get(use.name);
          had.wears = patternRecord(options.archive!, had.pattern!);
        }
        continue;
      }
      if (out.materials.length >= max) {
        out.other.push(`${use.name}: left out, past ${max} layered materials`);
        continue;
      }
      const target = newPathFor(use.setup, options.suffix);
      const copy = inProject(options.archive, target);
      const source: SetupSource = copy ? { file: copy, gamePath: target } : { gamePath: use.setup };
      const opened = await openSetup(bridge, lib, dir, source, use.mask);
      const layers = opened.info.layers
        .filter((l) => l.shown)
        .map((l) => ({ layer: l.index, surface: l.surface.title, surfacePath: l.surface.path, color: l.color?.plain, colorPreset: l.color?.name, share: l.share === undefined ? undefined : Math.round(l.share * 1000) / 10 }));
      out.materials.push({ name: use.name, setup: use.setup, target, restyled: !!copy, mask: use.mask, meshes: [mesh.mesh], uses: [{ mesh: mesh.mesh, material: use.name }], pattern: patterned.get(use.name), wears: patterned.get(use.name) ? patternRecord(options.archive!, patterned.get(use.name)!) : undefined, layers });
    }
  }
  return out;
}

/** The materials of a project's copy of a mesh that wear a generated material, by name, with its .mi. */
async function patternsIn(bridge: BridgeClient, archive: string | undefined, mesh: string, names: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!inProject(archive, mesh)) return out;
  for (const use of await namedMaterials(bridge, mesh, names, archive)) {
    const mi = use.instances.find((i) => /^edgemat\\materials\\/i.test(i));
    if (mi) out.set(use.name, mi);
  }
  return out;
}

/** How a pattern was made, from the record makeMaterial keeps beside it in source\raw. */
function patternRecord(archive: string, mi: string): LookMaterial["wears"] {
  const folder = path.win32.dirname(mi);
  const file = path.join(path.resolve(archive, "..", "raw"), folder, `${path.win32.basename(folder)}.edgemat.json`);
  try {
    const r = JSON.parse(fs.readFileSync(file, "utf8")) as { words?: string; repeat?: number; shine?: string };
    return { words: r.words, repeat: r.repeat, shine: r.shine };
  } catch {
    return {};
  }
}

/** The picture a pattern was made from and how, from source\raw beside it; undefined when it is gone. */
function patternSource(archive: string, mi: string): { png: Buffer; made: MadeBy } | undefined {
  const folder = path.win32.dirname(mi);
  const dir = path.join(path.resolve(archive, "..", "raw"), folder), slug = path.win32.basename(folder);
  try {
    const png = fs.readFileSync(path.join(dir, `${slug}_source.png`));
    const r = JSON.parse(fs.readFileSync(path.join(dir, `${slug}.edgemat.json`), "utf8")) as MadeBy;
    return { png, made: { service: r.service, model: r.model, prompt: r.prompt, words: r.words, file: r.file } };
  } catch {
    return undefined;
  }
}

/**
 * Applies a recipe to a look into the project at `archive`. Each layer change is checked as mat_edit
 * checks it; one that cannot be made is skipped and said in the notes, and the rest still go in. A setup
 * the recipe names but the look does not use is skipped too.
 */
export async function applyRecipe(bridge: BridgeClient, lib: Library, look: Look, recipe: Recipe, archive: string, suffix: string): Promise<RestyleResult> {
  const result: RestyleResult = { changed: [], written: [], notes: [] };
  for (const m of recipe.materials ?? []) {
    const material = look.materials.find((x) => same(x.setup, m.setup) || same(x.target, m.setup));
    if (!material) {
      result.notes.push(`Skipped ${m.setup}: ${look.item.name ?? look.item.id} does not use it.`);
      continue;
    }
    if (recipe.patterns?.some((p) => same(p.setup, material.setup) || same(p.setup, material.target))) {
      result.notes.push(`Skipped the layer changes to ${material.name}: the pattern replaces its layers.`);
      continue;
    }
    const copy = inProject(archive, material.target);
    const before = await readSetup(bridge, copy ? { file: copy, gamePath: material.target } : { gamePath: material.setup });
    let setup = before;
    const layers = new Set<number>();
    for (const e of m.edits ?? []) {
      const words: LayerWords = {};
      for (const k of WordKeys) if (e[k] !== undefined && e[k] !== null && e[k] !== "") (words as Record<string, unknown>)[k] = e[k];
      try {
        const w = patchFromWords(setup, e.layer, words, lib);
        const r = applyLayerEdit(setup, e.layer, w.patch, lib);
        setup = r.setup;
        layers.add(e.layer);
        result.notes.push(...w.notes, ...r.notes.map((n) => `Layer ${e.layer}: ${n}`));
      } catch (err) {
        result.notes.push(`Skipped layer ${e.layer} of ${material.name}: ${message(err)}`);
      }
    }
    // Layer changes to a patterned material take the pattern off, so its layers show again.
    const unpattern = !!material.pattern && layers.size > 0;
    if (sameSetup(before, setup) && !unpattern) continue;
    if (unpattern) {
      for (const u of material.uses) for (const f of await restoreMaterial(bridge, archive, u.mesh, u.material)) if (!result.written.includes(f)) result.written.push(f);
      const gone = dropPattern(archive, look, material);
      result.notes.push(`${material.name}: the pattern came off${gone ? ` (${gone} removed)` : ""}; its layers show again.`);
    }
    const saved = await saveToProject(bridge, { setup, archive, target: material.target, from: material.setup, meshes: material.meshes, suffix });
    for (const f of saved.written) if (!result.written.includes(f)) result.written.push(f);
    result.notes.push(...saved.notes);
    result.changed.push({ setup: material.setup, target: material.target, layers: [...layers].sort((a, b) => a - b) });
  }
  return result;
}

/**
 * Takes a material's pattern off the look and its files out of the project, unless another of the
 * look's materials still wears it or it is `keep` (a folder). Returns the folder removed.
 */
function dropPattern(archive: string, look: Look, material: LookMaterial, keep?: string): string | undefined {
  const old = material.pattern && path.win32.dirname(material.pattern);
  material.pattern = undefined;
  material.wears = undefined;
  if (!old || (keep && same(old, keep))) return undefined;
  if (look.materials.some((m) => m !== material && m.pattern && same(path.win32.dirname(m.pattern), old))) return undefined;
  fs.rmSync(path.join(archive, old), { recursive: true, force: true });
  return old;
}

/**
 * Puts each pattern on its material: an image from `image`, made into a generated material (Generate's
 * makeMaterial: seamless, the repeat baked in, the garment's own normal map kept) on every mesh of the
 * look that uses the material. A pattern that cannot be made is skipped and said in the notes.
 */
export async function applyPatterns(bridge: BridgeClient, look: Look, patterns: PatternPlan[], archive: string, image: PatternImage): Promise<PatternResult> {
  const result: PatternResult = { applied: [], written: [], notes: [] };
  for (const p of patterns) {
    const material = look.materials.find((x) => same(x.setup, p.setup) || same(x.target, p.setup));
    if (!material) {
      result.notes.push(`Skipped the pattern on ${p.setup}: ${look.item.name ?? look.item.id} does not use it.`);
      continue;
    }
    const words = String(p.words ?? "").trim();
    if (!words) {
      result.notes.push(`Skipped the pattern on ${material.name}: it has no words.`);
      continue;
    }
    const repeat = Math.min(32, Math.max(1, Math.round(Number(p.repeat) || 4)));
    const shine: Shine = p.shine === "matte" || p.shine === "glossy" ? p.shine : "satin";
    try {
      // The same words as the pattern it wears (only the repeat or shine changed): its picture is kept,
      // with no call to the image service.
      const kept = material.pattern && material.wears?.words?.trim().toLowerCase() === words.toLowerCase() ? patternSource(archive, material.pattern) : undefined;
      const { png, made } = kept ?? (await image(words));
      // The item in the name, so two items with the same words keep their own images.
      const name = `${materialSlug(look.item.id.replace(/^Items\./i, ""))} ${words}`;
      const r = await makeMaterial(bridge, archive, { name, image: png, repeat, shine, made }, material.uses);
      // The same folder as the pattern it wore: the old repeat's files go, so they are not packed.
      if (material.pattern && same(path.win32.dirname(material.pattern), r.folder)) {
        const dir = path.join(archive, r.folder);
        for (const f of fs.readdirSync(dir)) if (!r.written.some((w) => same(w, `${r.folder}\\${f}`))) fs.rmSync(path.join(dir, f), { force: true });
      }
      if (kept) {
        const changed = [material.wears?.repeat !== repeat ? `repeat ${repeat}` : "", material.wears?.shine !== shine ? shine : ""].filter(Boolean).join(", ");
        result.notes.push(`${material.name}: the same picture as before${changed ? `, now ${changed}` : ""}; the image service was not asked.`);
      }
      for (const f of r.written) if (!result.written.includes(f)) result.written.push(f);
      for (const a of r.applied) result.applied.push({ setup: material.setup, material: a.material, mi: a.mi, words, repeat });
      if (r.blended.length) result.notes.push(`${material.name}: the picture did not tile ${r.blended.join(" or ")}, so its edges were blended that way; a sharp pattern can look faded near them.`);
      if (r.applied.some((a) => a.how === "LayerTile")) result.notes.push(`${material.name}: no normal map of its own was found, so its folds are flat.`);
      const gone = dropPattern(archive, look, material, r.folder);
      if (gone) result.notes.push(`${material.name}: the pattern before it was removed (${gone}).`);
      material.pattern = r.applied[0]?.mi ?? material.pattern;
      material.wears = { words, repeat, shine };
    } catch (e) {
      result.notes.push(`Skipped the pattern on ${material.name}: ${message(e)}`);
    }
  }
  return result;
}
