// Finding an item's materials (behavior spec, section 1): a clothing item's TweakDB record, its row in
// clothing.csv, the root entity's appearance rows (one per body), the .app appearance and its resolved
// mesh components, each mesh appearance's materials, and for a multilayered one its setup and its
// exact mask set. Also a mesh's materials on their own, and the item list, cached beside the library.

import * as fs from "node:fs";
import * as path from "node:path";
import type { BridgeClient } from "./bridgeClient";
import { gameKey, jsonValue } from "./library";

export interface ItemEntry {
  /** The TweakDB record, such as Items.CasualShoes_01_basic_01. */
  id: string;
  /** The in-game name, such as "Sunny Ammo synthetic high-tops"; null when it has none. */
  name: string | null;
  entityName: string;
  appearanceName: string;
  /** The equipment slot, such as Feet. */
  slot: string;
}

export interface MaterialUse {
  /** The mesh's material entry name, as the appearance's chunkMaterials list it. */
  name: string;
  /** How many render chunks (across LODs) use it in this appearance. */
  chunks: number;
  /** The material template at the end of the chain, such as engine\materials\multilayered.mt. */
  base: string;
  multilayered: boolean;
  setup?: string;
  mask?: string;
  globalNormal?: string;
  /** The .mi files between the mesh and the base material, when the material is external. */
  instances: string[];
}

export interface MeshLook {
  mesh: string;
  /** The mesh appearance, such as red_yellow_graphic. */
  appearance: string;
  /** The component that shows it, when found through an item. */
  component?: string;
  materials: MaterialUse[];
}

export interface ItemLook {
  /** masculine (&Male), feminine (&Female), or any (a row with no body suffix). */
  body: "masculine" | "feminine" | "any";
  app: string;
  appAppearance: string;
  meshes: MeshLook[];
}

export interface ItemMaterials {
  item: ItemEntry;
  root: string;
  looks: ItemLook[];
  warnings: string[];
}

type Json = Record<string, any>;
const v = jsonValue;
const ItemsFile = "items.json";

/** Every clothing item in the game with its in-game name. Read from TweakDB once per game version and cached in `dir`. */
export async function loadItems(bridge: BridgeClient, dir: string): Promise<ItemEntry[]> {
  const key = await gameKey(bridge);
  const file = path.join(dir, ItemsFile);
  try {
    const cached = JSON.parse(fs.readFileSync(file, "utf8")) as { key: string; items: ItemEntry[] };
    if (cached.key === key) return cached.items;
  } catch {
    // No cache yet.
  }
  const r = await bridge.tweakRecords({ type: "Clothing", flats: ["entityName", "appearanceName", "displayName", "equipArea"], resolveLocKeys: true, limit: 100000 });
  const items: ItemEntry[] = r.items
    .filter((i) => i.path && i.flats?.entityName && i.flats?.appearanceName)
    .map((i) => {
      const f = i.flats!;
      const name = f.displayName && typeof f.displayName === "object" && "text" in f.displayName ? (f.displayName as { text: string | null }).text : null;
      return { id: i.path!, name: name || null, entityName: String(f.entityName), appearanceName: String(f.appearanceName), slot: String(f.equipArea ?? "").replace(/^EquipmentArea\./, "") };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ key, items }));
  return items;
}

/**
 * Items whose name, record id or slot holds every word of `query`. Those holding the words as one
 * phrase come first (Pants_03_basic_01 before FormalPants_01_basic_03), then the game's own items
 * before crafting and test records.
 */
export function searchItems(items: ItemEntry[], query: string): ItemEntry[] {
  const phrase = query.toLowerCase().replace(/[._]/g, " ").replace(/\s+/g, " ").trim();
  const words = phrase.split(" ").filter(Boolean);
  if (!words.length) return [];
  const hay = (i: ItemEntry) => ` ${i.name ?? ""} ${i.id} ${i.slot} `.toLowerCase().replace(/[._]/g, " ").replace(/\s+/g, " ");
  const rank = (i: ItemEntry) => (hay(i).includes(` ${phrase} `) ? 0 : hay(i).includes(phrase) ? 1 : 2) * 3 + (!i.id.startsWith("Items.") ? 2 : /_crafting$/i.test(i.id) ? 1 : 0);
  return items.filter((i) => words.every((w) => hay(i).includes(w))).sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
}

