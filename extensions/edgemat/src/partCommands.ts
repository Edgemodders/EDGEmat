// A prop's parts in EDGEmat's Find and Desk views (EDGEmat #12): on a material of a mesh in a project
// (each part of a prop EDGEfab made is one), Use a Game Surface..., Use a Game Material... and Back to the
// Model's Texture. On a material of a game mesh on the Desk the same, in the entry's own copy of the mesh,
// with Back to the Game's Material; Add to Project carries the changed mesh. New Material Here (Generate) is
// the material page's. The work is the core's (parts.ts, desk.ts), which mat_apply, mat_parts and
// mat_materials run too.

import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { AnyMask, backToGame, backToModel, deskPartFolder, describeSurface, dropPartFiles, gameMaterials, materialFit, searchGameMaterials, useGameMaterial, useSurface, type BridgeClient, type Desk, type GameMaterialList, type Library, type PartResult, type Template } from "./core";
import { FindView } from "./findView";

export interface PartHost {
  bridge(): Promise<BridgeClient | undefined>;
  library(): Library | undefined;
  cacheDir(): string;
  log(line: string): void;
  desk: Desk;
  /** After a part changed: the trees and REDcode's 3D view draw it again (`desk`: the Desk entry it changed on). */
  changed(archive: string, mesh: string, material: string, desk?: string): void;
  /** Shows a project file in REDcode's Project view (#15); undefined when REDcode cannot. */
  reveal?: (file: string) => Promise<void>;
  /** Whether REDcode can reveal a file (0.10.10 and later, active). */
  canReveal?: () => boolean;
}

type Part = NonNullable<ReturnType<typeof FindView.partOf>>;

const file = (p: string) => p.split("\\").pop() ?? p;

type MaterialItem = vscode.QuickPickItem & { mi?: string };

/**
 * A game material picked by words as you type, each word in its name or path, "glow" for one that glows,
 * "glass" for glass: the same search as mat_materials (searchGameMaterials). The quick pick's own filter
 * wants the words together in one field, so "glow blue" found nothing; these items are always shown.
 */
function pickGameMaterial(l: GameMaterialList, material: string): Promise<MaterialItem | undefined> {
  const qp = vscode.window.createQuickPick<MaterialItem>();
  qp.title = `Use a Game Material on ${material} (${l.materials.length} suit any shape)`;
  qp.placeholder = "Search: glass, glow blue, metal, wood...";
  const byPath: MaterialItem = { label: "$(edit) A game path...", description: "any .mi, such as one from REDcode's Game Assets", alwaysShow: true };
  const show = (value: string) => {
    const found = searchGameMaterials(l, value, Infinity);
    const matches = found.map((m): MaterialItem => ({ label: m.name, description: [m.glass ? "glass" : "", m.glow ? "glows" : "", file(m.base)].filter(Boolean).join(" · "), detail: m.path, mi: m.path, alwaysShow: true }));
    qp.items = [byPath, ...matches, ...(found.length ? [] : [{ label: `No game material matches "${value.trim()}"`, description: "try fewer words, or a game path", alwaysShow: true }])];
    // New items make the first one active, the path box; after a search, Enter takes the first match.
    if (value.trim() && matches.length) qp.activeItems = [matches[0]];
  };
  show("");
  qp.onDidChangeValue(show);
  return new Promise((resolve) => {
    qp.onDidAccept(() => {
      const it = qp.selectedItems[0];
      if (!it || (!it.mi && it !== byPath)) return;
      resolve(it);
      qp.hide();
    });
    qp.onDidHide(() => {
      resolve(undefined);
      qp.dispose();
    });
    qp.show();
  });
}

const fail = (e: unknown) => void vscode.window.showErrorMessage(`EDGEmat: ${e instanceof Error ? e.message : String(e)}`);

