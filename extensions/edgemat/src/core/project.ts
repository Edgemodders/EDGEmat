// Saving into a project (design, "Open any file, then save it into a project"; behavior spec, section 6).
// A project is a WolvenKit project folder: files go to source\archive at their game path. A recolor is
// saved at a new path by default, with every mesh that uses the old setup copied into the project and
// pointed at the new one, so it shows in the game without the Material Texture Override mod. Saving at
// the game's own path replaces the game's setup, which needs that mod.

import * as fs from "node:fs";
import * as path from "node:path";
import type { BridgeClient } from "./bridgeClient";
import { setupToJson } from "./edit";
import { jsonValue } from "./library";
import type { Setup } from "./setup";

type Json = Record<string, any>;

export interface Project {
  /** The project folder, holding the .cpmodproj and source. */
  dir: string;
  /** Its source\archive folder, where files go at their game path. */
  archive: string;
  name: string;
  /** The .cpmodproj, when there is one. */
  file?: string;
}

/** The project at a .cpmodproj, a project folder, or its source\archive folder; undefined when it is none of them. */
export function projectAt(p: string): Project | undefined {
  let dir = p;
  if (/\.cpmodproj$/i.test(p)) dir = path.dirname(p);
  else if (/[\\/]source[\\/]archive[\\/]?$/i.test(p)) dir = path.resolve(p, "..", "..");
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return undefined;
  const proj = fs.readdirSync(dir).find((f) => /\.cpmodproj$/i.test(f));
  const archive = path.join(dir, "source", "archive");
  if (!proj && !fs.existsSync(archive)) return undefined;
  return { dir, archive, name: proj ? proj.replace(/\.cpmodproj$/i, "") : path.basename(dir), file: proj ? path.join(dir, proj) : undefined };
}

/** The source\archive folder of the project a file sits in, whose copies win over the game's. */
export function projectArchive(file: string): string | undefined {
  const m = file.replace(/\//g, "\\").match(/^(.*\\source\\archive)\\/i);
  return m ? m[1] : undefined;
}

/** A short word from a project's name for new file names: lower case, letters, digits and underscores. */
export function suffixFor(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32) || "edit";
}

/** A new game path beside the original, named with the suffix: ...\ml_x.mlsetup to ...\ml_x_<suffix>.mlsetup. */
export function newPathFor(gamePath: string, suffix: string): string {
  const ext = path.extname(gamePath);
  const base = gamePath.slice(0, gamePath.length - ext.length);
  return base.toLowerCase().endsWith(`_${suffix}`) ? gamePath : `${base}_${suffix}${ext}`;
}

const isShadow = (p: string) => /\\shadow_meshes\\|_shadow\.mesh$/i.test(p);
const same = (a: unknown, b: string) => typeof a === "string" && a.toLowerCase() === b.toLowerCase();

/** A mesh, or an .mi, as JSON: the project's copy first, else the game's. */
async function readJson(bridge: BridgeClient, archive: string | undefined, gamePath: string): Promise<{ json: Json; fromProject: boolean }> {
  const local = archive ? path.join(archive, gamePath) : undefined;
  const fromProject = !!local && fs.existsSync(local);
  const r = fromProject ? await bridge.fileToJson(local!) : await bridge.toJson(gamePath);
  if (!r.json) throw new Error(`REDbridge returned no JSON for ${gamePath}.`);
  return { json: JSON.parse(r.json), fromProject };
}

/** A local material of a mesh by its entry index: the parsed buffer, or the older preload list. */
function localMaterial(root: Json, index: number): Json | undefined {
  return root.localMaterialBuffer?.materials?.[index] ?? root.preloadLocalMaterialInstances?.[index]?.Data;
}

/** The values of a material that name a setup, as WolvenKit JSON objects that can be changed in place. */
const setupValues = (material: Json | undefined): Json[] => (material?.values ?? []).filter((v: Json) => v.MultilayerSetup);

/** The mask set a material names, as a game path. */
function maskOf(material: Json | undefined): string | undefined {
  const v = (material?.values ?? []).find((x: Json) => x.MultilayerMask);
  const p = v ? jsonValue(v.MultilayerMask) : undefined;
  return typeof p === "string" && p && p !== "0" ? p : undefined;
}