/** Reads game files as JSON once per walk. */
class Reader {
  private readonly cache = new Map<string, Promise<Json>>();
  constructor(private readonly bridge: BridgeClient) {}
  json(p: string): Promise<Json> {
    const k = p.toLowerCase();
    if (!this.cache.has(k)) {
      this.cache.set(k, this.bridge.toJson(p).then((r) => {
        if (!r.json) throw new Error(`REDbridge returned no JSON for ${p}.`);
        return JSON.parse(r.json) as Json;
      }));
    }
    return this.cache.get(k)!;
  }
}

const isShadow = (meshPath: string) => /\\shadow_meshes\\|_shadow\.mesh$/i.test(meshPath);

/** A material's chain through .mi files to its base, and the multilayered parameters found on the way (the nearest wins). */
async function resolveMaterial(read: Reader, material: Json, name: string, chunks: number): Promise<MaterialUse> {
  const use: MaterialUse = { name, chunks, base: "", multilayered: false, instances: [] };
  let current: Json | undefined = material;
  for (let depth = 0; current && depth < 8; depth++) {
    for (const value of current.values ?? []) {
      if (value.MultilayerSetup && !use.setup) use.setup = v(value.MultilayerSetup) || undefined;
      if (value.MultilayerMask && !use.mask) use.mask = v(value.MultilayerMask) || undefined;
      if (value.GlobalNormal && !use.globalNormal) use.globalNormal = v(value.GlobalNormal) || undefined;
    }
    const base = v(current.baseMaterial) as string | undefined;
    if (!base) break;
    use.base = base;
    if (!/\.mi$/i.test(base)) break;
    use.instances.push(base);
    current = (await read.json(base)).Data?.RootChunk;
  }
  use.multilayered = !!use.setup || /multilayer/i.test(use.base);
  return use;
}

async function meshLook(read: Reader, meshPath: string, appearance: string, component?: string): Promise<MeshLook> {
  const mesh = (await read.json(meshPath)).Data.RootChunk;
  const looks = (mesh.appearances ?? []).map((a: Json) => a.Data ?? a);
  const look = looks.find((a: Json) => v(a.name) === appearance) ?? looks.find((a: Json) => v(a.name) === "default") ?? looks[0];
  const counts = new Map<string, number>();
  for (const n of look?.chunkMaterials ?? []) counts.set(v(n), (counts.get(v(n)) ?? 0) + 1);
  const entries: Json[] = mesh.materialEntries ?? [];
  const materials: MaterialUse[] = [];
  for (const [name, chunks] of counts) {
    const entry = entries.find((e) => v(e.name) === name);
    if (!entry) {
      materials.push({ name, chunks, base: "", multilayered: false, instances: [] });
      continue;
    }
    const local = Number(entry.isLocalInstance) === 1 || entry.isLocalInstance === true;
    if (local) {
      const m = mesh.localMaterialBuffer?.materials?.[entry.index] ?? mesh.preloadLocalMaterialInstances?.[entry.index]?.Data;
      materials.push(m ? await resolveMaterial(read, m, name, chunks) : { name, chunks, base: "", multilayered: false, instances: [] });
    } else {
      const ext = v(mesh.externalMaterials?.[entry.index]) as string | undefined;
      const use = ext ? await resolveMaterial(read, { baseMaterial: { DepotPath: { $value: ext } } }, name, chunks) : { name, chunks, base: "", multilayered: false, instances: [] };
      materials.push(use);
    }
  }
  return { mesh: meshPath, appearance: v(look?.name) ?? appearance, component, materials };
}

