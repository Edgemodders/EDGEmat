// Renderable materials for REDcode's 3D view (REDcode issue #6; design, "Preview"), a first version:
// each material's color only, marked approximate. A multilayered material shows its color map (each
// layer's color laid through its mask, in texture space, as the setup editor draws it); a textured
// material shows its own color texture. Bumps, shine, metal and microblends come with the bake (M5).

import * as fs from "node:fs";
import * as path from "node:path";
import type { BridgeClient } from "./bridgeClient";
import { isFilePath, namedMaterials, meshMaterials, type MaterialUse } from "./find";
import { wholeTexture } from "./images";
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
 */
/**
 * `live`: the color map of a setup open in an editor, by the game path a material names, so a 3D view shows
 * edits not saved yet; undefined when no editor has it open.
 */
export async function renderMaterials(bridge: BridgeClient, lib: Library | undefined, dir: string, req: RenderRequest, log: (line: string) => void = () => {}, live?: (setup: string) => string | undefined): Promise<Record<string, RenderedMaterial>> {
  const root = isFilePath(req.mesh) ? projectArchive(req.mesh) : undefined;
  const uses = req.materials?.length
    ? await namedMaterials(bridge, req.mesh, req.materials, root)
    : (await meshMaterials(bridge, req.mesh, req.appearance ?? "default", root))[0]?.materials ?? [];
  // A game path, or the project's copy at that path when there is one.
  const local = (p: string) => (root && fs.existsSync(path.join(root, p)) ? path.join(root, p) : undefined);
  const out: Record<string, RenderedMaterial> = {};
  for (const use of uses) {
    try {
      const png = (use.multilayered && use.setup ? live?.(use.setup) : undefined) ?? (await colorMap(bridge, lib, dir, use, local));
      if (png) out[use.name] = { baseColor: fs.readFileSync(png), fidelity: "approximate" };
    } catch (e) {
      log(`3D view, ${use.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return out;
}

/** The PNG file that shows a material's colors, or undefined when there is none to show. */
async function colorMap(bridge: BridgeClient, lib: Library | undefined, dir: string, use: MaterialUse, local: (p: string) => string | undefined): Promise<string | undefined> {
  if (use.multilayered) {
    if (!use.setup) return undefined;
    const file = local(use.setup);
    const source: SetupSource = file ? { file, gamePath: use.setup } : { gamePath: use.setup };
    const opened = await openSetup(bridge, lib, dir, source, use.mask ? local(use.mask) ?? use.mask : undefined);
    return opened.composite?.file;
  }
  if (!use.baseColor) return undefined;
  const file = local(use.baseColor);
  return wholeTexture(bridge, dir, file ? { file } : { gamePath: use.baseColor });
}
