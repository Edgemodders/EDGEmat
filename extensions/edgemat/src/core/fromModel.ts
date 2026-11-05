// Materials from a textured model (design, "Custom assets"; EDGEmat #4 and #6, for EDGEfab): each
// material of a glTF model, or the texture files EDGEfab prepared, becomes game textures and a .mi on
// metal_base.remt, put on the mesh entry of the same name. The model's UVs place the textures, so
// nothing repeats (LayerTile 1). What the game's material cannot take is said in plain words.
//
// glTF to metal_base:
//   baseColorTexture × baseColorFactor   → BaseColor (color .xbm) × BaseColorScale
//   metallicRoughnessTexture             → green: Roughness (grayscale .xbm) × roughnessFactor
//                                          blue: Metalness (grayscale .xbm) × metallicFactor
//   normalTexture (scale)                → Normal (normal .xbm), NormalStrength
//   emissive (texture × factor × strength) → Emissive (color .xbm, or white for the whole part),
//                                          EmissiveColor, EmissiveEV = GlowEV.base + log2(strength)
//   occlusion, transparency, texture transforms, a second UV set → left out, and said

import * as fs from "node:fs";
import * as path from "node:path";
import { applyMaterial, writeTexture, writeTexturedMaterial, WhiteTexture, type TextureKind, type TexturedMaterial } from "./apply";
import type { BridgeClient } from "./bridgeClient";
import { imageOf, readGlb, type Glb } from "./glb";
import { jsonValue } from "./library";
import { readPng, writePng, type Image } from "./maps";
import { imageAsPng, materialSlug } from "./material";
import { readJson } from "./project";

/**
 * Glow's brightness: EmissiveEV = base + log2(strength), so each doubling of glTF's strength is one EV
 * more. Base 4 is near the middle of the game's own glowing metal_base materials (EV 3.95 to 6 for half
 * of 92, median 4.3; EDGEmat's survey, 2026-11-04); in the game, strength 1 on a full-white map
 * washes out to white in a dark room (2026-11-05): too bright for small details, so strength is a choice
 * per material. The base may come down once a lower strength is seen.
 *
 * EV stops at 0. In the game EV 0 still washes out to white while EV -2 and EV -4 show no glow at all, even
 * in the inventory's light (2026-11-05), so a negative EV seemed to switch the glow off, and below EV 0 the
 * color takes the rest (glowDim). In doubt: EV 0 with the color at a sixteenth is solid black too, though the
 * game has lit materials at EV 0 with colors that dim. Strength 1 again lights it (the control), so the drop is real and unexplained.
 */
export const GlowEV = { base: 4 };

/** EmissiveEV for a glTF emissive strength (KHR_materials_emissive_strength; 1 without it). Never below 0. */
export function glowEV(strength: number): number {
  return Math.max(0, Math.round((GlowEV.base + Math.log2(Math.max(strength, 1e-3))) * 1000) / 1000);
}

/** What EmissiveEV cannot dim: the glow's linear color is multiplied by this (1 down to EV 0, less below it). */
export function glowDim(strength: number): number {
  return Math.min(1, 2 ** GlowEV.base * strength);
}

/** One material's texture files, as EDGEfab's Prepare writes them beside the model. */
export interface ModelMaterialFiles {
  /** The material name: the glTF material's, and the mesh's material entry. */
  name: string;
  /** Color (PNG, JPEG or any image REDbridge reads). */
  baseColor?: string;
  /** glTF's packed map: green roughness, blue metalness (red, occlusion, is left out). */
  orm?: string;
  normal?: string;
  /** Flat values, used without a map, or as glTF's factors with one: color 0 to 1 linear, metallic and roughness 0 to 1. */
  color?: [number, number, number];
  metallic?: number;
  roughness?: number;
}

/** A material's glow, as EDGEfab's Prepare records it (glTF's emissive). */
export interface ModelGlow {
  material: string;
  /** emissiveFactor: linear red, green, blue 0 to 1. */
  color: [number, number, number];
  /** KHR_materials_emissive_strength: 1 without it. */
  strength: number;
  /** The emissive map (an image file), when the glow follows one; without it the whole part glows. */
  texture?: string;
}

export interface FromModelRequest {
  /** The project's source\archive and source\raw folders. */
  project: { archive: string; raw: string };
  /** A glTF binary (.glb) whose materials and images are read. */
  model?: string;
  /** Texture files per material, instead of the model's own (or for materials the model lacks). */
  materials?: ModelMaterialFiles[];
  /** A mesh (a game path, in the project or the game's): each material entry named as a model material takes its .mi. */
  mesh?: string;
  /** Where the textures and .mi files go, a game path. Default: beside the mesh, else edgemat\models\<model>. */
  folder?: string;
  /** Glow per material; it replaces the model's own emissive for the materials it names. */
  glow?: ModelGlow[];
  /** Where the model came from (a Tripo task, a file) and its license, kept in the record. */
  made?: Record<string, unknown>;
  /** Flip normal maps' green (glTF's are green-up). Unverified which way the game reads them; off by default. */
  flipNormalGreen?: boolean;
  log?: (line: string) => void;
}