export interface MeshUse {
  mesh: string;
  /** The mesh's materials that use the setup, by entry name. */
  materials: string[];
  /** The mask sets those materials name, as game paths. */
  masks?: string[];
}

/** Which materials of a mesh name one of `setups` (directly, or through the .mi an entry points at), and their mask sets. */
async function usesIn(bridge: BridgeClient, archive: string | undefined, root: Json, setups: string[]): Promise<{ materials: string[]; masks: string[] }> {
  const materials: string[] = [];
  const masks = new Set<string>();
  const check = (name: string, material: Json | undefined) => {
    if (!setupValues(material).some((v) => setups.some((s) => same(jsonValue(v.MultilayerSetup), s)))) return;
    materials.push(name);
    const mask = maskOf(material);
    if (mask) masks.add(mask);
  };
  for (const e of root.materialEntries ?? []) {
    const name = String(jsonValue(e.name));
    const local = Number(e.isLocalInstance) === 1 || e.isLocalInstance === true;
    if (local) {
      check(name, localMaterial(root, e.index));
    } else {
      const mi = jsonValue(root.externalMaterials?.[e.index]);
      if (typeof mi !== "string" || !/\.mi$/i.test(mi)) continue;
      try {
        const { json } = await readJson(bridge, archive, mi);
        check(name, json.Data?.RootChunk);
      } catch {
        // An .mi that cannot be read does not use it, as far as we can tell.
      }
    }
  }
  return { materials, masks: [...masks] };
}

/**
 * The meshes that use a setup, looked for in the garment's folder: the setup's folder, or the one above
 * a textures folder. Game meshes (unless `gameMeshes` is false) and the project's own. Shadow meshes are
 * left out. At most `limit` meshes are read. `report`, when given, gets the folder, how many meshes were
 * read, and the ones that could not be read, with why. `alsoNamed`: other setups that count as this one,
 * such as the copy saved before, which the project's meshes already point at.
 */
