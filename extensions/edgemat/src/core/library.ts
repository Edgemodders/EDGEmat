// The material library, built from the user's own game through REDbridge and cached on disk (design,
// "The material library"). Nothing here ships with EDGEmat: it is read from the game on first use and
// rebuilt when the game's archives change. Field meanings are in the behavior spec, section 3.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { BridgeClient } from "./bridgeClient";
import { writeThumbnail } from "./thumbnail";

/** Raised when the cached file's layout changes, so an old cache is rebuilt rather than misread. */
export const LibraryVersion = 1;

export const PresetKinds = ["colorScale", "normalStrength", "roughLevelsIn", "roughLevelsOut", "metalLevelsIn", "metalLevelsOut"] as const;
export type PresetKind = (typeof PresetKinds)[number];

export interface ColorPreset { name: string; rgb: [number, number, number] }
/** A level pair: out = scale × in + bias (behavior spec, section 3). */
export interface LevelPreset { name: string; scale: number; bias: number }
export interface ScalarPreset { name: string; value: number }

export interface Template {
  /** Game path of the .mltemplate. */
  path: string;
  /** The file name without its extension, such as silk_clean_01_30. */
  name: string;
  /** In plain words: the name with spaces. */
  title: string;
  /** The folder under base\surfaces\materials, such as fabric or metal; "default" for the engine's own. */
  category: string;
  /** The folder below that, such as silk or leather. */
  group: string;
  tiling: number;
  textures: { color?: string; normal?: string; roughness?: string; metalness?: string };
  defaults: Partial<Record<PresetKind, string>>;
  colors: ColorPreset[];
  normalStrength: ScalarPreset[];
  roughLevelsIn: LevelPreset[];
  roughLevelsOut: LevelPreset[];
  metalLevelsIn: LevelPreset[];
  metalLevelsOut: LevelPreset[];
  colorMaskLevels?: { in: number[]; out: number[] };
  /** The thumbnail's file name in the cache's thumbs folder. */
  thumbnail?: string;
}

export interface Microblend {
  path: string;
  name: string;
  thumbnail?: string;
}

export interface Library {
  version: number;
  builtAt: string;
  /** Changes when the game's archives change; a library with another key is out of date. */
  key: string;
  bridge: { version: string; wolvenKit: string };
  game: { dir: string | null; archives: number; files: number };
  counts: { templates: number; microblends: number; setups: number; masks: number };
  templates: Template[];
  microblends: Microblend[];
  /** Files that could not be read, with the reason. */
  failed: string[];
  /** Files a template refers to that the game does not contain (the game's own dangling references). */
  missing: string[];
  seconds: number;
}

export type Progress = (message: string, done?: number, total?: number) => void;

const LibraryFile = "library.json";
const ThumbsFolder = "thumbs";

export function libraryFile(dir: string): string {
  return path.join(dir, LibraryFile);
}

export function thumbnailFile(dir: string, name: string): string {
  return path.join(dir, ThumbsFolder, name);
}

/** The cached library, or undefined when there is none or it was written by another layout. */
export function loadLibrary(dir: string): Library | undefined {
  try {
    const lib = JSON.parse(fs.readFileSync(libraryFile(dir), "utf8")) as Library;
    return lib.version === LibraryVersion ? lib : undefined;
  } catch {
    return undefined;
  }
}

/** A key for the game's current archives: their names and file counts. */
export async function gameKey(bridge: BridgeClient): Promise<string> {
  const archives = await bridge.archives();
  const text = archives.map((a) => `${a.name}:${a.files}`).sort().join("|");
  return crypto.createHash("sha1").update(text).digest("hex").slice(0, 16);
}

/** True when the cached library was built from the archives the bridge has loaded now. */
export async function isCurrent(lib: Library, bridge: BridgeClient): Promise<boolean> {
  return lib.key === (await gameKey(bridge));
}

// ---- reading the game ----------------------------------------------------------------------------

