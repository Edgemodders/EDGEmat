// Textured materials (design, "Generate a material"): a texture written into a project from a PNG, a
// textured .mi on metal_base.remt, and one material of a mesh pointed at it. A test pattern shows how a
// texture lies on a mesh's UVs and what metal_base's LayerTile does (design, "Open questions").

import * as fs from "node:fs";
import * as path from "node:path";
import { PNG } from "pngjs";
import type { BridgeClient } from "./bridgeClient";
import { jsonValue } from "./library";
import { localMaterial, readJson, writeJson } from "./project";

type Json = Record<string, any>;

export type TextureKind = "color" | "normal";

/**
 * Game textures whose import settings a new texture of each kind takes: WolvenKit's importer keeps the
 * settings of the .xbm it writes over, and makes a plain uncompressed one otherwise (REDbridge #8).
 */
export const TextureTemplates: Record<TextureKind, string> = {
  // TEXG_Generic_Color, TCM_QualityColor, isGamma 1, 1024 px.
  color: "ep1\\characters\\garment\\citizen_casual\\torso\\t2_160_full__blood\\textures\\t2_160_ma_full__blood_d01.xbm",
  // TEXG_Generic_Normal, TCM_Normalmap, 1024 px.
  normal: "base\\characters\\garment\\citizen_casual\\legs\\l1_012_pants__jeans_tight\\textures\\l1_012_wa_pants__jeans_tight_n01.xbm",
};

export const MetalBase = "engine\\materials\\metal_base.remt";

const ref = (p: string) => ({ DepotPath: { $type: "ResourcePath", $storage: "string", $value: p }, Flags: "Default" });

/**
 * Writes a texture into a project at a game path (an .xbm): the PNG goes to source\raw beside where the
 * .xbm goes, a game texture of the kind is copied to the target first so the import takes its settings,
 * and REDbridge imports the PNG over it. Returns the files written, relative to source\archive.
 */
export async function writeTexture(bridge: BridgeClient, archive: string, gamePath: string, png: Buffer, kind: TextureKind): Promise<string[]> {
  if (!/\.xbm$/i.test(gamePath)) throw new Error(`A texture's game path ends in .xbm: ${gamePath}`);
  const raw = path.resolve(archive, "..", "raw");
  const pngFile = path.join(raw, gamePath.replace(/\.xbm$/i, ".png"));
  const xbm = path.join(archive, gamePath);
  fs.mkdirSync(path.dirname(pngFile), { recursive: true });
  fs.mkdirSync(path.dirname(xbm), { recursive: true });
  fs.writeFileSync(pngFile, png);
  if (!fs.existsSync(xbm)) await bridge.extract(TextureTemplates[kind], xbm);
  const r = await bridge.importFile(pngFile, raw, archive, true);
  if (!r.ok) throw new Error(`REDbridge could not import ${pngFile} as a texture.`);
  return [gamePath];
}

export interface TexturedMaterial {
  /** The color texture's game path. */
  baseColor: string;
  normal?: string;
  /** How many times the textures repeat across the UVs: metal_base's LayerTile, 0.1 to 100 (the game's default 1). */
  layerTile?: number;
  /** 0 glossy to 1 rough; metal_base's default is 1 (rough). */
  roughness?: number;
  /** 0 not metal to 1 metal; the default is 0. */
  metalness?: number;
}

/** A textured .mi on metal_base.remt, as WolvenKit JSON. Values left out keep the template's defaults. */
export function texturedMaterialJson(m: TexturedMaterial): Json {
  const values: Json[] = [{ $type: "rRef:ITexture", BaseColor: ref(m.baseColor) }];
  if (m.normal) values.push({ $type: "rRef:ITexture", Normal: ref(m.normal) });
  // A texture's value is scale × map + bias, and the default maps are white (roughness) and black (metal).
  if (m.roughness !== undefined) values.push({ $type: "Float", RoughnessScale: m.roughness });
  if (m.metalness !== undefined) values.push({ $type: "Float", MetalnessBias: m.metalness });
  if (m.layerTile !== undefined) values.push({ $type: "Float", LayerTile: m.layerTile });
  return {
    Header: { WolvenKitVersion: "9.1.0", WKitJsonVersion: "0.0.9", GameVersion: 2310, DataType: "CR2W" },
    Data: {
      Version: 195,
      BuildVersion: 0,
      RootChunk: {
        $type: "CMaterialInstance",
        audioTag: { $type: "CName", $storage: "string", $value: "None" },
        baseMaterial: ref(MetalBase),
        cookingPlatform: "PLATFORM_PC",
        enableMask: 0,
        metadata: null,
        resourceVersion: 4,
        values,
      },
      EmbeddedFiles: [],
    },
  };
}

