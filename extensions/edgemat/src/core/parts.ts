// Game materials on the parts of a prop (EDGEmat #12, design "Game materials on a new mesh", M4): a mesh
// whose material entries are its parts, such as one EDGEfab made from a Tripo model (one entry and one
// submesh per part, each part's own texture atlas). A part can wear a game surface (a one-layer setup EDGEmat
// writes), a game material that suits any shape (a standalone .mi), a generated one (New Material), or go
// back to the model's own texture (the .mi EDGEfab keeps for it). The swap lives only on the part's
// material entry: EDGEfab reads that entry when it adds the prop again, and keeps it.

import * as fs from "node:fs";
import * as path from "node:path";
import { applyMaterial, restoreMaterial } from "./apply";
import type { BridgeClient } from "./bridgeClient";
import { applyLayerEdit, DefaultMicroblend, patchFromWords, setupToJson, type LayerWords } from "./edit";
import { gameKey, jsonValue, type Library, type Template } from "./library";
import { localMaterial, readJson, writeJson } from "./project";
import { layerDefault, LayerFields, parseSetup, type Setup, type SetupLayer } from "./setup";
import { primitives, readGlb } from "./glb";
import { describeSurface } from "./surface";

type Json = Record<string, any>;

/**
 * The mask a one-layer setup's .mi names. The engine wants a mask, but layer 0 covers the whole part and
 * reads none, so any of the game's masks does: this one is a vending machine's, the one EDGEfab's check used
 * in the game on 2026-11-17 (a red car paint on a generated prop's body, right by day and night).
 */
export const AnyMask = "base\\environment\\architecture\\common\\shop\\textures\\ml_shop_vending_machine_c_v2_masksset.mlmask";

/**
 * How far one repeat of a game surface spans on a part, in metres, for a part's default tiling. A guess
 * (unverified): the in-game check says whether brick and wood come out the right size.
 */
export const SurfaceRepeat = 1;

