// A multilayered setup (.mlsetup) read from WolvenKit JSON and described in plain words: each layer's
// surface, color, finish and microblend, whether it shows, and what looks wrong. Field meanings and the
// three JSON shapes are in the behavior spec, sections 2 and 6.

import { jsonValue, type Library, type Template } from "./library";
import { describeSurface, type ColorInfo, type PresetInfo, type SurfaceInfo } from "./surface";

export interface SetupLayer {
  material: string;
  colorScale: string;
  matTile: number;
  offsetU: number;
  offsetV: number;
  opacity: number;
  normalStrength: string;
  roughLevelsIn: string;
  roughLevelsOut: string;
  metalLevelsIn: string;
  metalLevelsOut: string;
  microblend: string;
  mbTile: number;
  microblendContrast: number;
  microblendNormalStrength: number;
  microblendOffsetU: number;
  microblendOffsetV: number;
  overrides: string;
}

export interface Setup {
  /** WolvenKit's JSON version, or "oldest" / "0.0.1" for the older shapes. */
  jsonVersion: string;
  ratio: number;
  useNormal: boolean;
  layers: SetupLayer[];
  /** The WolvenKit JSON it was read from, in the current shape only: saving keeps every field it does not edit (edit.ts). */
  json?: Json;
}

type Json = Record<string, any>;

// Engine defaults: what the binary leaves out (spec, section 2).
const LayerDefaults: SetupLayer = {
  material: "", colorScale: "None", matTile: 1, offsetU: 0, offsetV: 0, opacity: 1, normalStrength: "None", roughLevelsIn: "None",
  roughLevelsOut: "None", metalLevelsIn: "None", metalLevelsOut: "None", microblend: "", mbTile: 1, microblendContrast: 0.5,
  microblendNormalStrength: 1, microblendOffsetU: 0, microblendOffsetV: 0, overrides: "None",
};

/** The layer fields that hold a game path; the others are numbers or preset names. */
export const PathFields = ["material", "microblend"] as const;

/** Every layer field, with its engine default. */
export const LayerFields = Object.keys(LayerDefaults) as (keyof SetupLayer)[];
export const layerDefault = <K extends keyof SetupLayer>(k: K): SetupLayer[K] => LayerDefaults[k];

/** A setup from WolvenKit JSON in any of its three shapes: current (0.0.2 and later), 0.0.1, and the oldest. */
export function parseSetup(json: Json): Setup {
  let root: Json | undefined, layers: Json[] | undefined, version: string;
  if (json.Data?.RootChunk?.layers) {
    root = json.Data.RootChunk;
    layers = root!.layers;
    version = json.Header?.WKitJsonVersion ?? "current";
  } else if (json.Data?.RootChunk?.Properties?.layers) {
    root = json.Data.RootChunk.Properties;
    layers = root!.layers.map((l: Json) => l.Properties ?? l);
    version = json.Header?.WKitJsonVersion ?? "0.0.1";
  } else if (json.Chunks?.[0]?.Properties?.layers) {
    root = json.Chunks[0].Properties;
    layers = root!.layers.map((l: Json) => l.Properties ?? l);
    version = "oldest";
  } else {
    throw new Error("This is not a multilayered setup: no layers found.");
  }
  const read = (l: Json): SetupLayer => {
    const out = { ...LayerDefaults };
    for (const k of Object.keys(LayerDefaults) as (keyof SetupLayer)[]) {
      const v = jsonValue(l[k]);
      if (v !== undefined && v !== null) (out as any)[k] = typeof LayerDefaults[k] === "number" ? Number(v) : String(v);
    }
    // An empty path is written as the hash 0.
    for (const k of PathFields) if (out[k] === "0") out[k] = "";
    return out;
  };
  return {
    jsonVersion: version,
    ratio: Number(jsonValue(root!.ratio) ?? 1),
    useNormal: ![false, 0, "0", "false"].includes(jsonValue(root!.useNormal)),
    layers: layers!.map(read),
    json: json.Data?.RootChunk?.layers ? json : undefined,
  };
}

// ---- in plain words ------------------------------------------------------------------------------

export interface LayerInfo {
  index: number;
  shown: boolean;
  /** Why the layer does not show, in plain words. */
  hidden?: string;
  surface: { path: string; title: string; category: string; found: boolean; unused: boolean };
  color?: ColorInfo;
  roughness?: PresetInfo;
  roughnessContrast?: PresetInfo;
  metal?: PresetInfo;
  metalContrast?: PresetInfo;
  bumps?: PresetInfo;
  /** The surface tiling: the layer's matTile times the surface's own tiling multiplier. */
  tiling: number;
  opacity: string;
  microblend: { path: string; name: string; plain: boolean; tile: number; contrast: number; normalStrength: number };
  /** Things that look wrong, in plain words. */
  warnings: string[];
  /** Share of the texture where this layer is what shows, 0 to 1, when the mask is known. */
  share?: number;
  raw: SetupLayer;
}

export interface SetupInfo {
  ratio: number;
  useNormal: boolean;
  jsonVersion: string;
  layers: LayerInfo[];
  shownCount: number;
  warnings: string[];
}

