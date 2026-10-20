// The setup editor (design, "In VS Code"): a custom editor for .mlsetup and WolvenKit .mlsetup.json
// files, wherever they come from: disk, a project, REDcode's game files (redcode-game:), EDGEmat's own
// game files (edgemat-game:), or a mod archive (extracted into the cache). It shows each layer in plain
// words, a flat color map of the setup in texture space, and where each layer shows. Since M3 it edits:
// each change applies live, with undo and redo through VS Code. Saving writes a project's own file in
// place; anything else (a game file, a file outside a project, a mod's) goes through Save to Project.

import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import {
  applyLayerEdit, describeSurface, gamePathInProject, isGameFile, meshesUsing, newPathFor, openSetup, sameSetup, saveToProject, setupToJson, suffixFor, withSetup,
  type BridgeClient, type LayerPatch, type Library, type OpenedSetup, type Project, type Setup, type SetupSource,
} from "./core";
import type { SetupPageData, SurfaceChoices } from "./webview/setup";

export const GameScheme = "edgemat-game";
const RedcodeGameScheme = "redcode-game";

/**
 * edgemat-game:/base/x.mlsetup for base\x.mlsetup. `mask`: the mask set a mesh's material names for it;
 * `via`: where it was found, such as an item's name. Both ride in the query as base64 JSON, which
 * survives VS Code decoding the URI and names holding & or =.
 */
export const gameUri = (gamePath: string, opts: { mask?: string; via?: string } = {}) =>
  vscode.Uri.from({
    scheme: GameScheme,
    path: "/" + gamePath.replace(/\\/g, "/"),
    query: opts.mask || opts.via ? `o=${Buffer.from(JSON.stringify(opts)).toString("base64url")}` : "",
  });

const uriOptions = (uri: vscode.Uri): { mask?: string; via?: string } => {
  const o = /(?:^|&)o=([\w-]+)/.exec(uri.query)?.[1];
  try {
    return o ? JSON.parse(Buffer.from(o, "base64url").toString("utf8")) : {};
  } catch {
    return {};
  }
};
const gamePathOfUri = (uri: vscode.Uri) =>
  uri.scheme === GameScheme || uri.scheme === RedcodeGameScheme ? uri.path.replace(/^\/+/, "").replace(/\//g, "\\") : undefined;

/**
 * A file system over the game archives, so a game setup opens in the setup editor. Reading bytes
 * extracts the file into the cache. Nothing is ever written: the setup editor saves a game setup into a
 * project instead (Save to Project).
 */
export class GameFiles implements vscode.FileSystemProvider {
  private readonly emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile = this.emitter.event;
  constructor(private readonly bridge: () => Promise<BridgeClient | undefined>, private readonly cacheDir: () => string) {}
  watch(): vscode.Disposable {
    return new vscode.Disposable(() => undefined);
  }
  stat(): vscode.FileStat {
    return { type: vscode.FileType.File, ctime: 0, mtime: 0, size: 0 };
  }
  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    const bridge = await this.bridge();
    if (!bridge) throw vscode.FileSystemError.Unavailable("REDbridge is not available.");
    const out = path.join(this.cacheDir(), "files", gamePathOfUri(uri)!);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await bridge.extract(gamePathOfUri(uri)!, out);
    return fs.readFileSync(out);
  }
  readDirectory(): [string, vscode.FileType][] { return []; }
  createDirectory(): void { throw vscode.FileSystemError.NoPermissions("Game files are never changed. Save a setup into a project instead."); }
  writeFile(): void { throw vscode.FileSystemError.NoPermissions("Game files are never changed. Save a setup into a project instead."); }
  delete(): void { throw vscode.FileSystemError.NoPermissions(); }
  rename(): void { throw vscode.FileSystemError.NoPermissions(); }
}

/** Files taken out of mod archives: the extracted file, the game path inside the archive, and the archive's name. */
const fromMods = new Map<string, { gamePath: string; archive: string }>();

class SetupDocument implements vscode.CustomDocument {
  /** The mask set named by the mesh's material, when the setup was opened from Find. */
  readonly mask?: string;
  readonly origin: string;
  /** The setup as read, with the masks in use. */
  opened?: OpenedSetup;
  /** The setup as edited now. */
  setup?: Setup;
  /** The setup as last saved or read: the editor is dirty when `setup` differs from it. */
  saved?: Setup;
  /** Edits restored from a backup, applied once the setup is read. */
  restored?: Pick<Setup, "layers" | "ratio" | "useNormal">;
  /** A line shown on the page after an edit or a save, such as presets reset by a new surface. */
  notice?: string;
  /** Asked once per document: saving in place over a game setup needs Material Texture Override. */
  warnedInPlace = false;
  readonly panels = new Set<vscode.WebviewPanel>();
  constructor(readonly uri: vscode.Uri, readonly source: SetupSource, origin: string) {
    const { mask, via } = uriOptions(uri);
    this.mask = mask;
    this.origin = via ? `${origin} · from ${via}` : origin;
  }
  /** The game path this setup stands for: a game file's own, a project file's, or the path inside a mod archive. */
  get gamePath(): string | undefined {
    return "gamePath" in this.source && this.source.gamePath ? this.source.gamePath : undefined;
  }
  get dirty(): boolean {
    return !!this.setup && !!this.saved && !sameSetup(this.setup, this.saved);
  }
  dispose(): void {}
}