const ref = (p: string) => ({ DepotPath: { $type: "ResourcePath", $storage: "string", $value: p }, Flags: "Default" });
const lower = (p: string) => p.toLowerCase().replace(/\//g, "\\");

// ---------- EDGEfab's record ----------

/** EDGEfab's record of a prop it added (`source\raw\<mod>\props\<name>\<name>.edgefab.json`). */
export interface PropRecord {
  /** The record's file on disk. */
  file: string;
  mesh: string;
  /** One per part: the mesh's material entry name and EDGEfab's own .mi for it (the model's texture). */
  materials: { name: string; mi: string; textures?: string[] }[];
  swapped?: { material: string; base: string }[];
}

/** The project's raw folder beside its archive folder. */
const rawOf = (archive: string) => path.join(path.dirname(archive), "raw");

/** EDGEfab's record for a mesh in a project, when EDGEfab made it. */
export function propRecord(archive: string, mesh: string): PropRecord | undefined {
  const want = lower(mesh);
  const read = (file: string): PropRecord | undefined => {
    try {
      const r = JSON.parse(fs.readFileSync(file, "utf8"));
      return r && typeof r.mesh === "string" && lower(r.mesh) === want && Array.isArray(r.materials) ? { ...r, file } : undefined;
    } catch {
      return undefined;
    }
  };
  const raw = rawOf(archive);
  const beside = path.join(raw, path.dirname(mesh), `${path.basename(mesh, path.extname(mesh))}.edgefab.json`);
  const direct = fs.existsSync(beside) ? read(beside) : undefined;
  if (direct) return direct;
  // Elsewhere in the raw folder: a few levels down at most.
  const walk = (dir: string, depth: number): PropRecord | undefined => {
    let names: fs.Dirent[];
    try {
      names = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return undefined;
    }
    for (const d of names) if (d.isFile() && d.name.toLowerCase().endsWith(".edgefab.json")) {
      const r = read(path.join(dir, d.name));
      if (r) return r;
    }
    if (depth <= 0) return undefined;
    for (const d of names) if (d.isDirectory()) {
      const r = walk(path.join(dir, d.name), depth - 1);
      if (r) return r;
    }
    return undefined;
  };
  return walk(raw, 6);
}

// ---------- what each part wears ----------

export interface PartWear {
  /**
   * model: the model's own texture (EDGEfab's .mi). surface: a game surface EDGEmat put on it. game: a game
   * material (.mi). made: a material made in the project (New Material, or by hand). other: anything else.
   */
  kind: "model" | "surface" | "game" | "made" | "other";
  /** The .mi the part's entry takes as its base. */
  mi?: string;
  /** For a surface: its setup, the surface and the color. */
  setup?: string;
  surface?: string;
  color?: string;
  /** In plain words. */
  plain: string;
}

export interface Part {
  /** The mesh's material entry name. */
  name: string;
  wears: PartWear;
  /** EDGEfab's own .mi for the part, when EDGEfab made the prop: Back to the Model's Texture. */
  model?: string;
}

/** The folder EDGEmat writes a prop's part materials to: `<mesh folder>\materials`. */
export const partFolder = (mesh: string) => `${path.dirname(mesh).replace(/\//g, "\\")}\\materials`;

/**
 * The folder EDGEmat writes the part materials of a game mesh on the Desk to: `<mesh folder>\edgemat\<mesh
 * name>`. The game has no such folder, so the files never replace a game file when they go into a project,
 * and two meshes in one folder keep their own.
 */
export const deskPartFolder = (mesh: string) => `${path.dirname(mesh).replace(/\//g, "\\")}\\edgemat\\${path.basename(mesh, path.extname(mesh))}`;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "part";
const stemWords = (p: string) => path.basename(p, path.extname(p)).replace(/[_-]+/g, " ").trim();

/** Each material entry of a mesh in a project (its parts) and what it wears now. */
export async function partsOf(bridge: BridgeClient, lib: Library | undefined, archive: string, mesh: string): Promise<{ parts: Part[]; record?: PropRecord }> {
  const record = propRecord(archive, mesh);
  const root = (await readJson(bridge, archive, mesh)).json.Data.RootChunk;
  const parts: Part[] = [];
  for (const e of root.materialEntries ?? []) {
    const name = String(jsonValue(e.name));
    const model = record?.materials.find((m) => m.name.toLowerCase() === name.toLowerCase())?.mi;
    const local = Number(e.isLocalInstance) === 1 || e.isLocalInstance === true;
    const inst = local ? localMaterial(root, e.index) : undefined;
    const mi: string | undefined = local ? jsonValue(inst?.baseMaterial) : jsonValue(root.externalMaterials?.[e.index]);
    const ownValues = !!inst?.values?.length;
    parts.push({ name, model, wears: await wearOf(bridge, lib, archive, mesh, name, mi, ownValues, model) });
  }
  return { parts, record };
}

async function wearOf(bridge: BridgeClient, lib: Library | undefined, archive: string, mesh: string, name: string, mi: string | undefined, ownValues: boolean, model?: string): Promise<PartWear> {
  if (!mi) return { kind: "other", plain: "no material" };
  if (model && lower(mi) === lower(model) && !ownValues) return { kind: "model", mi, plain: "the model's own texture" };
  const inProject = fs.existsSync(path.join(archive, mi));
  if (inProject && [partFolder(mesh), deskPartFolder(mesh)].some((f) => lower(path.dirname(mi)) === lower(f))) {
    const setup = mi.replace(/\.mi$/i, ".mlsetup");
    if (fs.existsSync(path.join(archive, setup))) {
      try {
        const s = parseSetup((await readJson(bridge, archive, setup)).json);
        const l = s.layers[0];
        const t = lib?.templates.find((x) => lower(x.path) === lower(l.material));
        const c = t ? describeSurface(t).colors.find((x) => x.name === l.colorScale) : undefined;
        const title = t?.title ?? stemWords(l.material);
        return { kind: "surface", mi, setup, surface: l.material, color: l.colorScale, plain: `${title}${c ? `, ${c.plain}` : ""}` };
      } catch {
        // Read below as a material made in the project.
      }
    }
  }
  if (inProject) return { kind: "made", mi, plain: `${stemWords(mi)} (made in this project)` };
  return { kind: "game", mi, plain: `${stemWords(mi)} (the game's)` };
}

// ---------- a game surface on a part ----------

export interface SurfaceChoice {
  /** The surface: its game path, name or words (as mat_edit takes them). */
  surface: string;
  /** A color preset's name, or words ("dark red", #rrggbb): the surface's closest. Default: the surface's own. */
  color?: string;
  /** How many times the surface repeats across the part's UV square. Default: from the part's size (SurfaceRepeat). */
  tile?: number;
  roughness?: string;
  metal?: string;
  bumps?: string;
  microblend?: string;
}

export interface PartResult {
  /** Project files written, relative to the archive folder. */
  written: string[];
  mi: string;
  setup?: string;
  surface?: Template;
  color?: string;
  tile?: number;
  notes: string[];
}

/** A setup of one layer, all defaults, before the surface goes on. */
function oneLayer(): Setup {
  const layer = {} as SetupLayer;
  for (const k of LayerFields) (layer as unknown as Record<string, unknown>)[k] = layerDefault(k);
  layer.microblend = DefaultMicroblend;
  return { jsonVersion: "0.0.9", ratio: 1, useNormal: true, layers: [layer] };
}

/** A .mi on multilayered.mt naming a setup and a mask, with nothing embedded. */
export function layeredMaterialJson(setup: string, mask: string = AnyMask): Json {
  return {
    Header: { WolvenKitVersion: "9.1.0", WKitJsonVersion: "0.0.9", GameVersion: 2310, DataType: "CR2W" },
    Data: {
      Version: 195,
      BuildVersion: 0,
      RootChunk: {
        $type: "CMaterialInstance",
        audioTag: { $type: "CName", $storage: "string", $value: "None" },
        baseMaterial: ref("engine\\materials\\multilayered.mt"),
        cookingPlatform: "PLATFORM_PC",
        enableMask: 0,
        metadata: null,
        resourceVersion: 4,
        values: [
          { $type: "rRef:Multilayer_Setup", MultilayerSetup: ref(setup) },
          { $type: "rRef:Multilayer_Mask", MultilayerMask: ref(mask) },
        ],
      },
      // A game ml_*.mi embeds its setup (EmbeddedFiles, Flags Embedded) and keeps that look over the one it
      // names: EDGEmat writes its own, with nothing embedded (EDGEmat #12).
      EmbeddedFiles: [],
    },
  };
}

/**
 * A game surface on one part: a one-layer setup and its .mi, written to `<mesh folder>\materials\<part>`
 * (the same files each time, so a part has one), and the part's entry pointed at the .mi. The setup is an
 * ordinary one: the setup editor opens it for the color, tiling and the rest. `folder`: where the files go
 * (deskPartFolder for a game mesh on the Desk).
 */
export async function useSurface(bridge: BridgeClient, lib: Library, archive: string, mesh: string, material: string, choice: SurfaceChoice, folder = partFolder(mesh)): Promise<PartResult> {
  const notes: string[] = [];
  const words: LayerWords = { surface: choice.surface, color: choice.color, roughness: choice.roughness, metal: choice.metal, bumps: choice.bumps, microblend: choice.microblend };
  let setup = oneLayer();
  const { patch, notes: said } = patchFromWords(setup, 0, words, lib);
  notes.push(...said.map((n) => n.replace(/^Layer 0: /, "")));
  const edit = applyLayerEdit(setup, 0, patch, lib);
  setup = edit.setup;
  const t = lib.templates.find((x) => lower(x.path) === lower(setup.layers[0].material));
  // Without a color named: the surface's own default (applyLayerEdit set it).
  let tile = choice.tile;
  if (tile === undefined) {
    const size = await partSize(bridge, archive, mesh, material).catch(() => undefined);
    tile = size ? Math.max(0.1, Math.min(100, Math.round((size / SurfaceRepeat) * 10) / 10)) : 1;
    notes.push(size ? `Tiling ${tile}: the part spans about ${size.toFixed(2)} m of its UV square, one repeat a ${SurfaceRepeat} m (change it in the setup editor).` : "Tiling 1: the part's size could not be read (change it in the setup editor).");
  }
  setup = applyLayerEdit(setup, 0, { matTile: tile }, lib).setup;
  const base = `${folder}\\${slug(material)}`;
  const setupPath = `${base}.mlsetup`, mi = `${base}.mi`;
  await writeJson(bridge, archive, setupPath, setupToJson(setup));
  await writeJson(bridge, archive, mi, layeredMaterialJson(setupPath));
  const written = [setupPath, mi];
  for (const f of await applyMaterial(bridge, archive, mesh, material, mi)) if (!written.includes(f)) written.push(f);
  return { written, mi, setup: setupPath, surface: t, color: setup.layers[0].colorScale, tile, notes };
}

/**
 * How many metres a part spans across its UV square: the square root of its surface area over its UV
 * area, from WolvenKit's export of the mesh (the part's submeshes, by the first appearance's material names).
 */
async function partSize(bridge: BridgeClient, archive: string, mesh: string, material: string): Promise<number | undefined> {
  const root = (await readJson(bridge, archive, mesh)).json.Data.RootChunk;
  const app = (root.appearances ?? []).map((a: Json) => a.Data ?? a)[0];
  const chunkMaterials: string[] = (app?.chunkMaterials ?? []).map((n: Json) => String(jsonValue(n)));
  const scratch = path.join(path.dirname(archive), "raw", "edgemat", "parts", "export");
  const src = path.join(archive, mesh);
  if (!fs.existsSync(src)) return undefined;
  const out = await bridge.exportFile(src, archive, scratch, { meshMaterials: false });
  const rel = out.written.find((f) => /\.glb$/i.test(f));
  if (!out.ok || !rel) return undefined;
  const glbFile = path.join(scratch, rel);
  const g = readGlb(fs.readFileSync(glbFile));
  fs.rmSync(glbFile, { force: true });
  let area = 0, uvArea = 0;
  for (const p of primitives(g)) {
    const chunk = Number(/submesh_(\d+)/i.exec(p.mesh)?.[1] ?? -1);
    if (chunkMaterials[chunk]?.toLowerCase() !== material.toLowerCase() || !p.uv) continue;
    if (!/lod_?1\b/i.test(p.mesh) && /lod_?\d/i.test(p.mesh)) continue;
    for (let t = 0; t < p.idx.length; t += 3) {
      const [a, b, c] = [p.idx[t], p.idx[t + 1], p.idx[t + 2]];
      const e1 = [0, 1, 2].map((k) => p.pos[b * 3 + k] - p.pos[a * 3 + k]), e2 = [0, 1, 2].map((k) => p.pos[c * 3 + k] - p.pos[a * 3 + k]);
      area += Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]) / 2;
      uvArea += Math.abs((p.uv[b * 2] - p.uv[a * 2]) * (p.uv[c * 2 + 1] - p.uv[a * 2 + 1]) - (p.uv[c * 2] - p.uv[a * 2]) * (p.uv[b * 2 + 1] - p.uv[a * 2 + 1])) / 2;
    }
  }
  return area > 0 && uvArea > 0 ? Math.sqrt(area / uvArea) : undefined;
}

