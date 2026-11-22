// Renderable materials for REDcode's 3D view (REDcode issue #6; design, "Preview"), a first version:
// each material's color only, marked approximate. A multilayered material shows its color map (each
// layer's color laid through its mask, in texture space, as the setup editor draws it); a textured
// material shows its own color texture, tinted by its BaseColorScale, with its glow's color laid over it
// where its Emissive mask is on (the viewer has no glow of its own yet). Bumps, shine, metal and
// microblends come with the bake (M5).

import * as fs from "node:fs";
import * as path from "node:path";
import { bakeColor } from "./bake";
import type { BridgeClient } from "./bridgeClient";
import { Desk } from "./desk";
import { isFilePath, namedMaterials, meshMaterials, type MaterialUse } from "./find";
import { wholeTexture } from "./images";
import { readPng, resize, writePng, type Image } from "./maps";
import type { Library } from "./library";
import { openSetup, type SetupSource } from "./openSetup";
import { projectArchive } from "./project";

/** The shape REDcode's viewer takes (REDcode `src/edgemat.ts`): PBR maps in the mesh's UV space, as PNG bytes. */
export interface RenderedMaterial {
  baseColor?: Uint8Array;
  normal?: Uint8Array;
  roughness?: Uint8Array;
  metalness?: Uint8Array;
  fidelity: "approximate" | "checked";
}

export interface RenderRequest {
  /** A game path, or a .mesh file on disk (a project's copy). */
  mesh: string;
  /** The mesh appearance shown; its materials are rendered when `materials` is not given. */
  appearance?: string;
  /** The material names to render. */
  materials?: string[];
}

/**
 * Renders a mesh's materials, by name. A material with nothing to show (no setup, no mask set, no
 * color texture) is left out, so the viewer keeps its flat color for it. Problems go to `log`.
 * `live`: the color map of a setup open in an editor, by the game path a material names, so a 3D view shows
 * edits not saved yet; undefined when no editor has it open. `roots` says which editors count: the folders
 * the mesh's files are read from (undefined for the game's).
 */
export async function renderMaterials(bridge: BridgeClient, lib: Library | undefined, dir: string, req: RenderRequest, log: (line: string) => void = () => {}, live?: (setup: string, roots: (string | undefined)[]) => string | undefined): Promise<Record<string, RenderedMaterial>> {
  const root = isFilePath(req.mesh) ? projectArchive(req.mesh) : undefined;
  // A game path, or the copy at that path in the mesh's project when there is one. A Desk entry's mesh copy
  // sits in the entry's own project-shaped folder, so its edits are read the same way, then the project it
  // came from, if any (a prop's part materials live there only). A game mesh keeps the game's look.
  const back = new Desk(dir).sourceOf(root);
  const uses = req.materials?.length
    ? await namedMaterials(bridge, req.mesh, req.materials, [root, back])
    : (await meshMaterials(bridge, req.mesh, req.appearance ?? "default", [root, back]))[0]?.materials ?? [];
  const local = (p: string) => [root, back].map((r) => (r ? path.join(r, p) : "")).find((f) => f && fs.existsSync(f));
  const out: Record<string, RenderedMaterial> = {};
  for (const use of uses) {
    try {
      const png = (use.multilayered && use.setup ? live?.(use.setup, back ? [root, back] : [root]) : undefined) ?? (await colorMap(bridge, lib, dir, use, local));
      if (png) out[use.name] = { baseColor: typeof png === "string" ? fs.readFileSync(png) : png, fidelity: "approximate" };
    } catch (e) {
      log(`3D view, ${use.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return out;
}

/** The PNG (a file, or bytes when tinted or glowing) that shows a material's colors, or undefined when there is none to show. */
async function colorMap(bridge: BridgeClient, lib: Library | undefined, dir: string, use: MaterialUse, local: (p: string) => string | undefined): Promise<string | Buffer | undefined> {
  if (use.multilayered) {
    if (!use.setup) return undefined;
    const file = local(use.setup);
    const source: SetupSource = file ? { file, gamePath: use.setup } : { gamePath: use.setup };
    const opened = await openSetup(bridge, lib, dir, source, use.mask ? local(use.mask) ?? use.mask : undefined);
    return bakeColor(opened, lib, dir) ?? opened.composite?.file;
  }
  const texture = (p: string) => {
    const file = local(p);
    return wholeTexture(bridge, dir, file ? { file } : { gamePath: p });
  };
  const color = use.baseColor ? await texture(use.baseColor) : undefined;
  if (!use.tint && !use.glow) return color;
  if (!color && !use.glow) return undefined;
  const mask = use.glow?.mask ? readPng(fs.readFileSync(await texture(use.glow.mask))) : undefined;
  return writePng(shade(color ? readPng(fs.readFileSync(color)) : undefined, use.tint, use.glow && { mask, color: use.glow.color, ev: use.glow.ev }));
}

/**
 * The color texture (white without one) times the tint, then the glow's color laid over it by the mask's
 * brightness (all of it without a mask), fully from EmissiveEV 1 and fading out towards 0. An approximation
 * until the viewer draws glow itself: it shows the glow's color, not its light.
 */
export function shade(color: Image | undefined, tint: [number, number, number] | undefined, glow: { mask?: Image; color: [number, number, number]; ev: number } | undefined): Image {
  const size = color ?? glow?.mask ?? { width: 1, height: 1 };
  const out: Image = { width: size.width, height: size.height, data: new Uint8Array(size.width * size.height * 4) };
  if (color) out.data.set(color.data);
  else out.data.fill(255);
  const t = tint ?? [1, 1, 1];
  const mask = glow?.mask && (glow.mask.width !== out.width || glow.mask.height !== out.height) ? resize(glow.mask, out.width, out.height) : glow?.mask;
  const strength = glow ? Math.min(1, Math.max(0, glow.ev)) : 0;
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  for (let i = 0; i < out.data.length; i += 4) {
    const m = glow ? strength * (mask ? (0.2126 * mask.data[i] + 0.7152 * mask.data[i + 1] + 0.0722 * mask.data[i + 2]) / 255 : 1) : 0;
    for (let c = 0; c < 3; c++) out.data[i + c] = clamp(out.data[i + c] * t[c] * (1 - m) + (glow ? glow.color[c] * (mask ? mask.data[i + c] / 255 : 1) : 0) * m);
  }
  return out;
}
