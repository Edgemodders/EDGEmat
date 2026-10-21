// A material from an image (design, "Generate a material"): made seamless, its bumps and shine derived,
// written into a project as textures and a textured .mi on metal_base.remt, and put on mesh materials.
// On a garment (a material with its own normal map, which draws its folds) the repeat is baked into
// the texture and LayerTile stays 1, so the folds keep their scale; elsewhere LayerTile is the repeat
// (design, "On a garment"; the tiling check in docs/testing.md).

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { BridgeClient } from "./bridgeClient";
import { applyMaterial, writeTexture, writeTexturedMaterial } from "./apply";
import { namedMaterials } from "./find";
import { makeSeamless, normalMap, readPng, repeat, resize, roughnessMap, squareCrop, writePng } from "./maps";

export type Shine = "matte" | "satin" | "glossy";

/** Roughness = scale × map + bias; the derived map averages mid-grey. Matte about 0.8, satin 0.55, glossy 0.2. */
const ShineValues: Record<Shine, { scale: number; bias: number }> = {
  matte: { scale: 0.3, bias: 0.65 },
  satin: { scale: 0.3, bias: 0.4 },
  glossy: { scale: 0.2, bias: 0.1 },
};

/** How a material was made, kept beside it (design, step 5): mod sites may ask for AI content to be labelled. */
export interface MadeBy {
  service?: string;
  model?: string;
  prompt?: string;
  /** The modder's own words, before the prefix. */
  words?: string;
  /** An image file the modder gave instead. */
  file?: string;
}

export interface NewMaterial {
  /** The material's name; made into a file name (`brown leather` → `brown_leather`). */
  name: string;
  /** The image, as PNG. */
  image: Buffer;
  /** How many times it repeats across a garment or object, 1 to 32. Default 4. */
  repeat?: number;
  /** Bumps: 0 flat, 1 moderate, 2 strong. Default 1. */
  bumps?: number;
  shine?: Shine;
  metal?: boolean;
  made?: MadeBy;
}

export interface MaterialTarget {
  /** A mesh's game path. */
  mesh: string;
  /** The material entry's name in it. */
  material: string;
}

export interface MaterialResult {
  /** The material's folder, a game path. */
  folder: string;
  /** The plain material: LayerTile is the repeat. */
  mi: string;
  /** Each target, and the .mi it now uses. */
  applied: { mesh: string; material: string; mi: string; how: "repeat in the texture" | "LayerTile" }[];
  /** Files written into source\archive, as game paths. */
  written: string[];
  /** Files written into source\raw (the image and the record), as paths on disk. */
  raw: string[];
}

/** A file name from a material's words: lower case, letters, digits and underscores, at most 40. */
export function materialSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40).replace(/_+$/, "") || "material";
}

const isPng = (b: Buffer) => b.length > 8 && b.readUInt32BE(0) === 0x89504e47;