export interface SetupEditorHost {
  extensionUri: vscode.Uri;
  cacheDir(): string;
  bridge(): Promise<BridgeClient | undefined>;
  library(): Library | undefined;
  openSurface(gamePath: string): void;
  openMicroblend(gamePath: string): void;
  /** The project to save into: REDcode's open project, else one the modder picks. Undefined when they cancel. */
  project(): Promise<Project | undefined>;
  /** REDcode's Pack and Try for that project, when REDcode has it open; undefined otherwise. */
  packAndTry(project: Project): (() => Promise<unknown>) | undefined;
  log(line: string): void;
}

/** Where a save goes: the file itself (a project's own file), or into a project through Save to Project. */
function saveInPlace(doc: SetupDocument): { file: string; json: boolean } | undefined {
  if (doc.uri.scheme !== "file" || !("file" in doc.source) || fromMods.has(doc.source.file.toLowerCase())) return undefined;
  const file = doc.source.file;
  if (/\.json$/i.test(file)) return /[\\/]source[\\/]raw[\\/]/i.test(file) ? { file, json: true } : undefined;
  return gamePathInProject(file) ? { file, json: false } : undefined;
}

export class SetupEditor implements vscode.CustomEditorProvider<SetupDocument> {
  static readonly viewType = "edgemat.setup";
  private readonly changes = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<SetupDocument>>();
  readonly onDidChangeCustomDocument = this.changes.event;
  /** The document of the setup editor in front, for the Save to Project command. */
  private active?: SetupDocument;

  constructor(private readonly host: SetupEditorHost) {}

  async openCustomDocument(uri: vscode.Uri, context: vscode.CustomDocumentOpenContext): Promise<SetupDocument> {
    const doc = await this.makeDocument(uri);
    if (context.backupId) {
      try {
        const b = JSON.parse(fs.readFileSync(vscode.Uri.parse(context.backupId).fsPath, "utf8"));
        doc.restored = { layers: b.layers, ratio: b.ratio, useNormal: b.useNormal };
      } catch {
        // No backup to restore: open the file as it is.
      }
    }
    return doc;
  }