export interface FromModelMaterial {
  name: string;
  mi: string;
  /** The textures it uses that were written (game paths). */
  textures: string[];
  /** Whether a mesh entry took it. */
  applied: boolean;
  glow?: { ev: number; color: [number, number, number]; map: boolean };
  /** What the game's material could not take as the model has it, in plain words. */
  approximated: string[];
}

export interface FromModelResult {
  materials: FromModelMaterial[];
  /** Every file written, relative to source\archive. */
  files: string[];
  /** The record, in source\raw. */
  record: string;
  notes: string[];
}

/** A picture by where it comes from: an image of the model, or a file. */
type Source = { glb: Glb; index: number; key: string } | { file: string; key: string };

interface Plan {
  name: string;
  color?: Source;
  colorFactor: [number, number, number];
  orm?: Source;
  metallic: number;
  roughness: number;
  normal?: Source;
  normalScale: number;
  glow?: { color: [number, number, number]; strength: number; map?: Source };
  approximated: string[];
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-3;
/** Linear 0 to 1 to the 0 to 255 the game keeps a color in (sRGB). Unverified that EmissiveColor is read as sRGB. */
const srgb8 = (c: number) => Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));

/** The plans for a glTF model's materials. */
function planGlb(glb: Glb, file: string): Plan[] {
  const json = glb.json;
  const tex = (ref: any, what: string, approx: string[]): Source | undefined => {
    if (!ref || ref.index === undefined) return undefined;
    if (ref.texCoord) approx.push(`its ${what} uses a second UV set, read as the first`);
    if (ref.extensions?.KHR_texture_transform) approx.push(`its ${what}'s texture transform (offset, turn, scale) is left out`);
    const image = json.textures?.[ref.index]?.source;
    return image === undefined ? undefined : { glb, index: ref.index, key: `${file}#${image}` };
  };
  return (json.materials ?? []).map((m: any, i: number) => {
    const approximated: string[] = [];
    const pbr = m.pbrMetallicRoughness ?? {};
    const factor = (pbr.baseColorFactor ?? [1, 1, 1, 1]) as number[];
    const emissive = (m.emissiveFactor ?? [0, 0, 0]) as [number, number, number];
    const strength = m.extensions?.KHR_materials_emissive_strength?.emissiveStrength ?? 1;
    if (m.occlusionTexture) approximated.push("its ambient occlusion map is left out (the game lights the part itself)");
    if (m.alphaMode === "MASK" || m.alphaMode === "BLEND") approximated.push(`its transparency (${m.alphaMode === "MASK" ? "cut-out" : "see-through"}) is left out: the part is solid`);
    const glows = Math.max(...emissive) > 0 && strength > 0;
    return {
      name: m.name || `material_${i}`,
      color: tex(pbr.baseColorTexture, "color", approximated),
      colorFactor: [factor[0], factor[1], factor[2]] as [number, number, number],
      orm: tex(pbr.metallicRoughnessTexture, "metal and roughness map", approximated),
      metallic: pbr.metallicFactor ?? 1,
      roughness: pbr.roughnessFactor ?? 1,
      normal: tex(m.normalTexture, "normal map", approximated),
      normalScale: m.normalTexture?.scale ?? 1,
      glow: glows ? { color: emissive, strength, map: tex(m.emissiveTexture, "glow map", approximated) } : undefined,
      approximated,
    };
  });
}

/** The plan for one material's texture files. */
function planFiles(f: ModelMaterialFiles): Plan {
  const file = (p?: string): Source | undefined => (p ? { file: p, key: path.resolve(p).toLowerCase() } : undefined);
  return {
    name: f.name,
    color: file(f.baseColor),
    colorFactor: f.color ?? [1, 1, 1],
    orm: file(f.orm),
    // Without a map glTF's metal default is 1; a file set without one means "not metal" unless it says so.
    metallic: f.metallic ?? (f.orm ? 1 : 0),
    roughness: f.roughness ?? 1,
    normal: file(f.normal),
    normalScale: 1,
    approximated: [],
  };
}