type Json = Record<string, any>;

const plain = (v: any): any => (v && typeof v === "object" ? ("$value" in v ? v.$value : "DepotPath" in v ? plain(v.DepotPath) : v) : v);
const rgb = (e: number[]): [number, number, number] => [e[0], e[1], e[2]];
const levels = (rows: Json[] | undefined): LevelPreset[] => (rows ?? []).map((r) => ({ name: plain(r.n), scale: r.v.Elements[0], bias: r.v.Elements[1] }));

/** A template's fields from its WolvenKit JSON. */
export function parseTemplate(gamePath: string, json: Json): Template {
  const rc = json.Data.RootChunk;
  const parts = gamePath.split("\\");
  const name = parts[parts.length - 1].replace(/\.mltemplate$/i, "");
  const at = parts.findIndex((p, i) => p === "materials" && parts[i - 1] === "surfaces");
  const category = at >= 0 && parts.length > at + 2 ? parts[at + 1] : "default";
  const group = at >= 0 && parts.length > at + 3 ? parts[at + 2] : "";
  const o = rc.overrides ?? {};
  const defaults: Partial<Record<PresetKind, string>> = {};
  for (const k of PresetKinds) if (rc.defaultOverrides?.[k]) defaults[k] = plain(rc.defaultOverrides[k]);
  return {
    path: gamePath,
    name,
    title: name.replace(/_/g, " "),
    category,
    group,
    tiling: rc.tilingMultiplier ?? 1,
    textures: {
      color: plain(rc.colorTexture) || undefined,
      normal: plain(rc.normalTexture) || undefined,
      roughness: plain(rc.roughnessTexture) || undefined,
      metalness: plain(rc.metalnessTexture) || undefined,
    },
    defaults,
    colors: (o.colorScale ?? []).map((r: Json) => ({ name: plain(r.n), rgb: rgb(r.v.Elements) })),
    normalStrength: (o.normalStrength ?? []).map((r: Json) => ({ name: plain(r.n), value: r.v })),
    roughLevelsIn: levels(o.roughLevelsIn),
    roughLevelsOut: levels(o.roughLevelsOut),
    metalLevelsIn: levels(o.metalLevelsIn),
    metalLevelsOut: levels(o.metalLevelsOut),
    colorMaskLevels: rc.colorMaskLevelsIn ? { in: rc.colorMaskLevelsIn.Elements, out: rc.colorMaskLevelsOut?.Elements ?? [] } : undefined,
  };
}

/** Every game file whose path contains `query` and ends with `ext`, with the total the search reports. */
async function findAll(bridge: BridgeClient, query: string, ext: string): Promise<{ paths: string[]; total: number }> {
  const r = await bridge.search(query, 2000);
  const paths = [...new Set(r.items.map((i) => i.name).filter((n) => n.toLowerCase().endsWith(ext)))].sort();
  return { paths, total: r.total };
}

/**
 * Builds the library from the game the bridge has loaded and writes it to `dir`: every surface
 * template with its presets, every microblend, a thumbnail for each, and the counts of setups and
 * mask sets. Returns the library it wrote.
 */