// ---------- a game material on a part ----------

export interface MaterialFit {
  fits: boolean;
  /** Why it does or does not suit any shape, in plain words. */
  why: string;
  /** The material template at the end of its chain. */
  base: string;
  /** Every texture it names along its chain. */
  textures: string[];
  glow: boolean;
  glass: boolean;
}

/** Shaders made for one kind of mesh or effect, never for a prop's part. */
const NotForParts = /decal|parallax|terrain|\\fx\\|skin|hair|eye|vehicle_destr|hologram|ocean|water|sky|particle|cloth|cable|road|foliage|tree|grass|billboard|ui_|screen|video|mirror/i;
/** Folders whose textures tile on any shape: the game's surface library and the engine's plain maps. */
const AnyShapeTextures = /^(base|ep1)\\surfaces\\|^engine\\/i;

/** Reads a game .mi's chain and says whether it suits any shape (a generated part's own UVs). */
export async function materialFit(bridge: BridgeClient, mi: string, archive?: string, cache = new Map<string, Json>()): Promise<MaterialFit> {
  const textures: string[] = [];
  let glow = false;
  let current = mi;
  let base = "";
  for (let depth = 0; depth < 8 && current; depth++) {
    if (!/\.mi$/i.test(current)) {
      base = current;
      break;
    }
    const k = lower(current);
    let root = cache.get(k);
    if (!root) {
      const local = archive && fs.existsSync(path.join(archive, current));
      const r = local ? await bridge.fileToJson(path.join(archive!, current)) : await bridge.toJson(current);
      if (!r.json) throw new Error(`${current} could not be read.`);
      root = JSON.parse(r.json).Data.RootChunk as Json;
      cache.set(k, root);
    }
    for (const value of root.values ?? []) {
      for (const [key, x] of Object.entries(value)) {
        if (key === "$type") continue;
        const p = jsonValue(x);
        if (typeof p === "string" && /\.(xbm|mlsetup|mlmask)$/i.test(p) && !textures.includes(p)) textures.push(p);
        if (/^Emissive/i.test(key) && (key !== "EmissiveEV" || Number(p) > 0)) glow = true;
      }
    }
    current = jsonValue(root.baseMaterial) ?? "";
    base = current;
  }
  const glass = /glass/i.test(base);
  const out = (fits: boolean, why: string): MaterialFit => ({ fits, why, base, textures, glow, glass });
  if (/multilayered/i.test(base)) return out(false, "a layered material, its mask painted for another mesh");
  if (NotForParts.test(base)) return out(false, `made for another kind of mesh or effect (${path.basename(base)})`);
  const odd = textures.find((t) => !AnyShapeTextures.test(t));
  if (odd) return out(false, `its textures are painted for another mesh (${odd})`);
  return out(true, textures.length ? "its textures tile on any shape (the game's surfaces and plain maps)" : "it has no textures of its own");
}