/** One channel of an image as a grayscale image, and whether it is one value all over (then that value, 0 to 1). */
function channel(img: Image, c: number): { img: Image; flat?: number } {
  const data = new Uint8Array(img.data.length);
  let lo = 255, hi = 0;
  for (let k = 0; k < data.length; k += 4) {
    const v = img.data[k + c];
    data[k] = data[k + 1] = data[k + 2] = v;
    data[k + 3] = 255;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return { img: { width: img.width, height: img.height, data }, flat: hi - lo <= 2 ? (lo + hi) / 510 : undefined };
}

/**
 * Makes game materials from a textured model: per material, its maps as .xbm textures and a .mi on
 * metal_base.remt, put on the mesh entry of the same name when a mesh is given. Writes a record of what
 * was made (and from what) in source\raw beside the folder.
 */
export async function materialsFromModel(bridge: BridgeClient, req: FromModelRequest): Promise<FromModelResult> {
  const log = req.log ?? (() => undefined);
  if (!req.model && !req.materials?.length) throw new Error("Give a model (.glb) or texture files per material.");
  const plans: Plan[] = [];
  if (req.model) {
    if (!fs.existsSync(req.model)) throw new Error(`No model at ${req.model}.`);
    plans.push(...planGlb(readGlb(fs.readFileSync(req.model)), req.model));
  }
  for (const f of req.materials ?? []) {
    const i = plans.findIndex((p) => p.name.toLowerCase() === f.name.toLowerCase());
    const p = planFiles(f);
    if (i < 0) {
      plans.push(p);
      continue;
    }
    // Files for a material the model has: each file or value given replaces the model's.
    const q = plans[i];
    if (f.baseColor) q.color = p.color;
    if (f.color) q.colorFactor = p.colorFactor;
    if (f.orm) q.orm = p.orm;
    if (f.metallic !== undefined) q.metallic = p.metallic;
    if (f.roughness !== undefined) q.roughness = p.roughness;
    if (f.normal) q.normal = p.normal;
  }
  if (!plans.length) throw new Error(`${path.basename(req.model ?? "The model")} has no materials.`);
  const notes: string[] = [];
  for (const g of req.glow ?? []) {
    const p = plans.find((x) => x.name.toLowerCase() === g.material.toLowerCase());
    if (!p) {
      notes.push(`glow for ${g.material} left out: the model has no material by that name`);
      continue;
    }
    p.glow = Math.max(...g.color) > 0 && g.strength > 0 ? { color: g.color, strength: g.strength, map: g.texture ? { file: g.texture, key: path.resolve(g.texture).toLowerCase() } : undefined } : undefined;
  }

  const stem = materialSlug(path.basename(req.model ?? req.mesh ?? plans[0].name).replace(/\.[^.]+$/, ""));
  // A game path, with either slash.
  const folder = (req.folder ?? (req.mesh ? path.win32.dirname(req.mesh) : `edgemat\\models\\${stem}`)).replace(/\//g, "\\").replace(/\\+$/, "");
  const entries = new Map<string, string>();
  if (req.mesh) {
    const root = (await readJson(bridge, req.project.archive, req.mesh)).json.Data.RootChunk;
    for (const e of root.materialEntries ?? []) entries.set(String(jsonValue(e.name)).toLowerCase(), String(jsonValue(e.name)));
  }

  // Each picture is read once, and each texture written once, however many materials share it.
  const pictures = new Map<string, Image>();
  const picture = async (s: Source): Promise<Image> => {
    let img = pictures.get(s.key);
    if (!img) {
      const raw = "glb" in s ? imageOf(s.glb, s.index) : { bytes: fs.readFileSync(s.file), ext: path.extname(s.file) };
      if (!raw) throw new Error(`The model's image for ${s.key} could not be read.`);
      img = readPng(await imageAsPng(bridge, raw.bytes, raw.ext));
      pictures.set(s.key, img);
    }
    return img;
  };
  const textures = new Map<string, string>();
  const files = new Set<string>();
  const written = async (key: string, gamePath: string, img: Image, kind: TextureKind): Promise<string> => {
    const have = textures.get(key);
    if (have) return have;
    for (const f of await writeTexture(bridge, req.project.archive, gamePath, writePng(img), kind)) files.add(f);
    textures.set(key, gamePath);
    log(`  ${path.win32.basename(gamePath)}`);
    return gamePath;
  };

  const used = new Set<string>();
  const out: FromModelMaterial[] = [];
  for (const p of plans) {
    let slug = materialSlug(p.name);
    for (let n = 2; used.has(slug); n++) slug = `${materialSlug(p.name).slice(0, 36)}_${n}`;
    used.add(slug);
    const base = `${folder}\\${slug}`;
    const mine: string[] = [];
    const tex = async (s: Source, suffix: string, img: Image, kind: TextureKind, keyPart: string) => {
      const t = await written(`${s.key}:${keyPart}`, `${base}_${suffix}.xbm`, img, kind);
      mine.push(t);
      return t;
    };
    log(`${p.name}:`);
    const m: TexturedMaterial = { baseColor: WhiteTexture, layerTile: 1 };
    // Color: the map, or white; the factor scales it.
    if (p.color) m.baseColor = await tex(p.color, "d01", await picture(p.color), "color", "color");
    if (!p.colorFactor.every((c) => near(c, 1))) m.baseColorScale = p.colorFactor;
    // Roughness and metalness from the packed map; one value when a channel is flat.
    if (p.orm) {
      const img = await picture(p.orm);
      const rough = channel(img, 1), metal = channel(img, 2);
      if (rough.flat !== undefined) Object.assign(m, { roughnessScale: 0, roughnessBias: rough.flat * p.roughness });
      else Object.assign(m, { roughness: await tex(p.orm, "r01", rough.img, "rough", "rough"), roughnessScale: p.roughness, roughnessBias: 0 });
      if (metal.flat !== undefined) m.metalness = metal.flat * p.metallic;
      else Object.assign(m, { metalnessMap: await tex(p.orm, "m01", metal.img, "rough", "metal"), metalnessScale: p.metallic, metalness: 0 });
    } else {
      Object.assign(m, { roughnessScale: 0, roughnessBias: p.roughness });
      m.metalness = p.metallic;
    }
    if (p.normal) {
      let img = await picture(p.normal);
      if (req.flipNormalGreen) {
        const data = new Uint8Array(img.data);
        for (let k = 1; k < data.length; k += 4) data[k] = 255 - data[k];
        img = { ...img, data };
      }
      m.normal = await tex(p.normal, "n01", img, "normal", req.flipNormalGreen ? "normal-flipped" : "normal");
      if (!near(p.normalScale, 1)) m.normalStrength = p.normalScale;
    }
    let glow: FromModelMaterial["glow"];
    if (p.glow) {
      // The game keeps the color as 0 to 255: the brightest part of glTF's factor goes to the EV,
      // and what EV cannot dim back into the color.
      const top = Math.max(...p.glow.color);
      const light = p.glow.strength * top;
      const color = p.glow.color.map((c) => srgb8((c / top) * glowDim(light))) as [number, number, number];
      const ev = glowEV(light);
      const map = p.glow.map ? await tex(p.glow.map, "e01", await picture(p.glow.map), "color", "glow") : WhiteTexture;
      m.emissive = { map, color, ev };
      glow = { ev, color, map: !!p.glow.map };
      log(`  glows: EV ${ev}, color ${color.join(", ")}${p.glow.map ? ", by its map" : ", all over"}`);
    }
    const mi = `${base}.mi`;
    for (const f of await writeTexturedMaterial(bridge, req.project.archive, mi, m)) files.add(f);
    let applied = false;
    if (req.mesh) {
      const entry = entries.get(p.name.toLowerCase());
      if (entry) {
        for (const f of await applyMaterial(bridge, req.project.archive, req.mesh, entry, mi)) files.add(f);
        applied = true;
      } else notes.push(`${p.name}: the mesh has no material entry of that name, so nothing wears it yet`);
    }
    out.push({ name: p.name, mi, textures: mine, applied, glow, approximated: p.approximated });
  }
  if (req.mesh) {
    const covered = new Set(plans.map((p) => p.name.toLowerCase()));
    const left = [...entries.entries()].filter(([k]) => !covered.has(k)).map(([, v]) => v);
    if (left.length) notes.push(`the mesh's ${left.join(", ")} kept ${left.length === 1 ? "its" : "their"} material: the model has none by ${left.length === 1 ? "that name" : "those names"}`);
  }
  if (out.some((m) => m.textures.some((t) => /_n01\.xbm$/i.test(t)))) notes.push(`normal maps written ${req.flipNormalGreen ? "with green flipped" : "as glTF has them (green up)"}; which way the game reads them is unverified`);
  if (out.some((m) => m.glow)) notes.push(`glow brightness: EV = ${GlowEV.base} + log2(strength); strength 1 is very bright in the game, too much for small lit details`);

  const record = path.join(req.project.raw, folder, `${stem}.from_model.json`);
  fs.mkdirSync(path.dirname(record), { recursive: true });
  fs.writeFileSync(
    record,
    JSON.stringify({ model: req.model, materials: req.materials, mesh: req.mesh, folder, glow: req.glow, made: req.made, made_at: new Date().toISOString(), result: out, notes }, null, 2),
  );
  return { materials: out, files: [...files], record, notes };
}