const UnusedTemplate = /\\special\\unused\.mltemplate$/i;
const DefaultMicroblend = /\\microblends\\default\.xbm$/i;
const n3 = (v: number) => String(Math.round(v * 1000) / 1000);
const fileTitle = (p: string) => (p.split("\\").pop() ?? p).replace(/\.[^.]+$/, "").replace(/_/g, " ");

function preset(list: PresetInfo[] | undefined, name: string, what: string, warnings: string[]): PresetInfo | undefined {
  if (!list) return undefined;
  const found = list.find((p) => p.name === name);
  if (found) return found;
  if (name !== "None") warnings.push(`Its ${what} "${name}" is not one of the surface's presets.`);
  return { name, plain: name === "None" ? "none set" : "not in this surface", raw: "", isDefault: false };
}

function opacityWords(v: number): string {
  if (v <= 0) return "0: not shown";
  if (Math.abs(v - 1) < 0.001) return "full";
  return v < 1 ? `${Math.round(v * 100)}%` : `${n3(v)}× (above full; effect unverified)`;
}

/**
 * Each layer in plain words, looked up in the library. `maskCount`: the mask set's layer count, when
 * known; `shares`: each layer's share of the texture from its mask (see masks.ts).
 */
export function describeSetup(setup: Setup, lib: Library | undefined, maskCount?: number, shares?: number[]): SetupInfo {
  const byPath = new Map<string, Template>((lib?.templates ?? []).map((t) => [t.path.toLowerCase(), t]));
  const surfaces = new Map<string, SurfaceInfo>();
  const layers = setup.layers.map((l, index): LayerInfo => {
    const warnings: string[] = [];
    const t = byPath.get(l.material.toLowerCase());
    const unused = UnusedTemplate.test(l.material);
    let s: SurfaceInfo | undefined;
    if (t) {
      s = surfaces.get(t.path) ?? describeSurface(t);
      surfaces.set(t.path, s);
    } else if (l.material && !unused && lib) {
      warnings.push("Its surface is not in the library: a custom or missing template.");
    }
    let color: ColorInfo | undefined;
    if (s) {
      color = s.colors.find((c) => c.name === l.colorScale);
      if (!color && l.colorScale !== "None") {
        warnings.push(`Its color "${l.colorScale}" is not one of the surface's colors: the game draws it white (in-game test R1-A).`);
        color = { name: l.colorScale, plain: "missing: shows white", rgb: [1, 1, 1], hex: "#ffffff", bright: false, isDefault: false };
      }
    }
    const presetNames = [l.colorScale, l.normalStrength, l.roughLevelsIn, l.roughLevelsOut, l.metalLevelsIn, l.metalLevelsOut];
    const hidden =
      !l.material ? "no surface"
      : unused ? "unused slot"
      : l.opacity <= 0 ? "opacity 0"
      : presetNames.every((n) => n === "None") ? "all presets set to None (in-game test R1-C)"
      : maskCount !== undefined && index >= maskCount ? `no mask: the mask set has ${maskCount}`
      : shares && shares[index] !== undefined && shares[index] < 0.0005 ? "covered by the layers above, or its mask is empty"
      : undefined;
    return {
      index,
      shown: !hidden,
      hidden,
      surface: { path: l.material, title: t?.title ?? (unused ? "unused" : fileTitle(l.material)), category: t?.category ?? "", found: !!t, unused },
      color,
      roughness: preset(s?.roughness, l.roughLevelsOut, "roughness", warnings),
      roughnessContrast: preset(s?.roughnessContrast, l.roughLevelsIn, "roughness contrast", warnings),
      metal: preset(s?.metal, l.metalLevelsOut, "metal", warnings),
      metalContrast: preset(s?.metalContrast, l.metalLevelsIn, "metal contrast", warnings),
      bumps: preset(s?.bumps, l.normalStrength, "bumps", warnings),
      tiling: Math.round(l.matTile * (t?.tiling ?? 1) * 1000) / 1000,
      opacity: opacityWords(l.opacity),
      microblend: {
        path: l.microblend,
        name: l.microblend ? fileTitle(l.microblend) : "none",
        plain: !l.microblend || DefaultMicroblend.test(l.microblend),
        tile: l.mbTile,
        contrast: l.microblendContrast,
        normalStrength: l.microblendNormalStrength,
      },
      warnings: unused || !l.material ? [] : warnings,
      share: shares?.[index],
      raw: l,
    };
  });
  const warnings: string[] = [];
  if (maskCount !== undefined && maskCount !== setup.layers.length) {
    warnings.push(maskCount < setup.layers.length
      ? `The mask set has ${maskCount} masks for ${setup.layers.length} layers: layers ${maskCount + 1} and up never show.`
      : `The mask set has ${maskCount} masks for ${setup.layers.length} layers: the last ${maskCount - setup.layers.length} masks are unused.`);
  }
  return { ratio: setup.ratio, useNormal: setup.useNormal, jsonVersion: setup.jsonVersion, layers, shownCount: layers.filter((l) => l.shown).length, warnings };
}
