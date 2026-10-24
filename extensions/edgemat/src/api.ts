// EDGEmat's API for other extensions (design, "Preview"): what `activate()` returns. Version 1 is the
// shape proposed in REDcode issue #6, which REDcode's 3D view already calls (REDcode `src/edgemat.ts`).
// New members may be added within version 1; a change that breaks callers raises apiVersion.

import type * as vscode from "vscode";
import type { RenderedMaterial, RenderRequest } from "./core";

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
}