  private async makeDocument(uri: vscode.Uri): Promise<SetupDocument> {
    const gamePath = gamePathOfUri(uri);
    if (gamePath) return new SetupDocument(uri, { gamePath }, "game file");
    if (uri.scheme === "file") {
      const mod = fromMods.get(uri.fsPath.toLowerCase());
      if (mod) return new SetupDocument(uri, { file: uri.fsPath, gamePath: mod.gamePath }, `from the mod ${mod.archive}`);
      const inProject = gamePathInProject(uri.fsPath);
      return new SetupDocument(uri, { file: uri.fsPath, gamePath: inProject }, inProject ? "project file" : "file");
    }
    // Any other scheme: copy the bytes into the cache and read that.
    const bytes = await vscode.workspace.fs.readFile(uri);
    const out = path.join(this.host.cacheDir(), "files", "other", path.basename(uri.path));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, bytes);
    return new SetupDocument(uri, { file: out }, uri.scheme);
  }

  async resolveCustomEditor(doc: SetupDocument, panel: vscode.WebviewPanel): Promise<void> {
    const w = panel.webview;
    w.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.host.extensionUri, "dist"), vscode.Uri.file(this.host.cacheDir())] };
    doc.panels.add(panel);
    this.active = doc;
    panel.onDidChangeViewState(() => {
      if (panel.active) this.active = doc;
    });
    panel.onDidDispose(() => {
      doc.panels.delete(panel);
      if (this.active === doc && !doc.panels.size) this.active = undefined;
    });

    w.onDidReceiveMessage(async (m: { type: string; text?: string; path?: string; index?: number; patch?: LayerPatch }) => {
      try {
        if (m.type === "copy" && m.text) {
          await vscode.env.clipboard.writeText(m.text);
          vscode.window.setStatusBarMessage(`Copied ${m.text.length > 60 ? m.text.slice(0, 57) + "..." : m.text}`, 2500);
        } else if (m.type === "surface" && m.path) {
          this.host.openSurface(m.path);
        } else if (m.type === "microblend" && m.path) {
          this.host.openMicroblend(m.path);
        } else if (m.type === "chooseMask") {
          const picked = await this.chooseMask(doc.opened);
          if (picked) await this.load(doc, picked);
        } else if (m.type === "reload") {
          await this.load(doc);
        } else if (m.type === "edit" && m.index !== undefined && m.patch) {
          this.edit(doc, m.index, m.patch);
        } else if (m.type === "pickSurface" && m.index !== undefined) {
          const p = await this.pickSurface(doc, m.index);
          if (p) this.edit(doc, m.index, { material: p });
        } else if (m.type === "pickMicroblend" && m.index !== undefined) {
          const p = await this.pickMicroblend(doc, m.index);
          if (p !== undefined) this.edit(doc, m.index, { microblend: p });
        } else if (m.type === "saveToProject") {
          await this.saveToProjectFlow(doc);
        }
      } catch (e) {
        void vscode.window.showErrorMessage(e instanceof Error ? e.message : String(e));
      }
    });

    if ("file" in doc.source) {
      const file = doc.source.file;
      const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(path.dirname(file)), path.basename(file)));
      // A change on disk reloads the file, unless there are edits not saved yet.
      watcher.onDidChange(() => {
        if (!doc.dirty) void this.load(doc, undefined, true);
      });
      panel.onDidDispose(() => watcher.dispose());
    }
    if (doc.opened) this.post(doc, panel);
    else await this.load(doc);
  }

  /** Reads the setup (again), with `mask` or the one in use. Edits not saved yet are kept unless `fromDisk`. */
  private async load(doc: SetupDocument, mask?: string, fromDisk = false): Promise<void> {
    const loading: SetupPageData = { kind: "loading", title: this.title(doc), origin: doc.origin };
    for (const p of doc.panels) p.webview.html = this.html(p.webview, loading);
    try {
      const bridge = await this.host.bridge();
      const inUse = doc.opened?.masks ? ("gamePath" in doc.opened.masks.source ? doc.opened.masks.source.gamePath : doc.opened.masks.source.file) : undefined;
      const keepMask = mask ?? inUse;
      const o = await openSetup(bridge, this.host.library(), this.host.cacheDir(), doc.source, keepMask ?? doc.mask);
      doc.opened = o;
      if (!doc.setup || fromDisk) {
        doc.saved = o.setup;
        doc.setup = doc.restored ? { ...o.setup, ...doc.restored } : o.setup;
        doc.restored = undefined;
      }
      for (const p of doc.panels) this.post(doc, p, true);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.host.log(`The setup editor could not open ${doc.uri.toString()}: ${message}`);
      const page: SetupPageData = { kind: "error", title: this.title(doc), origin: doc.origin, message };
      for (const p of doc.panels) p.webview.html = this.html(p.webview, page);
    }
  }

  /** One change to one layer: applied, made undoable, and shown in every tab of the document. */
  private edit(doc: SetupDocument, index: number, patch: LayerPatch): void {
    if (!doc.setup) return;
    const before = doc.setup;
    const r = applyLayerEdit(before, index, patch, this.host.library());
    if (sameSetup(before, r.setup)) return;
    const after = r.setup;
    doc.setup = after;
    doc.notice = r.notes.join(" ") || undefined;
    const field = Object.keys(patch)[0] ?? "layer";
    this.changes.fire({
      document: doc,
      label: `Layer ${index}: ${field}`,
      undo: () => {
        doc.setup = before;
        doc.notice = undefined;
        this.refresh(doc);
      },
      redo: () => {
        doc.setup = after;
        this.refresh(doc);
      },
    });
    this.refresh(doc);
  }

  private refresh(doc: SetupDocument): void {
    for (const p of doc.panels) this.post(doc, p);
  }

  /** Sends the page its data: the whole page the first time, an update after that so the page keeps its place. */
  private post(doc: SetupDocument, panel: vscode.WebviewPanel, full = false): void {
    if (!doc.opened || !doc.setup) return;
    const view = doc.setup === doc.opened.setup ? doc.opened : withSetup(doc.opened, doc.setup, this.host.library(), this.host.cacheDir());
    const data = this.data(panel.webview, doc, view);
    if (full || !panel.webview.html.includes('id="data"')) panel.webview.html = this.html(panel.webview, data);
    else void panel.webview.postMessage({ type: "update", data });
  }

  // ---- saving ------------------------------------------------------------------------------------

  async saveCustomDocument(doc: SetupDocument): Promise<void> {
    if (!doc.setup) return;
    const inPlace = saveInPlace(doc);
    if (!inPlace) {
      if (!(await this.saveToProjectFlow(doc))) throw new vscode.CancellationError();
      return;
    }
    const bridge = await this.host.bridge();
    if (inPlace.json) {
      fs.writeFileSync(inPlace.file, JSON.stringify(setupToJson(doc.setup), null, 2));
    } else {
      if (!bridge) throw new Error("Saving a binary .mlsetup needs REDbridge.");
      await bridge.fromJson(inPlace.file, { json: JSON.stringify(setupToJson(doc.setup)) });
    }
    doc.saved = doc.setup;
    this.host.log(`Saved ${inPlace.file}`);
    // A project file at one of the game's own paths replaces the game's setup.
    const gamePath = gamePathInProject(inPlace.file);
    if (bridge && gamePath && !doc.warnedInPlace && (await isGameFile(bridge, gamePath))) {
      doc.warnedInPlace = true;
      void vscode.window.showWarningMessage(
        `${path.basename(inPlace.file)} replaces the game's own setup at ${gamePath}. That shows in the game only with the Material Texture Override mod installed. Save to Project, "As a new setup", needs no other mod.`,
      );
    }
    this.refresh(doc);
  }

  async saveCustomDocumentAs(doc: SetupDocument, destination: vscode.Uri): Promise<void> {
    if (!doc.setup) return;
    if (/\.json$/i.test(destination.fsPath)) {
      fs.writeFileSync(destination.fsPath, JSON.stringify(setupToJson(doc.setup), null, 2));
      return;
    }
    const bridge = await this.host.bridge();
    if (!bridge) throw new Error("Saving a binary .mlsetup needs REDbridge.");
    await bridge.fromJson(destination.fsPath, { json: JSON.stringify(setupToJson(doc.setup)) });
  }

  async revertCustomDocument(doc: SetupDocument): Promise<void> {
    doc.setup = doc.saved;
    doc.notice = undefined;
    this.refresh(doc);
  }

  async backupCustomDocument(doc: SetupDocument, context: vscode.CustomDocumentBackupContext): Promise<vscode.CustomDocumentBackup> {
    const file = context.destination.fsPath;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const s = doc.setup;
    fs.writeFileSync(file, JSON.stringify(s ? { layers: s.layers, ratio: s.ratio, useNormal: s.useNormal } : {}));
    return { id: context.destination.toString(), delete: () => fs.rmSync(file, { force: true }) };
  }

  /** Save to Project for the setup editor in front (the editor title button). */
  async saveActiveToProject(): Promise<void> {
    if (!this.active) {
      void vscode.window.showInformationMessage("Open a setup in EDGEmat's setup editor first.");
      return;
    }
    try {
      await this.saveToProjectFlow(this.active);
    } catch (e) {
      void vscode.window.showErrorMessage(e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Save to Project: as a new setup with the meshes that use it pointed at it (no other mod needed), at its
   * own path (over the game's needs Material Texture Override), or at a path the modder types. True when saved.
   */
  private async saveToProjectFlow(doc: SetupDocument): Promise<boolean> {
    if (!doc.setup) return false;
    const bridge = await this.host.bridge();
    if (!bridge) {
      void vscode.window.showErrorMessage("Saving into a project needs REDbridge. Set the game folder and REDbridge first.");
      return false;
    }
    const project = await this.host.project();
    if (!project) return false;
    const suffix = suffixFor(project.name);
    const gamePath = doc.gamePath;
    type Route = "new" | "own" | "path";
    const items: (vscode.QuickPickItem & { route: Route })[] = [];
    if (gamePath) {
      const inGame = await isGameFile(bridge, gamePath);
      items.push({
        label: "$(add) As a new setup",
        description: inGame ? "recommended" : undefined,
        detail: `Saved beside it as ${path.win32.basename(newPathFor(gamePath, suffix))}, and the meshes that use it are copied into the project and pointed at it. Shows in the game with no other mod.`,
        route: "new",
      });
      items.push({
        label: inGame ? "$(replace) In place of the game's setup" : "$(save) At its own path",
        detail: inGame ? `${gamePath}: replaces the game's file, which shows in the game only with the Material Texture Override mod.` : gamePath,
        route: "own",
      });
    }
    items.push({ label: "$(edit) At a game path you choose...", detail: "The setup only; no mesh is changed.", route: "path" });
    const pick = await vscode.window.showQuickPick(items, { title: `Save to Project: ${project.name}`, placeHolder: "Where the setup goes in the project" });
    if (!pick) return false;

    const validPath = (v: string) =>
      !/\.mlsetup$/i.test(v.trim()) ? "A setup's game path ends in .mlsetup." : /^[a-z]:[\\/]|^\\\\/i.test(v.trim()) ? "A game path, such as base\\...\\x.mlsetup, not a path on disk." : undefined;
    let target = gamePath ?? "";
    let meshes: string[] = [];
    if (pick.route === "new" || pick.route === "path") {
      const suggested = pick.route === "new" ? newPathFor(gamePath!, suffix) : gamePath ? newPathFor(gamePath, suffix) : `${suffix}\\${this.title(doc)}.mlsetup`;
      const typed = await vscode.window.showInputBox({ title: "The setup's game path in the project", value: suggested, validateInput: validPath });
      if (!typed) return false;
      target = typed.trim().replace(/\//g, "\\");
    }
    if (pick.route === "new") {
      const uses = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Finding the meshes that use this setup" }, () => meshesUsing(bridge, gamePath!, project.archive));
      if (!uses.length) {
        const go = await vscode.window.showWarningMessage(`No mesh beside ${path.win32.basename(gamePath!)} uses it, so nothing would point at the new setup. Save the setup alone?`, { modal: true }, "Save the Setup Alone");
        if (!go) return false;
      } else {
        const chosen = await vscode.window.showQuickPick(
          uses.map((u) => ({ label: path.win32.basename(u.mesh), description: u.materials.join(", "), detail: u.mesh, picked: true })),
          { title: "Point these meshes at the new setup", placeHolder: "Each is copied into the project (unless it is there already) with these materials changed", canPickMany: true },
        );
        if (!chosen) return false;
        meshes = chosen.map((c) => c.detail!);
      }
    }

    const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Saving into ${project.name}` }, () =>
      saveToProject(bridge, { setup: doc.setup!, archive: project.archive, target, from: gamePath, meshes, suffix }),
    );
    doc.saved = doc.setup;
    this.host.log(`Saved into ${project.archive}: ${result.written.join(", ")}`);
    for (const n of result.notes) this.host.log(`  ${n}`);
    const meshWord = result.meshes.length ? ` and ${result.meshes.length} mesh${result.meshes.length === 1 ? "" : "es"} pointed at it` : "";
    doc.notice = `Saved into ${project.name} as ${target}${meshWord}.`;
    this.refresh(doc);
    void this.afterSave(project, path.join(project.archive, target), `Saved into ${project.name}: the setup${meshWord}.`);
    return true;
  }

  private async afterSave(project: Project, file: string, message: string): Promise<void> {
    const pack = this.host.packAndTry(project);
    const buttons = [...(pack ? ["Pack and Try"] : []), "Open the Saved Setup"];
    const choice = await vscode.window.showInformationMessage(message, ...buttons);
    if (choice === "Pack and Try" && pack) await pack();
    else if (choice === "Open the Saved Setup") await vscode.commands.executeCommand("vscode.openWith", vscode.Uri.file(file), SetupEditor.viewType);
  }

  // ---- choosing --------------------------------------------------------------------------------

  private async pickSurface(doc: SetupDocument, index: number): Promise<string | undefined> {
    const lib = this.host.library();
    if (!lib) {
      void vscode.window.showInformationMessage("The library is not built yet.");
      return undefined;
    }
    const current = doc.setup?.layers[index]?.material.toLowerCase();
    const pick = await vscode.window.showQuickPick(
      lib.templates.map((t) => ({ label: t.title, description: [t.category, t.group].filter(Boolean).join(" · ") + (t.path.toLowerCase() === current ? " · in use" : ""), detail: t.path })),
      { title: `Layer ${index}: a new surface`, placeHolder: "Type to search: leather, denim, chrome. Its colors and finish reset to the new surface's defaults.", matchOnDescription: true, matchOnDetail: true },
    );
    return pick?.detail;
  }

  private async pickMicroblend(doc: SetupDocument, index: number): Promise<string | undefined> {
    const lib = this.host.library();
    if (!lib) {
      void vscode.window.showInformationMessage("The library is not built yet.");
      return undefined;
    }
    const current = doc.setup?.layers[index]?.microblend.toLowerCase();
    const pick = await vscode.window.showQuickPick(
      lib.microblends.map((m) => ({ label: m.name.replace(/_/g, " "), description: m.path.toLowerCase() === current ? "in use" : undefined, detail: m.path })),
      { title: `Layer ${index}: a microblend`, placeHolder: "Type to search: dirt, scratches, logos. default is the plain one.", matchOnDetail: true },
    );
    return pick?.detail;
  }

  private title(doc: SetupDocument): string {
    return path.basename(doc.uri.path).replace(/\.mlsetup(\.json)?$/i, "");
  }

  private async chooseMask(o: OpenedSetup | undefined): Promise<string | undefined> {
    const current = o?.masks ? ("gamePath" in o.masks.source ? o.masks.source.gamePath : o.masks.source.file) : undefined;
    const items: (vscode.QuickPickItem & { value?: string; action?: "browse" | "search" })[] = [
      ...(o?.maskChoices ?? []).map((c) => ({ label: c.split(/[\\/]/).pop() ?? c, description: c === current ? "in use" : undefined, detail: c, value: c })),
      { label: "$(search) Search the game for a mask set...", action: "search" as const },
      { label: "$(folder-opened) A .mlmask file on disk...", action: "browse" as const },
    ];
    const pick = await vscode.window.showQuickPick(items, { title: "The mask set for this setup", placeHolder: "Masks say where each layer shows. A mesh's material names its mask set." });
    if (!pick) return undefined;
    if (pick.value) return pick.value;
    if (pick.action === "browse") {
      const f = await vscode.window.showOpenDialog({ filters: { "Mask set": ["mlmask"] }, canSelectMany: false, title: "A mask set (.mlmask)" });
      return f?.[0]?.fsPath;
    }
    const bridge = await this.host.bridge();
    if (!bridge) return undefined;
    const words = await vscode.window.showInputBox({ title: "Search the game's mask sets", prompt: "Part of the name or folder, such as s1_055 or jacket" });
    if (!words) return undefined;
    const r = await bridge.search(".mlmask", 20000);
    const ws = words.toLowerCase().split(/\s+/).filter(Boolean);
    const found = r.items.map((i) => i.name).filter((n) => n.toLowerCase().endsWith(".mlmask") && ws.every((x) => n.toLowerCase().includes(x)));
    const chosen = await vscode.window.showQuickPick(found.slice(0, 500).map((n) => ({ label: n.split("\\").pop()!, detail: n })), { title: `${found.length} mask sets`, matchOnDetail: true });
    return chosen?.detail;
  }

  // ---- the page --------------------------------------------------------------------------------

  private data(w: vscode.Webview, doc: SetupDocument, o: OpenedSetup): SetupPageData {
    const uri = (f: string) => w.asWebviewUri(vscode.Uri.file(f)).toString();
    const lib = this.host.library();
    const sourcePath = "gamePath" in o.source && o.source.gamePath ? o.source.gamePath : "file" in o.source ? o.source.file : "";
    const fromMaterial = !!doc.mask && !!o.masks && ("gamePath" in o.masks.source ? o.masks.source.gamePath : o.masks.source.file) === doc.mask;
    // Each surface in use, with the presets a layer can pick from it.
    const surfaces: Record<string, SurfaceChoices> = {};
    for (const l of o.info.layers) {
      const t = l.surface.found ? lib?.templates.find((x) => x.path.toLowerCase() === l.surface.path.toLowerCase()) : undefined;
      if (!t || surfaces[l.surface.path]) continue;
      const s = describeSurface(t);
      const presets = (list: typeof s.roughness) => list.map((p) => ({ name: p.name, plain: p.plain, raw: p.raw, isDefault: p.isDefault }));
      surfaces[l.surface.path] = {
        thumb: t.thumbnail ? uri(path.join(this.host.cacheDir(), "thumbs", t.thumbnail)) : undefined,
        factor: t.tiling,
        colors: s.colors.map((c) => ({ name: c.name, plain: c.plain, hex: c.hex, isDefault: c.isDefault })),
        roughLevelsOut: presets(s.roughness),
        roughLevelsIn: presets(s.roughnessContrast),
        metalLevelsOut: presets(s.metal),
        metalLevelsIn: presets(s.metalContrast),
        normalStrength: presets(s.bumps),
      };
    }
    const inPlace = saveInPlace(doc);
    return {
      kind: "setup",
      title: this.title(doc),
      origin: doc.origin,
      path: "file" in doc.source && fromMods.has(doc.source.file.toLowerCase()) ? fromMods.get(doc.source.file.toLowerCase())!.gamePath : "file" in doc.source ? doc.source.file : sourcePath,
      info: o.info,
      mask: o.masks
        ? { name: o.masks.name, from: fromMaterial ? "material" : o.maskFrom!, path: "gamePath" in o.masks.source ? o.masks.source.gamePath : o.masks.source.file, images: o.masks.files.map(uri), choices: o.maskChoices.length }
        : undefined,
      maskError: o.maskError,
      map: o.composite ? { image: uri(o.composite.file), pick: o.composite.pick } : undefined,
      surfaces,
      edit: {
        dirty: doc.dirty,
        notice: doc.notice,
        saves: inPlace ? "file" : "project",
      },
    };
  }

  private html(w: vscode.Webview, data: SetupPageData): string {
    const nonce = [...Array(24)].map(() => Math.floor(Math.random() * 36).toString(36)).join("");
    const script = w.asWebviewUri(vscode.Uri.joinPath(this.host.extensionUri, "dist", "webview", "setup.js"));
    const json = JSON.stringify(data).replace(/</g, "\\u003c");
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${w.cspSource}; style-src 'nonce-${nonce}' ${w.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style nonce="${nonce}">${SetupCss}</style></head>
<body><script id="data" type="application/json" nonce="${nonce}">${json}</script>
<script nonce="${nonce}" src="${script}"></script></body></html>`;
  }
}

/** Open Setup: a setup on disk (or a mod archive holding setups), or one from the game by name. */
export async function openSetupCommand(host: SetupEditorHost): Promise<void> {
  const pick = await vscode.window.showQuickPick(
    [
      { label: "$(search) From the game...", detail: "Find a game setup by name, such as s1_055 red", id: "game" },
      { label: "$(file) A file on disk...", detail: "A .mlsetup, a WolvenKit .mlsetup.json, or a mod's .archive holding setups", id: "file" },
    ],
    { title: "Open Setup" },
  );
  if (!pick) return;
  if (pick.id === "game") {
    const bridge = await host.bridge();
    if (!bridge) {
      void vscode.window.showErrorMessage("Opening a game setup needs REDbridge. Set the game folder and REDbridge first.");
      return;
    }
    const words = await vscode.window.showInputBox({ title: "Find a game setup", prompt: "Part of its name or folder, such as s1_055 red, or jacket samurai" });
    if (!words) return;
    const ws = words.toLowerCase().split(/\s+/).filter(Boolean);
    const r = await bridge.search(ws.sort((a, b) => b.length - a.length)[0], 20000);
    const found = r.items.map((i) => i.name).filter((n) => n.toLowerCase().endsWith(".mlsetup") && ws.every((x) => n.toLowerCase().includes(x)));
    if (!found.length) {
      void vscode.window.showInformationMessage(`No game setup matches "${words}".`);
      return;
    }
    const chosen = await vscode.window.showQuickPick(found.slice(0, 1000).map((n) => ({ label: n.split("\\").pop()!.replace(/\.mlsetup$/i, ""), detail: n })), {
      title: `${found.length} setups`,
      matchOnDetail: true,
    });
    if (chosen?.detail) await vscode.commands.executeCommand("vscode.openWith", gameUri(chosen.detail), SetupEditor.viewType);
    return;
  }
  const files = await vscode.window.showOpenDialog({ filters: { "Setups and mod archives": ["mlsetup", "json", "archive"] }, canSelectMany: false, title: "Open Setup" });
  const file = files?.[0]?.fsPath;
  if (!file) return;
  if (!/\.archive$/i.test(file)) {
    await vscode.commands.executeCommand("vscode.openWith", vscode.Uri.file(file), SetupEditor.viewType);
    return;
  }
  const bridge = await host.bridge();
  if (!bridge) {
    void vscode.window.showErrorMessage("Reading a mod archive needs REDbridge.");
    return;
  }
  const mod = await bridge.openMod(file);
  const setups = mod.items.map((i) => i.name).filter((n) => /\.mlsetup$/i.test(n));
  if (!setups.length) {
    void vscode.window.showInformationMessage(`${mod.name} holds no setups (${mod.files} files).`);
    return;
  }
  const chosen = await vscode.window.showQuickPick(setups.map((n) => ({ label: n.split("\\").pop()!.replace(/\.mlsetup$/i, ""), detail: n })), { title: `${setups.length} setups in ${mod.name}`, matchOnDetail: true });
  if (!chosen?.detail) return;
  const root = path.join(host.cacheDir(), "mods", mod.name.replace(/[^\w.-]+/g, "_"));
  const out = path.join(root, chosen.detail);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  // The mod's own mask sets beside the setup come along, so the editor finds them beside it on disk.
  const folder = chosen.detail.slice(0, chosen.detail.lastIndexOf("\\") + 1).toLowerCase();
  const masks = mod.items.map((i) => i.name).filter((n) => /\.mlmask$/i.test(n) && n.toLowerCase().startsWith(folder) && !n.slice(folder.length).includes("\\"));
  const r = await bridge.extractFromMod(file, [{ path: chosen.detail, outFile: out }, ...masks.map((m) => ({ path: m, outFile: path.join(root, m) }))]);
  if (!r.extracted) {
    void vscode.window.showErrorMessage(`Could not read ${chosen.detail} from ${mod.name}.`);
    return;
  }
  fromMods.set(out.toLowerCase(), { gamePath: chosen.detail, archive: mod.name });
  await vscode.commands.executeCommand("vscode.openWith", vscode.Uri.file(out), SetupEditor.viewType);
}

// Shares the surface page's look; theme colors only.
const SetupCss = `
:root { --accent: var(--vscode-textLink-foreground); --line: var(--vscode-panel-border, rgba(128,128,128,.35)); --warn: var(--vscode-editorWarning-foreground, #e0a000); }
body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 12px 20px 32px; margin: 0; }
header { border-bottom: 1px solid var(--line); padding-bottom: 10px; margin-bottom: 16px; }
.crumb { text-transform: uppercase; letter-spacing: .12em; font-size: 11px; color: var(--accent); }
.title-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
h1 { font-size: 1.5em; font-weight: 600; margin: 4px 0; flex: 1; word-break: break-all; }
h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .12em; color: var(--accent); margin: 0 0 6px; border-left: 2px solid var(--accent); padding-left: 8px; }
.actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.path { display: flex; gap: 6px; align-items: center; min-width: 0; }
.path code { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.meta { color: var(--vscode-descriptionForeground); margin-top: 6px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
code { font-family: var(--vscode-editor-font-family); font-size: .92em; color: var(--vscode-textPreformat-foreground); }
/* Buttons must read as buttons: a clear outline, and the accent color for actions such as Open. */
button { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 1px solid var(--vscode-button-border, var(--vscode-descriptionForeground)); border-radius: 2px; padding: 2px 8px; cursor: pointer; font: inherit; }
button:hover { background: var(--vscode-button-secondaryHoverBackground); border-color: var(--accent); }
button.copy, button.small { font-size: 11px; padding: 0 6px; }
button.small { color: var(--accent); border-color: var(--accent); background: transparent; font-weight: 600; }
button.small:hover { background: var(--accent); color: var(--vscode-editor-background); }
button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: var(--vscode-button-background); font-weight: 600; }
button.primary:hover { background: var(--vscode-button-hoverBackground); }
button.link { background: none; border: none; color: var(--accent); padding: 0; text-decoration: underline; cursor: pointer; }
.toggle { display: inline-flex; gap: 6px; align-items: center; cursor: pointer; user-select: none; }
.warnings { border-left: 2px solid var(--warn); padding: 4px 10px; margin: 0 0 14px; color: var(--warn); }
.notice { border-left: 2px solid var(--accent); padding: 4px 10px; margin: 0 0 14px; }
.editbar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-top: 8px; font-size: 12px; color: var(--vscode-descriptionForeground); }
.dirty { color: var(--warn); font-weight: 600; }
.layout { display: grid; grid-template-columns: minmax(240px, 420px) minmax(0, 1fr); gap: 24px; align-items: start; }
.layout > * { min-width: 0; }
@media (max-width: 800px) { .layout { grid-template-columns: 1fr; } }
.side { position: sticky; top: 12px; display: flex; flex-direction: column; gap: 8px; }
.map { position: relative; aspect-ratio: 1; border: 1px solid var(--line); background: #1f1f1f; cursor: crosshair; overflow: hidden; }
.map img { position: absolute; inset: 0; width: 100%; height: 100%; display: block; image-rendering: auto; }
.map img.dim { filter: brightness(.3) saturate(.4); }
.map .lit { position: absolute; inset: 0; background: var(--accent); opacity: .85; -webkit-mask-size: 100% 100%; mask-size: 100% 100%; mask-mode: luminance; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; }
.map .none { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--vscode-descriptionForeground); text-align: center; padding: 12px; box-sizing: border-box; }
.seg { display: inline-flex; border: 1px solid var(--line); }
.seg button { border: none; }
.seg button.on { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
.note { color: var(--vscode-descriptionForeground); font-size: 12px; margin: 4px 0; }
.layers { display: flex; flex-direction: column; gap: 2px; }
.layer { border: 1px solid transparent; border-bottom-color: var(--line); padding: 6px 8px; cursor: pointer; }
.layer:hover { background: var(--vscode-list-hoverBackground); }
.layer.selected { border: 1px solid var(--accent); background: var(--vscode-list-inactiveSelectionBackground); }
.layer.hidden { opacity: .5; }
.layer.selected.hidden { opacity: 1; }
.row { display: flex; gap: 10px; align-items: center; }
.idx { font-family: var(--vscode-editor-font-family); color: var(--vscode-descriptionForeground); width: 2.2em; text-align: right; flex: none; }
.chip { width: 22px; height: 22px; border: 1px solid rgba(128,128,128,.5); flex: none; background-size: cover; position: relative; }
.chip.thumb { width: 22px; height: 22px; }
.line1 { font-weight: 600; text-transform: capitalize; }
.line2 { color: var(--vscode-descriptionForeground); font-size: 12px; }
.grow { flex: 1; min-width: 0; }
.share { font-family: var(--vscode-editor-font-family); font-size: 12px; color: var(--vscode-descriptionForeground); flex: none; }
.bar { height: 3px; background: var(--accent); margin-top: 3px; }
.warn { color: var(--warn); }
.details { margin: 8px 0 4px 3.2em; cursor: default; }
table { border-collapse: collapse; width: 100%; }
td { padding: 4px 8px 4px 0; border-bottom: 1px solid var(--line); vertical-align: top; }
td:first-child { color: var(--vscode-descriptionForeground); width: 9em; }
.rawcol { display: none; }
body.raw .rawcol { display: table-cell; }
body.raw span.rawcol, body.raw p.rawcol { display: inline; }
.raw-inline { color: var(--vscode-textPreformat-foreground); font-family: var(--vscode-editor-font-family); font-size: .9em; margin-left: 8px; }
.maskthumb { width: 100%; aspect-ratio: 1; border: 1px solid var(--line); display: block; background: #000; }
.center { display: flex; align-items: center; justify-content: center; min-height: 50vh; color: var(--vscode-descriptionForeground); }
select, input[type=number], input[type=text] { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, var(--line)); font: inherit; padding: 1px 4px; }
input[type=number] { width: 6em; }
select { max-width: 100%; }
.num { display: inline-flex; gap: 4px; align-items: center; margin-right: 12px; white-space: nowrap; }
.swatches { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 6px; max-height: 168px; overflow-y: auto; padding: 2px; }
.swatch { width: 20px; height: 20px; border: 1px solid rgba(128,128,128,.6); cursor: pointer; padding: 0; border-radius: 0; }
.swatch:hover { outline: 2px solid var(--accent); }
.swatch.on { outline: 2px solid var(--vscode-focusBorder, var(--accent)); outline-offset: 1px; }
.swatch.def { border-style: dashed; }
.colorpick { margin-top: 4px; }
.colorpick input { width: 16em; }
`;