/**
 * A game material (.mi) on one part, as it is: the part's entry takes it as its base. A material that does
 * not suit any shape (materialFit) is refused unless `force`, with why.
 */
export async function useGameMaterial(bridge: BridgeClient, archive: string, mesh: string, material: string, mi: string, opts: { force?: boolean } = {}): Promise<PartResult & { fit: MaterialFit }> {
  const fit = await materialFit(bridge, mi, archive);
  if (!fit.fits && !opts.force) throw new Error(`${mi} does not suit a prop's part: ${fit.why}. Pass force to use it anyway.`);
  const written = await applyMaterial(bridge, archive, mesh, material, mi);
  return { written, mi, notes: fit.fits ? [] : [`Used anyway: ${fit.why}.`], fit };
}

/** The part back on the model's own texture: the .mi EDGEfab keeps for it. */
export async function backToModel(bridge: BridgeClient, archive: string, mesh: string, material: string): Promise<PartResult> {
  const record = propRecord(archive, mesh);
  const own = record?.materials.find((m) => m.name.toLowerCase() === material.toLowerCase())?.mi;
  if (!own) throw new Error(record ? `EDGEfab's record (${record.file}) has no material ${material}.` : `${mesh} has no EDGEfab record, so there is no model texture to go back to.`);
  const written = await applyMaterial(bridge, archive, mesh, material, own);
  return { written, mi: own, notes: [] };
}