export async function meshesUsing(bridge: BridgeClient, setup: string, archive?: string, limit = 60, gameMeshes = true, report?: MeshSearch, alsoNamed: string[] = []): Promise<MeshUse[]> {
  let folder = path.win32.dirname(setup);
  if (/\\textures$/i.test(folder)) folder = path.win32.dirname(folder);
  const meshes = new Set<string>();
  if (gameMeshes) {
    const r = await bridge.list({ prefix: folder + "\\", limit: 20000 });
    for (const i of r.items) if (/\.mesh$/i.test(i.name) && !isShadow(i.name)) meshes.add(i.name);
  }
  const local = archive ? path.join(archive, folder) : undefined;
  if (local && fs.existsSync(local)) {
    const walk = (d: string) => {
      for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, f.name);
        if (f.isDirectory()) walk(full);
        else if (/\.mesh$/i.test(f.name)) meshes.add(path.relative(archive!, full));
      }
    };
    walk(local);
  }
  const out: MeshUse[] = [];
  const read = [...meshes].filter((m) => !isShadow(m)).slice(0, limit);
  if (report) Object.assign(report, { folder, read: read.length, skipped: [] });
  for (const mesh of read) {
    try {
      const { json } = await readJson(bridge, archive, mesh);
      const use = await usesIn(bridge, archive, json.Data.RootChunk, [setup, ...alsoNamed]);
      if (use.materials.length) out.push({ mesh, ...use });
    } catch (e) {
      // A mesh that cannot be read is skipped, and reported.
      report?.skipped.push({ mesh, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}

/** What a meshesUsing search looked at: the garment folder, the meshes read, and the ones it could not read. */
export interface MeshSearch {
  folder: string;
  read: number;
  skipped: { mesh: string; reason: string }[];
}

export interface SaveRequest {
  setup: Setup;
  /** The project's source\archive folder. */
  archive: string;
  /** The game path to write the setup at. */
  target: string;
  /** The game path the setup was read from. With a different target, the meshes' materials naming it are pointed at the target. */
  from?: string;
  /** The meshes to point at the target, by game path. Each is copied into the project unless it is there already. */
  meshes?: string[];
  /** For a copy of an .mi that names the setup: ...\x.mi becomes ...\x_<suffix>.mi beside the new setup. */
  suffix?: string;
}

export interface SaveResult {
  /** Files written, relative to the archive folder. */
  written: string[];
  /** Each mesh and the materials pointed at the new setup. */
  meshes: MeshUse[];
  notes: string[];
}

async function writeJson(bridge: BridgeClient, archive: string, gamePath: string, json: Json): Promise<void> {
  const out = path.join(archive, gamePath);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await bridge.fromJson(out, { json: JSON.stringify(json) });
}

/** Writes the setup into the project at `target`, and points the meshes that used `from` at it. */
export async function saveToProject(bridge: BridgeClient, req: SaveRequest): Promise<SaveResult> {
  const target = req.target.replace(/\//g, "\\");
  if (!/\.mlsetup$/i.test(target)) throw new Error(`A setup's game path ends in .mlsetup: ${target}`);
  if (/^[a-z]:\\|^\\\\/i.test(target)) throw new Error(`The target is a game path such as base\\...\\x.mlsetup, not a path on disk: ${target}`);
  const result: SaveResult = { written: [], meshes: [], notes: [] };
  await writeJson(bridge, req.archive, target, setupToJson(req.setup));
  result.written.push(target);

  const from = req.from;
  if (!from || same(from, target) || !req.meshes?.length) return result;
  const suffix = req.suffix ?? "edit";
  for (const mesh of req.meshes) {
    const { json } = await readJson(bridge, req.archive, mesh);
    const root = json.Data.RootChunk;
    const pointed: string[] = [];
    let changed = false;
    // A material that names the target already (the project's copy from an earlier save) counts as pointed.
    const namesTarget = (material: Json | undefined) => setupValues(material).some((v) => same(jsonValue(v.MultilayerSetup), target));
    for (const e of root.materialEntries ?? []) {
      const name = String(jsonValue(e.name));
      const local = Number(e.isLocalInstance) === 1 || e.isLocalInstance === true;
      if (local) {
        const material = localMaterial(root, e.index);
        const values = setupValues(material).filter((v) => same(jsonValue(v.MultilayerSetup), from));
        for (const v of values) v.MultilayerSetup = { DepotPath: { $type: "ResourcePath", $storage: "string", $value: target }, Flags: v.MultilayerSetup.Flags ?? "Default" };
        if (values.length) changed = true;
        if (values.length || namesTarget(material)) pointed.push(name);
        continue;
      }
      // An entry that points at an .mi naming the setup: a copy of the .mi beside the new setup, and the entry pointed at the copy.
      const ref = root.externalMaterials?.[e.index];
      const mi = jsonValue(ref);
      if (typeof mi !== "string" || !/\.mi$/i.test(mi)) continue;
      const { json: miJson } = await readJson(bridge, req.archive, mi).catch(() => ({ json: undefined as Json | undefined }));
      if (namesTarget(miJson?.Data?.RootChunk)) {
        pointed.push(name);
        continue;
      }
      const values = setupValues(miJson?.Data?.RootChunk).filter((v) => same(jsonValue(v.MultilayerSetup), from));
      if (!miJson || !values.length) continue;
      changed = true;
      for (const v of values) v.MultilayerSetup = { DepotPath: { $type: "ResourcePath", $storage: "string", $value: target }, Flags: v.MultilayerSetup.Flags ?? "Default" };
      const copy = path.win32.join(path.win32.dirname(target), `${path.win32.basename(mi, ".mi")}_${suffix}.mi`);
      await writeJson(bridge, req.archive, copy, miJson);
      result.written.push(copy);
      root.externalMaterials[e.index] = { ...ref, DepotPath: { $type: "ResourcePath", $storage: "string", $value: copy } };
      pointed.push(name);
    }
    if (!pointed.length) {
      result.notes.push(`${mesh} has no material that names ${from}, so it was not copied.`);
      continue;
    }
    if (changed) {
      await writeJson(bridge, req.archive, mesh, json);
      result.written.push(mesh);
    }
    result.meshes.push({ mesh, materials: pointed });
  }
  return result;
}

/** Whether a game path is one of the game's own files: saving there replaces it, which needs Material Texture Override for a setup. */
export async function isGameFile(bridge: BridgeClient, gamePath: string): Promise<boolean> {
  const r = await bridge.search(path.win32.basename(gamePath), 50).catch(() => ({ items: [] as { name: string }[] }));
  return r.items.some((i) => same(i.name, gamePath));
}