/** Writes a textured .mi into a project at a game path. */
export async function writeTexturedMaterial(bridge: BridgeClient, archive: string, gamePath: string, m: TexturedMaterial): Promise<string[]> {
  if (!/\.mi$/i.test(gamePath)) throw new Error(`A material's game path ends in .mi: ${gamePath}`);
  await writeJson(bridge, archive, gamePath, texturedMaterialJson(m));
  return [gamePath];
}

/**
 * Points one material of a mesh at an .mi: the mesh is copied into the project (or its copy there is
 * changed), and the entry named `material` takes the .mi as its base with no values of its own, so the
 * .mi decides the look. Every appearance that uses that entry changes.
 */
export async function applyMaterial(bridge: BridgeClient, archive: string, mesh: string, material: string, mi: string): Promise<string[]> {
  const { json } = await readJson(bridge, archive, mesh);
  const root = json.Data.RootChunk;
  const entry = (root.materialEntries ?? []).find((e: Json) => String(jsonValue(e.name)).toLowerCase() === material.toLowerCase());
  if (!entry) {
    const names = (root.materialEntries ?? []).map((e: Json) => String(jsonValue(e.name)));
    throw new Error(`${mesh} has no material named ${material}. It has: ${names.join(", ")}.`);
  }
  const local = Number(entry.isLocalInstance) === 1 || entry.isLocalInstance === true;
  if (local) {
    const m = localMaterial(root, entry.index);
    if (!m) throw new Error(`${mesh}: the material ${material} has no local instance to change.`);
    m.baseMaterial = ref(mi);
    m.values = [];
  } else {
    root.externalMaterials[entry.index] = { ...root.externalMaterials[entry.index], ...ref(mi) };
  }
  await writeJson(bridge, archive, mesh, json);
  return [mesh];
}

// ---- the test pattern ----------------------------------------------------------------------------

const Digits = ["111101101101111", "010110010010111", "111001111100111", "111001111001111", "101101111001001", "111100111001111", "111100111101111", "111001001001001", "111101111101111", "111101111001111"];

function hsv(h: number, s: number, v: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h * 6) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5), f(3), f(1)].map((x) => Math.round(x * 255)) as [number, number, number];
}

/**
 * A UV test pattern: `cells` × `cells` squares, the hue changing across (U) and the brightness down (V),
 * each labelled with its column and row from 1, so a mirrored or rotated island and the tiling show.
 */
export function uvTestPattern(size = 1024, cells = 8): Buffer {
  const png = new PNG({ width: size, height: size });
  const cell = size / cells;
  const put = (x: number, y: number, [r, g, b]: number[]) => {
    const i = (y * size + x) * 4;
    png.data[i] = r;
    png.data[i + 1] = g;
    png.data[i + 2] = b;
    png.data[i + 3] = 255;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
      const line = x % cell < 3 || y % cell < 3;
      put(x, y, line ? [16, 16, 16] : hsv(cx / cells, 0.7, 0.95 - (0.55 * cy) / (cells - 1)));
    }
  }
  const scale = Math.max(2, Math.floor(cell / 16));
  const glyph = (d: number, ox: number, oy: number) => {
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
      if (Digits[d][r * 3 + c] !== "1") continue;
      for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) put(ox + c * scale + dx, oy + r * scale + dy, [255, 255, 255]);
    }
  };
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      const ox = Math.round(cx * cell + cell * 0.12), oy = Math.round(cy * cell + cell * 0.12);
      // A dark plate behind the label, then column and row.
      for (let y = oy - scale; y < oy + 6 * scale; y++) for (let x = ox - scale; x < ox + 8 * scale; x++) put(x, y, [0, 0, 0]);
      glyph((cx + 1) % 10, ox, oy);
      glyph((cy + 1) % 10, ox + 4 * scale, oy);
    }
  }
  return PNG.sync.write(png);
}
