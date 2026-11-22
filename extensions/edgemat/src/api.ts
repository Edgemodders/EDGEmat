// EDGEmat's API for other extensions (design, "Preview"): what `activate()` returns. Version 1 is the
// shape proposed in REDcode issue #6, which REDcode's 3D view already calls (REDcode `src/edgemat.ts`).
// New members may be added within version 1; a change that breaks callers raises apiVersion.

import type * as vscode from "vscode";
import type { FromModelRequest, FromModelResult, MaterialFit, Part, PartResult, RenderedMaterial, RenderRequest, SurfaceChoice } from "./core";

/** A part of a prop in a project: the project folder (or its .cpmodproj), the mesh's game path, its material entry. */
export interface PartRequest {
  project: string;
  mesh: string;
  material: string;
}

/** materialsFromModel's request: as the core's, with the project as a folder (or its .cpmodproj). */
export type ModelMaterialsRequest = Omit<FromModelRequest, "project" | "log"> & { project: string };

/** EDGEmat's API, named as the other EDGE tools' are (REDcodeApi, EDGEdeckApi; EDGEmat #19). */
export interface EDGEmatApi {
  readonly apiVersion: 1;
  /**
   * Renderable materials for a mesh as one appearance shows it, keyed by material name. A first
   * version: color only, always "approximate". A material with nothing to show is left out. `mesh`: a game
   * path (the game's look), a project's `.mesh` file, or a Desk entry's copy (its edits, see below).
   */
  renderMaterials(req: RenderRequest): Promise<Record<string, RenderedMaterial>>;
  /**
   * Fires when a material a viewer shows may have changed: while a setup is edited, after it is saved (in
   * place or with Save to Project), after a new material is put on mesh materials, and after a part's
   * material changes. `materials` is empty for now.
   *
   * `mesh` unset: every viewer draws its materials again. `mesh` set (EDGEmat #17, from 0.3.4): the change is
   * to one Desk entry alone, and `mesh` is that entry's copy of its mesh, a `.mesh` file whose path ends in
   * the mesh's game path (`...\EDGEmat\desk\items\<id>\source\archive\<game path>`). Pass it as
   * renderMaterials' `mesh` to draw the Desk's version; the game path keeps the game's look. The command
   * `edgemat.openMesh` ({ mesh, appearance }) answers { desk, mesh } with the same file for a game mesh.
   */
  readonly onDidChangeMaterials: vscode.Event<{ mesh?: string; materials: string[] }>;
  /**
   * Game materials from a textured model (EDGEmat #4, #6; for EDGEfab's Add to Project): per material of a
   * .glb, or per set of texture files, .xbm textures and a .mi on metal_base, put on the mesh entry of the same
   * name, glow included. Returns each material, the files written and what was approximated. Added in 0.4.
   */
  materialsFromModel(req: ModelMaterialsRequest): Promise<FromModelResult>;
  /**
   * Game materials on a prop's parts (EDGEmat #12, for EDGEfab's Desk). parts: each material entry of a
   * mesh in a project and what it wears (the model's texture, a game surface, a game material, one made in
   * the project). Each change lives only on the part's material entry, and fires onDidChangeMaterials.
   * Added in 0.4.
   */
  parts(req: { project: string; mesh: string }): Promise<Part[]>;
  /** A game surface as a one-layer setup and its .mi, in `<mesh folder>\materials`, on the part. */
  usePartSurface(req: PartRequest & SurfaceChoice): Promise<PartResult>;
  /** A game .mi on the part as it is; one that does not suit any shape is refused unless force. */
  usePartMaterial(req: PartRequest & { mi: string; force?: boolean }): Promise<PartResult & { fit: MaterialFit }>;
  /** The part back on the model's own texture (the .mi EDGEfab keeps for it). */
  partBackToModel(req: PartRequest): Promise<PartResult>;
}

/** @deprecated The old name; use EDGEmatApi. Kept for a while for code that copied it. */
export type EdgematApi = EDGEmatApi;