export async function buildLibrary(bridge: BridgeClient, dir: string, progress: Progress = () => undefined): Promise<Library> {
  const started = Date.now();
  const info = await bridge.info();
  if (!info.gameLoaded) throw new Error("REDbridge has no game loaded. Set the game folder first.");
  fs.mkdirSync(path.join(dir, ThumbsFolder), { recursive: true });
  const tmp = fs.mkdtempSync(path.join(dir, "tmp-"));
  const failed: string[] = [];
  const missing: string[] = [];
  try {
    progress("Reading the game's file lists");
    const key = await gameKey(bridge);
    const templates = await findAll(bridge, ".mltemplate", ".mltemplate");
    const microblendFiles = await findAll(bridge, "\\microblends\\", ".xbm");
    const setups = (await bridge.search(".mlsetup", 1)).total;
    const masks = (await bridge.search(".mlmask", 1)).total;
    if (templates.total > templates.paths.length) failed.push(`Only the first ${templates.paths.length} of ${templates.total} templates were listed`);

    const lib: Library = {
      version: LibraryVersion,
      builtAt: new Date().toISOString(),
      key,
      bridge: { version: info.version, wolvenKit: info.wolvenKit },
      game: { dir: info.gameDir, archives: info.archives, files: info.files },
      counts: { templates: 0, microblends: 0, setups, masks },
      templates: [],
      microblends: [],
      failed,
      missing,
      seconds: 0,
    };

    const total = templates.paths.length + microblendFiles.paths.length;
    let done = 0;
    const thumbs = new Map<string, string | undefined>();
    const thumbnailFor = async (texture: string | undefined, source: "color" | "alpha" | "relief"): Promise<string | undefined> => {
      if (!texture) return undefined;
      const id = `${source}:${texture}`;
      if (thumbs.has(id)) return thumbs.get(id);
      const name = crypto.createHash("sha1").update(id).digest("hex").slice(0, 20) + ".png";
      const out = thumbnailFile(dir, name);
      try {
        if (!fs.existsSync(out)) {
          const png = path.join(tmp, name);
          await bridge.toPng(texture, png);
          const wrote = writeThumbnail(png, out, 96, source);
          fs.rmSync(png, { force: true });
          if (!wrote) {
            thumbs.set(id, undefined);
            return undefined;
          }
        }
        thumbs.set(id, name);
        return name;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (message.includes("is not in the loaded archives")) missing.push(texture);
        else failed.push(`${texture}: ${message}`);
        thumbs.set(id, undefined);
        return undefined;
      }
    };

    for (const p of templates.paths) {
      progress("Reading surfaces", ++done, total);
      try {
        const r = await bridge.toJson(p);
        if (!r.json) throw new Error("no JSON returned");
        const t = parseTemplate(p, JSON.parse(r.json));
        // The diffuse map; when it is flat (the detail is all in the normal map), the normal map as relief.
        t.thumbnail = (await thumbnailFor(t.textures.color, "color")) ?? (await thumbnailFor(t.textures.normal, "relief"));
        lib.templates.push(t);
      } catch (e) {
        failed.push(`${p}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    for (const p of microblendFiles.paths) {
      progress("Reading microblends", ++done, total);
      const name = path.basename(p).replace(/\.xbm$/i, "");
      lib.microblends.push({ path: p, name, thumbnail: await thumbnailFor(p, "alpha") });
    }

    lib.templates.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    lib.counts.templates = lib.templates.length;
    lib.counts.microblends = lib.microblends.length;
    lib.seconds = Math.round((Date.now() - started) / 100) / 10;
    const file = libraryFile(dir);
    fs.writeFileSync(file + ".new", JSON.stringify(lib));
    fs.renameSync(file + ".new", file);
    progress("Done");
    return lib;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---- finding things in the library --------------------------------------------------------------

/** Templates whose path or name holds every word of `query` (case-insensitive). An empty query matches all. */
export function searchTemplates(lib: Library, query: string): Template[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return lib.templates;
  return lib.templates.filter((t) => {
    const hay = `${t.path} ${t.title}`.toLowerCase().replace(/[\\_]/g, " ");
    return words.every((w) => hay.includes(w));
  });
}

/** Microblends whose name holds every word of `query`. */
export function searchMicroblends(lib: Library, query: string): Microblend[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return words.length ? lib.microblends.filter((m) => words.every((w) => m.name.toLowerCase().replace(/_/g, " ").includes(w))) : lib.microblends;
}

/** The templates grouped by category, in order, for views. */
export function byCategory(templates: Template[]): Map<string, Template[]> {
  const map = new Map<string, Template[]>();
  for (const t of templates) map.set(t.category, [...(map.get(t.category) ?? []), t]);
  return map;
}
