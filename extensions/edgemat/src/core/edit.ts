// Editing a multilayered setup (M3): a change to one layer, checked against its surface's presets as the
// behavior spec asks (sections 2, 9 and 10); plain words turned into preset names, for assistants; and
// the setup written as WolvenKit JSON in the current shape, keeping every field it does not edit.

import { parseColor } from "./colors";
import { PresetKinds, searchMicroblends, type Library, type PresetKind, type Template } from "./library";
import { LayerFields, PathFields, type Setup, type SetupLayer } from "./setup";
import { describeSurface, findSurface, nearestColors, type PresetInfo } from "./surface";

type Json = Record<string, any>;

/** A change to one layer, in the game's own field names. `overrides` is kept as read, never edited (spec, section 9). */
export type LayerPatch = Partial<Omit<SetupLayer, "overrides">>;

export interface EditResult {
  setup: Setup;
  /** What else changed, in plain words, such as presets reset by a new surface. */
  notes: string[];
}

/** Each preset kind in plain words. */
export const PresetWhat: Record<PresetKind, string> = {
  colorScale: "color",
  normalStrength: "bumps",
  roughLevelsIn: "roughness contrast",
  roughLevelsOut: "roughness",
  metalLevelsIn: "metal contrast",
  metalLevelsOut: "metal",
};

/** The numbers a field may take: the ranges the game's own setups use (spec, section 2), with room around them. */
const Ranges: Partial<Record<keyof SetupLayer, [number, number]>> = {
  matTile: [0, 1000],
  offsetU: [-10, 10],
  offsetV: [-10, 10],
  opacity: [0, 4],
  mbTile: [0, 1000],
  microblendContrast: [0, 1],
  microblendNormalStrength: [-10, 10],
  microblendOffsetU: [-10, 10],
  microblendOffsetV: [-10, 10],
};

export const DefaultMicroblend = "base\\surfaces\\microblends\\default.xbm";

const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export function templateOf(lib: Library | undefined, p: string): Template | undefined {
  const k = p.toLowerCase();
  return lib?.templates.find((t) => t.path.toLowerCase() === k);
}

export function presetNames(t: Template, kind: PresetKind): string[] {
  if (kind === "colorScale") return t.colors.map((c) => c.name);
  if (kind === "normalStrength") return t.normalStrength.map((p) => p.name);
  return t[kind].map((p) => p.name);
}

/**
 * One layer changed. A new surface resets the layer's six presets to that surface's defaults, unless the
 * patch names them too. A preset name must be one of the surface's own, and is never None. Numbers stay
 * in the ranges the game uses. Throws with a plain message when the change is not allowed.
 */
