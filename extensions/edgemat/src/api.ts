// EDGEmat's API for other extensions (design, "Preview"): what `activate()` returns. Version 1 is the
// shape proposed in REDcode issue #6, which REDcode's 3D view already calls (REDcode `src/edgemat.ts`).
// New members may be added within version 1; a change that breaks callers raises apiVersion.

import type * as vscode from "vscode";
import type { FromModelRequest, FromModelResult, RenderedMaterial, RenderRequest } from "./core";

/** materialsFromModel's request: as the core's, with the project as a folder (or its .cpmodproj). */
export type ModelMaterialsRequest = Omit<FromModelRequest, "project" | "log"> & { project: string };

export interface EdgematApi {
  readonly apiVersion: 1;
  /**
   * Renderable materials for a mesh as one appearance shows it, keyed by material name. A first
   * version: color only, always "approximate". A material with nothing to show is left out.
   */
  renderMaterials(req: RenderRequest): Promise<Record<string, RenderedMaterial>>;
  /**
   * Fires when a material a viewer shows may have changed: after a setup is saved (in place or with Save to
   * Project) and after a new material is put on mesh materials. `mesh` is unset and `materials` empty for
   * now: every viewer draws its materials again.
   */
  readonly onDidChangeMaterials: vscode.Event<{ mesh?: string; materials: string[] }>;
  /**
   * Game materials from a textured model (EDGEmat #4, #6; for EDGEfab's Add to Project): per material of a
   * .glb, or per set of texture files, .xbm textures and a .mi on metal_base, put on the mesh entry of the same
   * name, glow included. Returns each material, the files written and what was approximated. Added in 0.4.
   */
  materialsFromModel(req: ModelMaterialsRequest): Promise<FromModelResult>;
}