/**
 * A material of a game mesh's copy (on the Desk) back as the game's mesh has it, and the surface files
 * EDGEmat wrote for it in `folder` deleted. The mesh's other materials keep their changes.
 */
export async function backToGame(bridge: BridgeClient, archive: string, mesh: string, material: string, folder = deskPartFolder(mesh)): Promise<PartResult> {
  const written = await restoreMaterial(bridge, archive, mesh, material);
  if (!written.length) throw new Error(`${mesh} has no copy in ${archive} to change.`);
  const notes = dropPartFiles(archive, material, folder).map((f) => `Deleted ${f}.`);
  const root = (await readJson(bridge, archive, mesh)).json.Data.RootChunk;
  return { written, mi: materialOf(root, material) ?? "", notes };
}

/**
 * Deletes the surface files EDGEmat wrote for a material in `folder` (its setup and .mi), when the material
 * no longer wears them (a game material or the game's own went on). Answers the game paths deleted.
 */
export function dropPartFiles(archive: string, material: string, folder: string): string[] {
  const out: string[] = [];
  for (const ext of [".mi", ".mlsetup"]) {
    const rel = `${folder}\\${slug(material)}${ext}`;
    const f = path.join(archive, rel);
    if (fs.existsSync(f)) {
      fs.rmSync(f, { force: true });
      out.push(rel);
    }
  }
  return out;
}