export function applyLayerEdit(setup: Setup, index: number, patch: LayerPatch, lib?: Library): EditResult {
  if (!Number.isInteger(index) || index < 0 || index >= setup.layers.length) {
    throw new Error(`There is no layer ${index}: this setup has layers 0 to ${setup.layers.length - 1}.`);
  }
  const notes: string[] = [];
  const was = setup.layers[index];
  const layer: SetupLayer = { ...was };
  for (const [k, value] of Object.entries(patch) as [keyof SetupLayer, unknown][]) {
    if (value === undefined) continue;
    if (!LayerFields.includes(k) || k === "overrides") throw new Error(`"${k}" is not a layer field EDGEmat edits.`);
    const range = Ranges[k];
    if (range) {
      const n = Number(value);
      if (!Number.isFinite(n)) throw new Error(`${k} must be a number.`);
      if (n < range[0] || n > range[1]) throw new Error(`${k} ${n} is outside ${range[0]} to ${range[1]}, the range the game's setups use.`);
      (layer as unknown as Record<string, unknown>)[k] = n;
    } else {
      (layer as unknown as Record<string, unknown>)[k] = String(value).trim();
    }
  }

  if (patch.material !== undefined && layer.material.toLowerCase() !== was.material.toLowerCase()) {
    if (!/\.mltemplate$/i.test(layer.material)) throw new Error(`A surface is an .mltemplate file, not ${layer.material || "nothing"}.`);
    const t = templateOf(lib, layer.material);
    if (lib && !t) notes.push(`${layer.material} is not in the library (a custom or missing surface), so the layer's presets were kept.`);
    if (t) {
      const reset: string[] = [];
      for (const kind of PresetKinds) {
        if (patch[kind] !== undefined) continue;
        const names = presetNames(t, kind);
        const def = t.defaults[kind];
        const pick = def && names.includes(def) ? def : names.includes(layer[kind]) ? layer[kind] : names[0];
        if (pick && pick !== layer[kind]) {
          layer[kind] = pick;
          reset.push(PresetWhat[kind]);
        }
      }
      if (reset.length) notes.push(`New surface, ${t.title}: its ${list(reset)} were set to the surface's defaults.`);
    }
  }

  const t = templateOf(lib, layer.material);
  for (const kind of PresetKinds) {
    if (patch[kind] === undefined) continue;
    const name = layer[kind];
    if (name === "None" || !name) throw new Error("EDGEmat never writes None into a preset name: a layer whose names are all None is not drawn at all.");
    if (t && !presetNames(t, kind).includes(name)) throw new Error(`"${name}" is not one of ${t.title}'s ${PresetWhat[kind]} presets.`);
  }
  if (patch.microblend !== undefined && layer.microblend) {
    if (!/\.xbm$/i.test(layer.microblend)) throw new Error(`A microblend is an .xbm texture, not ${layer.microblend}.`);
    if (lib && !lib.microblends.some((m) => m.path.toLowerCase() === layer.microblend.toLowerCase())) notes.push(`${layer.microblend} is not one of the library's microblends.`);
  }

  const layers = setup.layers.slice();
  layers[index] = layer;
  return { setup: { ...setup, layers }, notes };
}

/** Whether two setups hold the same values: an edit that changes nothing is not an edit. */
export function sameSetup(a: Setup, b: Setup): boolean {
  return a.ratio === b.ratio && a.useNormal === b.useNormal && a.layers.length === b.layers.length && a.layers.every((l, i) => LayerFields.every((k) => l[k] === b.layers[i][k]));
}

// ---- plain words, for assistants -------------------------------------------------------------------

/** A layer change as an assistant says it: surfaces, presets and microblends by words or names. */
export interface LayerWords {
  /** A surface's game path, name, or words that fit one surface ("leather glossy"). */
  surface?: string;
  /** A color preset's name, or a color in words ("dark red"), #rrggbb or "r g b": the surface's closest preset is used. */
  color?: string;
  roughness?: string;
  roughnessContrast?: string;
  metal?: string;
  metalContrast?: string;
  bumps?: string;
  /** The layer's own tiling (matTile); the surface multiplies it by its own factor. */
  tile?: number;
  offsetU?: number;
  offsetV?: number;
  opacity?: number;
  /** A microblend's game path, name or words; "plain" or "none" for the default one. */
  microblend?: string;
  microblendTile?: number;
  microblendContrast?: number;
  microblendNormalStrength?: number;
}

/** A finish in words, as the roughness it means (the middles of surface.ts's words). */
const Finish: [RegExp, number][] = [
  [/^(glossy|glossier|gloss|polished|mirror|chrome|wet|lacquered)$/, 0.07],
  [/^(shiny|shinier|shine|sheen|smooth)$/, 0.25],
  [/^(satin|silky|semi|semi-gloss)$/, 0.45],
  [/^(matte|matt|matter|dull|flat)$/, 0.65],
  [/^(rough|rougher|coarse)$/, 0.88],
];

/** The roughness a preset gives where its map is mid grey, from its raw "scale s, bias b". */
function roughnessOf(p: PresetInfo): number | undefined {
  const m = p.raw.match(/scale (-?[\d.]+), bias (-?[\d.]+)/);
  return m ? Number(m[2]) + Number(m[1]) / 2 : undefined;
}