export function registerPartCommands(host: PartHost): vscode.Disposable[] {
  let list: Promise<GameMaterialList> | undefined;

  const ready = async (node: unknown): Promise<{ part: Part; bridge: BridgeClient } | undefined> => {
    const part = FindView.partOf(node);
    if (!part) {
      void vscode.window.showInformationMessage("EDGEmat: this works on a material of a mesh on the Desk or in a project. Put the mesh on the Desk (right-click it in REDcode's Game Assets or Project view › Open in EDGEmat), then right-click one of its materials there.");
      return undefined;
    }
    const bridge = await host.bridge();
    if (!bridge) {
      void vscode.window.showErrorMessage("EDGEmat: this needs the game folder and REDbridge.");
      return undefined;
    }
    if (!part.onDesk) return { part, bridge };
    // A game mesh on the Desk changes in the entry's own copy of it.
    const entry = host.desk.get(part.desk);
    if (!entry) {
      void vscode.window.showInformationMessage("EDGEmat: this mesh is no longer on the Desk.");
      return undefined;
    }
    try {
      return { part: { ...part, archive: await host.desk.partArchive(bridge, entry) }, bridge };
    } catch (e) {
      fail(e);
      return undefined;
    }
  };

  /** Says what was done, with Open Setup for a surface. `changed`: on the Desk, whether the part now differs from the game's. */
  const done = async (part: Part, what: string, r: PartResult, changed = true) => {
    for (const n of r.notes) host.log(`  ${n}`);
    host.log(`${part.material} on ${file(part.mesh)}${part.onDesk ? " (on the Desk)" : ""}: ${what}; wrote ${r.written.join(", ")}`);
    if (part.onDesk && part.desk) host.desk.markPart(part.desk, part.material, changed);
    host.changed(part.archive, part.mesh, part.material, part.onDesk ? part.desk : undefined);
    const tile = r.tile !== undefined ? ` Tiling ${r.tile}.` : "";
    // Back to the game's material on the Desk is no change any more (the EDGEweb run of 2026-11-27 found it said so).
    const next = !part.onDesk ? "Pack the project to see it in the game." : changed ? "It changed on the Desk: + on the Desk line puts the mesh in a project." : "On this Desk entry it is as the game made it again.";
    // In a project, Reveal in REDcode shows the part's new .mi, else the mesh (#15).
    const shown = [r.mi, part.mesh].map((f) => path.join(part.archive, f)).find((f) => fs.existsSync(f));
    const reveal = !part.onDesk && shown && host.canReveal?.() ? host.reveal : undefined;
    const pick = await vscode.window.showInformationMessage(`EDGEmat: ${part.material} now wears ${what}.${tile} ${next}`, ...(r.setup ? ["Open Setup"] : []), ...(reveal ? ["Reveal in REDcode"] : []));
    if (pick === "Reveal in REDcode" && reveal && shown) await reveal(shown);
    // On the Desk the setup opens from the entry, and Ctrl+S saves it there.
    if (pick === "Open Setup" && r.setup) await vscode.commands.executeCommand("edgemat.openFoundSetup", r.setup, AnyMask, part.via, part.onDesk ? undefined : part.archive, part.onDesk ? part.desk : undefined, part.mesh, part.look);
  };

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
        useSurface(bridge, lib, part.archive, part.mesh, part.material, { surface: s.template.path, color: c?.name }, part.onDesk ? deskPartFolder(part.mesh) : undefined));
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
      const pick = await pickGameMaterial(l, part.material);
      if (!pick) return;
      let mi = pick.mi;
      if (!mi) {
        mi = (await vscode.window.showInputBox({ title: "A game material's path", prompt: "A .mi game path, such as base\\environment\\architecture\\common\\shop\\textures\\z_emissive_blue.mi", validateInput: (v) => (/\.mi$/i.test(v.trim()) ? undefined : "A material's game path ends in .mi") }))?.trim();
        if (!mi) return;
      }
      let force = false;
      const fit = await materialFit(bridge, mi, part.archive);
      if (!fit.fits) {
        const go = await vscode.window.showWarningMessage(`EDGEmat: ${file(mi)} may not suit this part: ${fit.why}. Use it anyway?`, { modal: true }, "Use Anyway");
        if (go !== "Use Anyway") return;
        force = true;
      }
      const r = await useGameMaterial(bridge, part.archive, part.mesh, part.material, mi, { force });
      // On the Desk a surface it wore before is gone with it, so it does not go into a project.
      if (part.onDesk) r.notes.push(...dropPartFiles(part.archive, part.material, deskPartFolder(part.mesh)).map((f) => `Deleted ${f}.`));
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

  async function backToGameHere(node: unknown): Promise<void> {
    const got = await ready(node);
    if (!got) return;
    const { part, bridge } = got;
    if (!part.onDesk) return void vscode.window.showInformationMessage("EDGEmat: Back to the Game's Material works on a game mesh on the Desk.");
    try {
      const r = await backToGame(bridge, part.archive, part.mesh, part.material);
      await done(part, `the game's material (${path.basename(r.mi)})`, r, false);
    } catch (e) {
      fail(e);
    }
  }

  return [
    vscode.commands.registerCommand("edgemat.backToGame", backToGameHere),
    vscode.commands.registerCommand("edgemat.useGameSurface", useGameSurface),
    vscode.commands.registerCommand("edgemat.useGameMaterial", useGameMaterialHere),
    vscode.commands.registerCommand("edgemat.backToModel", backToModelHere),
  ];
}
