// Restyling a clothing item (design, "Wardrobe Designer", W1): the layered materials of the item's look
// for one body, read from a project's restyled copy when there is one, and a recipe of layer changes in
// words applied with mat_edit's checks. Each changed setup is saved beside the game's under a new name,
// with the look's meshes copied into the project and pointed at it. Wardrobe Designer and the MCP tool
// mat_restyle both use this.

import * as fs from "node:fs";
import * as path from "node:path";
import type { BridgeClient } from "./bridgeClient";
import { applyLayerEdit, patchFromWords, sameSetup, type LayerWords } from "./edit";
import { itemMaterials, type ItemEntry, type ItemLook } from "./find";
import type { Library } from "./library";
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
  notes?: string;
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
  "Each layer change may set: surface (a template's game path or name), color, roughness and metal (a finish in words, such as 'glossy' or 'rough'), bumps, microblend (a game path, a name, or 'plain'), tile and opacity (numbers).",
  "Prints and patterns (dots, stripes, camo, a logo) are not supported yet: give the base color the words ask for and say so in notes.",
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
    for (const use of mesh.materials) {
      if (!use.multilayered || !use.setup) {
        out.other.push(`${use.name}: ${use.multilayered ? "layered, no setup found" : "textured, not layered"}`);
        continue;
      }
      const had = out.materials.find((m) => same(m.setup, use.setup!));
      if (had) {
        if (!had.meshes.some((m) => same(m, mesh.mesh))) had.meshes.push(mesh.mesh);
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
      out.materials.push({ name: use.name, setup: use.setup, target, restyled: !!copy, mask: use.mask, meshes: [mesh.mesh], layers });
    }
  }
  return out;
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
    if (sameSetup(before, setup)) continue;
    const saved = await saveToProject(bridge, { setup, archive, target: material.target, from: material.setup, meshes: material.meshes, suffix });
    result.written.push(...saved.written);
    result.notes.push(...saved.notes);
    result.changed.push({ setup: material.setup, target: material.target, layers: [...layers].sort((a, b) => a - b) });
  }
  return result;
}