function presetByWords(list: PresetInfo[], words: string, what: string, title: string, notes?: string[], index?: number): string {
  const w = words.trim().toLowerCase();
  const exact = list.find((p) => p.name.toLowerCase() === w);
  if (exact) return exact.name;
  const fits = list.filter((p) => p.plain.toLowerCase().includes(w));
  const pick = fits.find((p) => p.isDefault) ?? fits[0];
  if (pick) return pick.name;
  // A finish the surface has no preset named for ("glossy" where the shiniest is "mostly shiny"): the closest.
  const want = what === PresetWhat.roughLevelsOut ? w.split(/[\s,]+/).map((x) => Finish.find(([re]) => re.test(x))?.[1]).find((v) => v !== undefined) : undefined;
  if (want !== undefined) {
    const near = list
      .map((p) => ({ p, v: roughnessOf(p) }))
      .filter((x): x is { p: PresetInfo; v: number } => x.v !== undefined && !/inverted|as the texture/.test(x.p.plain))
      .sort((a, b) => Math.abs(a.v - want) - Math.abs(b.v - want))[0];
    if (near) {
      notes?.push(`Layer ${index}: ${title} has no ${what} like "${words}"; used the closest, ${near.p.plain} (${near.p.name}).`);
      return near.p.name;
    }
  }
  const offered = [...new Set(list.map((p) => p.plain))];
  throw new Error(`${title} has no ${what} preset like "${words}". It offers: ${offered.slice(0, 20).join("; ")}.`);
}

/**
 * A surface for words that fit several: the game's plain version of that material ("denim" to
 * denim_clean_01_30), not a custom, patterned or worn one. Undefined when none stands out.
 */
function plainSurface(candidates: Template[]): Template | undefined {
  const plain = candidates.filter((t) => !/\\custom\\/i.test(t.path) && /_clean_/i.test(t.name));
  // The _01_30 version first: the one the game's clothing uses (denim_clean_01_30, not denim_clean_02).
  const rank = (t: Template) => (/_clean_01_30$/i.test(t.name) ? 0 : 1);
  return plain.length ? [...plain].sort((a, b) => rank(a) - rank(b) || a.name.length - b.name.length || a.name.localeCompare(b.name))[0] : undefined;
}

