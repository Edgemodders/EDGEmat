// A prop's parts in EDGEmat's Find and Desk views (EDGEmat #12): on a material of a mesh in a project
// (each part of a prop EDGEfab made is one), Use a Game Surface..., Use a Game Material... and Back to the
// Model's Texture. New Material Here (Generate) is the material page's. The work is the core's (parts.ts),
// which mat_apply, mat_parts and mat_materials run too.

import * as path from "node:path";
import * as vscode from "vscode";
import { AnyMask, backToModel, describeSurface, gameMaterials, materialFit, useGameMaterial, useSurface, type BridgeClient, type GameMaterialList, type Library, type PartResult, type Template } from "./core";
import { FindView } from "./findView";

export interface PartHost {
  bridge(): Promise<BridgeClient | undefined>;
  library(): Library | undefined;
  cacheDir(): string;
  log(line: string): void;
  /** After a part changed: the trees and REDcode's 3D view draw it again. */
  changed(mesh: string, material: string): void;
}

type Part = NonNullable<ReturnType<typeof FindView.partOf>>;

const file = (p: string) => p.split("\\").pop() ?? p;

export function registerPartCommands(host: PartHost): vscode.Disposable[] {
  let list: Promise<GameMaterialList> | undefined;

  const ready = async (node: unknown): Promise<{ part: Part; bridge: BridgeClient } | undefined> => {
    const part = FindView.partOf(node);
    if (!part) {
      void vscode.window.showInformationMessage("EDGEmat: this works on a material of a mesh in a project. Open the project's mesh in EDGEmat (right-click it in REDcode's Project view › Open in EDGEmat), then right-click one of its materials.");
      return undefined;
    }
    const bridge = await host.bridge();
    if (!bridge) {
      void vscode.window.showErrorMessage("EDGEmat needs the game folder and REDbridge.");
      return undefined;
    }
    return { part, bridge };
  };

  /** Says what was done, with Open Setup for a surface. */
  const done = async (part: Part, what: string, r: PartResult) => {
    for (const n of r.notes) host.log(`  ${n}`);
    host.log(`${part.material} on ${file(part.mesh)}: ${what}; wrote ${r.written.join(", ")}`);
    host.changed(part.mesh, part.material);
    const tile = r.tile !== undefined ? ` Tiling ${r.tile}.` : "";
    const pick = await vscode.window.showInformationMessage(`EDGEmat: ${part.material} now wears ${what}.${tile} Pack the project to see it in the game.`, ...(r.setup ? ["Open Setup"] : []));
    if (pick === "Open Setup" && r.setup) await vscode.commands.executeCommand("edgemat.openFoundSetup", r.setup, AnyMask, part.via, part.archive, undefined, part.mesh, part.look);
  };

  const fail = (e: unknown) => void vscode.window.showErrorMessage(`EDGEmat: ${e instanceof Error ? e.message : String(e)}`);

  async function useGameSurface(node: unknown): Promise<void> {
    const got = await ready(node);
    if (!got) return;
    const lib = host.library();
    if (!lib) return void vscode.window.showInformationMessage("EDGEmat: Game Materials is still being built from your game. Try again in a moment.");
    const { part, bridge } = got;
    type SurfaceItem = vscode.QuickPickItem & { template: Template };
    const surfaces: SurfaceItem[] = [...lib.templates]
      .sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title))
      .map((t) => ({ label: t.title, description: `${t.category}${t.group && t.group !== t.category ? ` › ${t.group}` : ""}`, detail: t.path, template: t }));
    const s = await vscode.window.showQuickPick(surfaces, { title: `Use a Game Surface on ${part.material}`, placeHolder: "Search the game's surfaces: car paint, concrete, leather, wood...", matchOnDescription: true, matchOnDetail: true });
    if (!s) return;
    const info = describeSurface(s.template);
    type ColorItem = vscode.QuickPickItem & { name: string };
    const colors: ColorItem[] = info.colors.map((c) => ({ label: c.plain, description: `${c.name}${c.isDefault ? " · the surface's own" : ""}`, name: c.name }));
    colors.sort((a, b) => Number(b.description!.includes("own")) - Number(a.description!.includes("own")));
    const c = colors.length > 1 ? await vscode.window.showQuickPick(colors, { title: `${s.template.title}: its color`, placeHolder: "Search the surface's colors: red, dark grey, gold...", matchOnDescription: true }) : colors[0];
    if (colors.length > 1 && !c) return;
    try {
      const r = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `EDGEmat: ${s.template.title} on ${part.material}...` }, () =>
        useSurface(bridge, lib, part.archive, part.mesh, part.material, { surface: s.template.path, color: c?.name }));
      await done(part, `${s.template.title}${c ? `, ${c.label}` : ""}`, r);
    } catch (e) {
      fail(e);
    }
  }

  async function useGameMaterialHere(node: unknown): Promise<void> {
    const got = await ready(node);
    if (!got) return;
    const { part, bridge } = got;
    try {
      list ??= Promise.resolve(vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "EDGEmat: finding the game's materials that suit any shape (once per game version)..." }, (p) =>
        gameMaterials(bridge, host.cacheDir(), (d, of) => p.report({ message: `${d} of ${of}` }))));
      const l = await list.catch((e: unknown) => {
        list = undefined;
        throw e;
      });
      type MaterialItem = vscode.QuickPickItem & { mi?: string };
      const items: MaterialItem[] = [
        { label: "$(edit) A game path...", description: "any .mi, such as one from REDcode's Game Assets", alwaysShow: true },
        ...l.materials.map((m): MaterialItem => ({ label: m.name, description: [m.glass ? "glass" : "", m.glow ? "glows" : "", file(m.base)].filter(Boolean).join(" · "), detail: m.path, mi: m.path })),
      ];
      const pick = await vscode.window.showQuickPick(items, { title: `Use a Game Material on ${part.material} (${l.materials.length} suit any shape)`, placeHolder: "Search: glass, glow blue, metal, wood...", matchOnDescription: true, matchOnDetail: true });
      if (!pick) return;
      let mi = pick.mi;
      if (!mi) {
        mi = (await vscode.window.showInputBox({ title: "A game material's path", prompt: "A .mi game path, such as base\\environment\\architecture\\common\\shop\\textures\\z_emissive_blue.mi", validateInput: (v) => (/\.mi$/i.test(v.trim()) ? undefined : "A material's game path ends in .mi") }))?.trim();
        if (!mi) return;
      }
      let force = false;
      const fit = await materialFit(bridge, mi, part.archive);
      if (!fit.fits) {
        const go = await vscode.window.showWarningMessage(`${file(mi)} may not suit this part: ${fit.why}. Use it anyway?`, { modal: true }, "Use Anyway");
        if (go !== "Use Anyway") return;
        force = true;
      }
      const r = await useGameMaterial(bridge, part.archive, part.mesh, part.material, mi, { force });
      await done(part, file(mi), r);
    } catch (e) {
      fail(e);
    }
  }

  async function backToModelHere(node: unknown): Promise<void> {
    const got = await ready(node);
    if (!got) return;
    const { part, bridge } = got;
    try {
      const r = await backToModel(bridge, part.archive, part.mesh, part.material);
      await done(part, `the model's own texture (${path.basename(r.mi)})`, r);
    } catch (e) {
      fail(e);
    }
  }

  return [
    vscode.commands.registerCommand("edgemat.useGameSurface", useGameSurface),
    vscode.commands.registerCommand("edgemat.useGameMaterial", useGameMaterialHere),
    vscode.commands.registerCommand("edgemat.backToModel", backToModelHere),
  ];
}