/** A mesh's materials in one appearance, or in every appearance when none is given. */
export async function meshMaterials(bridge: BridgeClient, meshPath: string, appearance?: string): Promise<MeshLook[]> {
  const read = new Reader(bridge);
  if (appearance) return [await meshLook(read, meshPath, appearance)];
  const mesh = (await read.json(meshPath)).Data.RootChunk;
  const names: string[] = (mesh.appearances ?? []).map((a: Json) => v((a.Data ?? a).name));
  const out: MeshLook[] = [];
  for (const n of names) out.push(await meshLook(read, meshPath, n));
  return out;
}

/** The mesh components of an .app appearance: resolved components first, else its parts with their overrides. */
async function appMeshes(read: Reader, app: Json): Promise<{ component: string; mesh: string; appearance: string }[]> {
  const fromComponents = (components: Json[] | undefined) =>
    (components ?? [])
      .filter((c) => c.mesh && /\.mesh$/i.test(v(c.mesh) ?? ""))
      .map((c) => ({ component: v(c.name) as string, mesh: v(c.mesh) as string, appearance: (v(c.meshAppearance) as string) || "default" }));
  const resolved = fromComponents(app.components);
  if (resolved.length) return resolved;
  const overrides = new Map<string, string>();
  for (const part of app.partsOverrides ?? []) for (const o of part.componentsOverrides ?? []) if (v(o.meshAppearance)) overrides.set(v(o.componentName), v(o.meshAppearance));
  const out: { component: string; mesh: string; appearance: string }[] = [];
  for (const part of app.partsValues ?? []) {
    const ent = v(part.resource) as string | undefined;
    if (!ent) continue;
    const root = (await read.json(ent)).Data.RootChunk;
    for (const c of fromComponents(root.components)) out.push({ ...c, appearance: overrides.get(c.component) ?? c.appearance });
  }
  return out;
}

/** Walks from a clothing item to its meshes and materials, for each body type it has. */
export async function itemMaterials(bridge: BridgeClient, item: ItemEntry): Promise<ItemMaterials> {
  const read = new Reader(bridge);
  const warnings: string[] = [];
  const csv = (await read.json("base\\gameplay\\factories\\items\\clothing.csv")).Data.RootChunk;
  const row = (csv.data as unknown[]).map((r: any) => (r.elements ?? r) as string[]).find((r) => r[0] === item.entityName);
  if (!row) throw new Error(`${item.entityName} is not in clothing.csv: the item may come from a mod (ArchiveXL), which M2 does not follow yet.`);
  const root = row[1];
  const ent = (await read.json(root)).Data.RootChunk;
  const rows = (ent.appearances as Json[]).filter((a) => [`${item.appearanceName}&Male`, `${item.appearanceName}&Female`, item.appearanceName].includes(v(a.name)));
  if (!rows.length) warnings.push(`No appearance named ${item.appearanceName} in ${root}.`);
  const looks: ItemLook[] = [];
  for (const r of rows) {
    const name = v(r.name) as string;
    const appPath = v(r.appearanceResource) as string;
    const appName = v(r.appearanceName) as string;
    const app = (await read.json(appPath)).Data.RootChunk;
    const appearance = (app.appearances as Json[]).map((x) => x.Data ?? x).find((x) => v(x.name) === appName);
    if (!appearance) {
      warnings.push(`No appearance ${appName} in ${appPath}.`);
      continue;
    }
    const meshes: MeshLook[] = [];
    for (const m of (await appMeshes(read, appearance)).filter((x) => !isShadow(x.mesh))) {
      try {
        meshes.push(await meshLook(read, m.mesh, m.appearance, m.component));
      } catch (e) {
        warnings.push(`${m.mesh}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    looks.push({ body: name.endsWith("&Male") ? "masculine" : name.endsWith("&Female") ? "feminine" : "any", app: appPath, appAppearance: appName, meshes });
  }
  looks.sort((a, b) => a.body.localeCompare(b.body));
  return { item, root, looks, warnings };
}