/** A layer change in words, turned into the game's names: what EDGEmat's MCP tool mat_edit takes. */
export function patchFromWords(setup: Setup, index: number, w: LayerWords, lib: Library): { patch: LayerPatch; notes: string[] } {
  const layer = setup.layers[index];
  if (!layer) throw new Error(`There is no layer ${index}: this setup has layers 0 to ${setup.layers.length - 1}.`);
  const patch: LayerPatch = {};
  const notes: string[] = [];
  let t = templateOf(lib, layer.material);
  if (w.surface !== undefined) {
    const found = findSurface(lib, w.surface);
    const c = found.candidates;
    const plain = found.template ? undefined : plainSurface(c);
    if (!found.template && !plain) {
      throw new Error(c.length ? `"${w.surface}" fits ${c.length} surfaces, such as ${c.slice(0, 8).map((x) => x.path).join(", ")}. Name one.` : `No surface fits "${w.surface}". Try mat_templates.`);
    }
    if (plain) notes.push(`Layer ${index}: "${w.surface}" fits ${c.length} surfaces; used the plain one, ${plain.title} (${plain.path}).`);
    t = (found.template ?? plain)!;
    patch.material = t.path;
  }
  const words: [keyof LayerWords, PresetKind][] = [["roughness", "roughLevelsOut"], ["roughnessContrast", "roughLevelsIn"], ["metal", "metalLevelsOut"], ["metalContrast", "metalLevelsIn"], ["bumps", "normalStrength"]];
  if (w.color !== undefined || words.some(([k]) => w[k] !== undefined)) {
    if (!t) throw new Error(`Layer ${index}'s surface (${layer.material || "none"}) is not in the library, so its presets cannot be looked up.`);
    const info = describeSurface(t);
    if (w.color !== undefined) {
      const exact = info.colors.find((c) => c.name.toLowerCase() === w.color!.trim().toLowerCase());
      if (exact) patch.colorScale = exact.name;
      else {
        const target = parseColor(w.color);
        if (!target) throw new Error(`"${w.color}" is not a color EDGEmat reads: use words such as "dark red", #rrggbb, or "r g b".`);
        const near = nearestColors(info, target, 1)[0];
        if (!near) throw new Error(`${t.title} has no colors.`);
        patch.colorScale = near.name;
        notes.push(`Layer ${index}: the closest to "${w.color}" on ${t.title} is ${near.plain} (${near.name}, distance ${near.distance}${near.distance > 0.1 ? ", clearly different: this surface has nothing closer" : ""}).`);
      }
    }
    const lists: Record<string, PresetInfo[]> = { roughLevelsOut: info.roughness, roughLevelsIn: info.roughnessContrast, metalLevelsOut: info.metal, metalLevelsIn: info.metalContrast, normalStrength: info.bumps };
    for (const [k, kind] of words) {
      const v = w[k];
      if (typeof v === "string") patch[kind] = presetByWords(lists[kind], v, PresetWhat[kind], t.title, notes, index);
    }
  }
  if (w.microblend !== undefined) {
    const q = w.microblend.trim();
    if (/^(plain|none|default)$/i.test(q)) patch.microblend = DefaultMicroblend;
    else {
      const k = q.toLowerCase().replace(/\//g, "\\");
      const exact = lib.microblends.find((m) => m.path.toLowerCase() === k || m.name.toLowerCase() === k);
      const found = exact ? [exact] : searchMicroblends(lib, q);
      if (!found.length) throw new Error(`No microblend fits "${w.microblend}". Try mat_microblends.`);
      patch.microblend = found[0].path;
      if (found.length > 1) notes.push(`Layer ${index}: "${w.microblend}" fits ${found.length} microblends; used ${found[0].name}.`);
    }
  }
  const numbers: [keyof LayerWords, keyof LayerPatch][] = [["tile", "matTile"], ["offsetU", "offsetU"], ["offsetV", "offsetV"], ["opacity", "opacity"], ["microblendTile", "mbTile"], ["microblendContrast", "microblendContrast"], ["microblendNormalStrength", "microblendNormalStrength"]];
  for (const [k, field] of numbers) if (w[k] !== undefined) (patch as Record<string, unknown>)[field] = w[k];
  return { patch, notes };
}

// ---- writing --------------------------------------------------------------------------------------

const cname = (v: string) => ({ $type: "CName", $storage: "string", $value: v });
const resourcePath = (v: string) =>
  v ? { DepotPath: { $type: "ResourcePath", $storage: "string", $value: v }, Flags: "Default" } : { DepotPath: { $type: "ResourcePath", $storage: "uint64", $value: "0" }, Flags: "Default" };

function layerJson(l: SetupLayer, base?: Json): Json {
  const out: Json = base ? structuredClone(base) : { $type: "Multilayer_Layer" };
  for (const k of LayerFields) {
    const v = l[k];
    out[k] = (PathFields as readonly string[]).includes(k) ? resourcePath(String(v)) : typeof v === "number" ? v : cname(v);
  }
  return out;
}

/**
 * The setup as WolvenKit JSON in the current shape, for REDbridge's cr2w.fromJson. A setup read from
 * current-shape JSON keeps every field it does not edit; one read from an older shape is written fresh.
 */
export function setupToJson(setup: Setup): Json {
  const src = setup.json;
  if (src) {
    const j = structuredClone(src);
    const root = j.Data.RootChunk;
    const before: Json[] = root.layers;
    root.layers = setup.layers.map((l, i) => layerJson(l, before[i]));
    root.ratio = setup.ratio;
    root.useNormal = setup.useNormal ? 1 : 0;
    return j;
  }
  return {
    Header: { WolvenKitVersion: "9.1.0", WKitJsonVersion: "0.0.9", GameVersion: 2310, DataType: "CR2W" },
    Data: {
      Version: 195,
      BuildVersion: 0,
      RootChunk: { $type: "Multilayer_Setup", cookingPlatform: "PLATFORM_PC", layers: setup.layers.map((l) => layerJson(l)), ratio: setup.ratio, useNormal: setup.useNormal ? 1 : 0 },
      EmbeddedFiles: [],
    },
  };
}