/** The .mi a mesh's material entry takes as its base (its local instance's, or its external one). */
export function materialOf(root: Json, material: string): string | undefined {
  const e = (root.materialEntries ?? []).find((x: Json) => String(jsonValue(x.name)).toLowerCase() === material.toLowerCase());
  if (!e) return undefined;
  const local = Number(e.isLocalInstance) === 1 || e.isLocalInstance === true;
  return local ? jsonValue(localMaterial(root, e.index)?.baseMaterial) : jsonValue(root.externalMaterials?.[e.index]);
}

// ---------- the game's materials that suit any shape ----------

export interface GameMaterial {
  path: string;
  /** Plain words from its file name. */
  name: string;
  base: string;
  glow: boolean;
  glass: boolean;
  /** Its color texture, when it has one: for a picture. */
  color?: string;
}

export interface GameMaterialList {
  version: number;
  key: string;
  made: string;
  /** How many .mi files were read. */
  read: number;
  materials: GameMaterial[];
}

const ListVersion = 1;
const listFile = (dir: string) => path.join(dir, "game-materials.json");

export function loadGameMaterials(dir: string): GameMaterialList | undefined {
  try {
    const l = JSON.parse(fs.readFileSync(listFile(dir), "utf8")) as GameMaterialList;
    return l.version === ListVersion ? l : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Every .mi of the game, by name. REDbridge's search gives at most 5000 names a query, so the names are
 * asked for by the last letter before ".mi".
 */
async function allMaterialPaths(bridge: BridgeClient): Promise<string[]> {
  const out = new Set<string>();
  for (const c of "abcdefghijklmnopqrstuvwxyz0123456789_-") {
    const r = await bridge.search(`${c}.mi`, 5000);
    for (const f of (r as any).items ?? (r as any).files ?? []) {
      const p = typeof f === "string" ? f : f.name ?? f.path;
      if (typeof p === "string" && /\.mi$/i.test(p)) out.add(p);
    }
  }
  return [...out];
}

/**
 * The game's materials that suit any shape, read once per game version (about a minute) and kept in
 * `<dir>\game-materials.json`. `progress` gets how many of how many are read.
 */
export async function gameMaterials(bridge: BridgeClient, dir: string, progress?: (done: number, of: number) => void): Promise<GameMaterialList> {
  const key = await gameKey(bridge);
  const had = loadGameMaterials(dir);
  if (had && had.key === key) return had;
  const paths = await allMaterialPaths(bridge);
  const cache = new Map<string, Json>();
  const materials: GameMaterial[] = [];
  let done = 0;
  for (const p of paths) {
    done++;
    if (done % 200 === 0) progress?.(done, paths.length);
    // Quick refusals by path before reading: effects, characters, vehicles' own paints, decals.
    if (/^base\\(fx|characters|vehicles|weapons|gameplay\\gui)\\|^ep1\\(fx|characters|vehicles|weapons)\\|decal|\\parallax\\|terrain/i.test(p)) continue;
    try {
      const fit = await materialFit(bridge, p, undefined, cache);
      if (!fit.fits) continue;
      const color = fit.textures.find((t) => /_d(01)?\.xbm$|_albedo|_diff|basecolor/i.test(t));
      materials.push({ path: p, name: stemWords(p), base: fit.base, glow: fit.glow, glass: fit.glass, ...(color ? { color } : {}) });
    } catch {
      // An unreadable .mi is left out.
    }
  }
  const list: GameMaterialList = { version: ListVersion, key, made: new Date().toISOString(), read: paths.length, materials };
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(listFile(dir), JSON.stringify(list));
  return list;
}

/** The game materials whose words match a query (every word, in the name or path); all with no query. */
export function searchGameMaterials(list: GameMaterialList, query: string, limit = 50): GameMaterial[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const found = list.materials.filter((m) => {
    const hay = `${m.name} ${m.path} ${m.glow ? "glow emissive light" : ""} ${m.glass ? "glass" : ""}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  return found.slice(0, limit);
}