/** Any image REDbridge reads (PNG, JPG, TGA, DDS, BMP, TIFF) as PNG bytes. */
export async function imageAsPng(bridge: BridgeClient, bytes: Buffer, ext = ".jpg"): Promise<Buffer> {
  if (isPng(bytes)) return bytes;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "edgemat-image-"));
  try {
    const src = path.join(dir, `image${ext.startsWith(".") ? ext : `.${ext}`}`), out = path.join(dir, "image.png");
    fs.writeFileSync(src, bytes);
    await bridge.imageToPng(src, out);
    return fs.readFileSync(out);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const stem = (p: string) => path.win32.basename(p).replace(/\.[^.]+$/, "");

/**
 * Writes a material from an image into a project's source\archive, and puts it on each target. The
 * image and a record of how it was made go to source\raw beside it.
 */
export async function makeMaterial(bridge: BridgeClient, archive: string, m: NewMaterial, targets: MaterialTarget[] = []): Promise<MaterialResult> {
  const slug = materialSlug(m.name);
  const folder = `edgemat\\materials\\${slug}`;
  const n = Math.min(32, Math.max(1, Math.round(m.repeat ?? 4)));
  const shine = ShineValues[m.shine ?? "satin"];
  const result: MaterialResult = { folder, mi: `${folder}\\${slug}.mi`, applied: [], written: [], raw: [] };

  // The image, square and seamless, at 1024 px for the maps.
  const seamless = makeSeamless(squareCrop(readPng(m.image)));
  const base = resize(seamless, 1024, 1024);
  const rough = roughnessMap(base);
  const common = { roughnessScale: shine.scale, roughnessBias: shine.bias, ...(m.metal ? { metalness: 1 } : {}) };

  // The plain material, for objects and new meshes: LayerTile repeats all three maps.
  const tex = (suffix: string) => `${folder}\\${slug}${suffix}.xbm`;
  result.written.push(...(await writeTexture(bridge, archive, tex("_d01"), writePng(base), "color")));
  result.written.push(...(await writeTexture(bridge, archive, tex("_n01"), writePng(normalMap(base, m.bumps ?? 1)), "normal")));
  result.written.push(...(await writeTexture(bridge, archive, tex("_r01"), writePng(rough), "rough")));
  result.written.push(...(await writeTexturedMaterial(bridge, archive, result.mi, { baseColor: tex("_d01"), normal: tex("_n01"), roughness: tex("_r01"), layerTile: n, ...common })));

  // On a garment: the repeat baked into one 2048 px texture (and the roughness at 1024), the garment's own normal map kept.
  let baked = false;
  for (const t of targets) {
    const use = (await namedMaterials(bridge, t.mesh, [t.material], archive))[0];
    if (!use) throw new Error(`${t.mesh} has no material named ${t.material}.`);
    // A normal map EDGEmat made itself (a material applied before) is not the garment's folds.
    const own = use.multilayered ? use.globalNormal : use.normal;
    const folds = own && !/^edgemat\\materials\\/i.test(own) ? own : undefined;
    let mi = result.mi;
    let how: "repeat in the texture" | "LayerTile" = "LayerTile";
    if (folds) {
      const color = tex(`_x${n}_d01`), roughX = tex(`_x${n}_r01`);
      if (!baked) {
        result.written.push(...(await writeTexture(bridge, archive, color, writePng(repeat(seamless, n, 2048)), "color")));
        result.written.push(...(await writeTexture(bridge, archive, roughX, writePng(repeat(rough, n, 1024)), "rough")));
        baked = true;
      }
      mi = `${folder}\\${slug}_x${n}_${stem(folds)}.mi`;
      if (!result.written.includes(mi)) result.written.push(...(await writeTexturedMaterial(bridge, archive, mi, { baseColor: color, normal: folds, roughness: roughX, layerTile: 1, ...common })));
      how = "repeat in the texture";
    }
    result.written.push(...(await applyMaterial(bridge, archive, t.mesh, t.material, mi)).filter((f) => !result.written.includes(f)));
    result.applied.push({ mesh: t.mesh, material: t.material, mi, how });
  }

  // The image and the record, in source\raw: not packed, kept with the project.
  const rawDir = path.join(path.resolve(archive, "..", "raw"), folder);
  fs.mkdirSync(rawDir, { recursive: true });
  const source = path.join(rawDir, `${slug}_source.png`), record = path.join(rawDir, `${slug}.edgemat.json`);
  fs.writeFileSync(source, m.image);
  const made = { made: new Date().toISOString(), tool: "EDGEmat", name: m.name, ...m.made, repeat: n, bumps: m.bumps ?? 1, shine: m.shine ?? "satin", metal: !!m.metal, material: result.mi, applied: result.applied, files: result.written };
  fs.writeFileSync(record, JSON.stringify(made, null, 2));
  result.raw.push(source, record);
  return result;
}
