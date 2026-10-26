// EDGEmat's extension: the activity bar container and its Library view (M1). Finds the game and
// REDbridge as the design says ("The game folder and the bridge"), uses REDcode's running bridge when
// REDcode is active, and builds the material library from the user's game in the background.

import * as vscode from "vscode";
import type { EdgematApi } from "./api";
import * as path from "node:path";
import * as fs from "node:fs";
import { BridgeClient, buildLibrary, defaultCacheDir, Desk, deskLabel, deskProjectName, findGames, gamePathInProject, isCurrent, isFilePath, isGameFolder, loadLibrary, projectAt, renderMaterials, resolveBridge, resolveGame, suffixFor, type DeskConflict, type GameChoice, type Library, type Project } from "./core";
import { DeskView } from "./deskView";
import { FindView, openFoundSetup } from "./findView";
import { LibraryView } from "./libraryView";
import { MaterialPage } from "./materialPage";
import { connectAssistant, installServer, registerWithEditor } from "./mcp";
import { GameFiles, gamePathOfUri, GameScheme, gameUri, openSetupCommand, SetupEditor, type SetupEditorHost } from "./setupEditor";
import { SurfacePages } from "./surfacePage";

/** The parts of REDcode's API (version 1, docs/api.md) EDGEmat uses. project and packAndTry came after 0.9.0. */
interface REDcodeApi {
  readonly apiVersion: 1;
  bridge(): BridgeClient | undefined;
  gamePath(): string | undefined;
  /** The open WolvenKit project. */
  project?(): { name: string; dir: string; archive: string } | undefined;
  /** Packs the open project and gets it into the game: hot when Red Hot Tools runs, else installed. */
  packAndTry?(): Promise<"hot" | "installed" | undefined>;
}

/** The part of EDGEdeck's API (version 1) EDGEmat uses. */
interface EDGEdeckApi {
  readonly apiVersion: 1;
  gamePath(): string;
}

type State = "noGame" | "noBridge" | "building" | "ready" | "error";

let output: vscode.OutputChannel;
let view: LibraryView;
let tree: vscode.TreeView<unknown>;
let ownBridge: BridgeClient | undefined;
let ownBridgeGame: string | undefined;
let sharedBridge: BridgeClient | undefined;
let building: Promise<void> | undefined;
const cacheDir = defaultCacheDir();

const log = (line: string) => output.appendLine(`${new Date().toISOString().slice(11, 19)} ${line}`);

function setState(state: State): void {
  void vscode.commands.executeCommand("setContext", "edgemat.state", state);
}

function settings(key: string): string | undefined {
  const [section, name] = [key.slice(0, key.indexOf(".")), key.slice(key.indexOf(".") + 1)];
  const v = vscode.workspace.getConfiguration(section).get<string>(name, "");
  return v && v.trim() ? v.trim() : undefined;
}

/** An extension's API, only when the extension is already active (activating another extension here could race a reload). */
function activeApi<T extends { apiVersion: number }>(id: string): T | undefined {
  const ext = vscode.extensions.getExtension<T>(id);
  const api = ext?.isActive ? ext.exports : undefined;
  return api?.apiVersion === 1 ? api : undefined;
}

const REDcodeId = "edgemodders.redcode-cyberpunk";
const redcode = () => activeApi<REDcodeApi>(REDcodeId);
const edgedeck = () => activeApi<EDGEdeckApi>("edgemodders.edgedeck");

async function findGame(search: boolean): Promise<GameChoice | undefined> {
  return resolveGame(settings, { redcodeGamePath: () => redcode()?.gamePath(), edgedeckGamePath: () => edgedeck()?.gamePath() }, search);
}

/** REDcode's running bridge when it reads the same game; otherwise EDGEmat's own, started once. */
async function getBridge(game: GameChoice): Promise<BridgeClient | undefined> {
  const rc = redcode();
  const shared = rc?.bridge();
  if (shared?.running && rc?.gamePath()?.toLowerCase() === game.path.toLowerCase()) {
    if (sharedBridge !== shared) log(`Using REDcode's REDbridge for ${game.path}`);
    sharedBridge = shared;
    return shared;
  }
  sharedBridge = undefined;
  if (ownBridge?.running && ownBridgeGame === game.path) return ownBridge;
  ownBridge?.stop();
  const choice = resolveBridge(settings);
  if (!choice) return undefined;
  log(`Starting REDbridge from ${choice.exe} (${choice.from}) for ${game.path}`);
  const b = new BridgeClient({ exe: choice.exe, gamePath: game.path, dotnetRoot: choice.dotnetRoot });
  b.on("log", (line) => output.appendLine(`  bridge | ${line}`));
  b.on("exit", (code) => log(`REDbridge exited (${code}); it restarts when needed`));
  b.on("error", (e) => log(`REDbridge could not start: ${e.message}`));
  b.start();
  const info = await b.info();
  if (!info.gameLoaded) await b.load(game.path);
  log(`REDbridge ${info.version}, WolvenKit ${info.wolvenKit}`);
  ownBridge = b;
  ownBridgeGame = game.path;
  return b;
}

/** The bridge for the game in use now, for work outside a library build such as the surface page. */
async function bridgeNow(): Promise<BridgeClient | undefined> {
  const game = await findGame(false);
  return game ? getBridge(game) : undefined;
}

function show(library: Library | undefined): void {
  view.set(library, cacheDir);
  tree.message = view.summary() || undefined;
}

/** Shows the cached library, then checks it against the game and rebuilds it in the background when needed. */
function refresh(force = false): Promise<void> {
  if (building) return building;
  building = (async () => {
    const cached = loadLibrary(cacheDir);
    show(cached);
    const game = await findGame(true);
    if (!game) {
      setState(cached ? "ready" : "noGame");
      return;
    }
    let bridge: BridgeClient | undefined;
    try {
      bridge = await getBridge(game);
    } catch (e) {
      log(`REDbridge failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!bridge) {
      setState(cached ? "ready" : "noBridge");
      return;
    }
    if (!force && cached && (await isCurrent(cached, bridge))) {
      setState("ready");
      return;
    }
    setState(cached ? "ready" : "building");
    log(force ? "Rebuilding the library" : cached ? "The game changed: rebuilding the library" : `Building the library from ${game.path} (${game.from})`);
    await vscode.window.withProgress({ location: { viewId: "edgemat.library" }, title: "Building the material library" }, async () => {
      await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: "EDGEmat" }, async (p) => {
        let last = 0;
        const lib = await buildLibrary(bridge!, cacheDir, (message, done, total) => {
          if (total && done && done - last >= 10) {
            last = done;
            p.report({ message: `${message} ${done}/${total}` });
          }
        });
        log(`Library built in ${lib.seconds} s: ${lib.counts.templates} surfaces, ${lib.counts.microblends} microblends, ${lib.counts.setups} setups, ${lib.counts.masks} mask sets${lib.failed.length ? `; ${lib.failed.length} files failed, see below` : ""}`);
        for (const f of lib.failed) log(`  failed: ${f}`);
        for (const f of lib.missing) log(`  referenced by a surface but missing in the game: ${f}`);
        show(lib);
      });
    });
    setState("ready");
  })()
    .catch((e) => {
      log(`The library could not be built: ${e instanceof Error ? e.message : String(e)}`);
      setState(view.current ? "ready" : "error");
    })
    .finally(() => {
      building = undefined;
    });
  return building;
}

async function setGameFolder(): Promise<void> {
  const current = settings("edgemat.gamePath") ?? (await findGame(false))?.path ?? "";
  const found = await findGames();
  const items: (vscode.QuickPickItem & { dir?: string })[] = [
    ...found.map((g) => ({ label: g.path, description: g.source + (g.path.toLowerCase() === current.toLowerCase() ? ", in use" : ""), dir: g.path })),
    { label: "$(folder-opened) Browse...", description: "the folder that holds bin\\x64\\Cyberpunk2077.exe" },
  ];
  const pick = await vscode.window.showQuickPick(items, { title: "Cyberpunk 2077 folder", placeHolder: current ? `In use: ${current}` : "Pick the game install EDGEmat reads" });
  if (!pick) return;
  let dir = pick.dir;
  if (!dir) {
    const chosen = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, title: "The Cyberpunk 2077 folder", openLabel: "Use This Folder" });
    dir = chosen?.[0]?.fsPath;
  }
  if (!dir) return;
  if (!isGameFolder(dir)) {
    void vscode.window.showErrorMessage(`${dir} is not the game: it has no bin\\x64\\Cyberpunk2077.exe.`);
    return;
  }
  await vscode.workspace.getConfiguration("edgemat").update("gamePath", dir, vscode.ConfigurationTarget.Global);
}

const LastProject = "edgemat.lastProject";

/**
 * The project to save into: the one REDcode has open, else one the modder picks (the last one used is
 * offered first). Remembered for next time.
 */
async function chooseProject(context: vscode.ExtensionContext, title = "Save to Project"): Promise<Project | undefined> {
  const open = redcode()?.project?.();
  const fromRedcode = open ? projectAt(open.dir) : undefined;
  if (fromRedcode) return fromRedcode;
  const last = context.globalState.get<string>(LastProject);
  const lastProject = last ? projectAt(last) : undefined;
  const items: (vscode.QuickPickItem & { project?: Project })[] = [
    ...(lastProject ? [{ label: lastProject.name, description: "used last", detail: lastProject.dir, project: lastProject }] : []),
    { label: "$(folder-opened) A project folder or .cpmodproj...", detail: "A WolvenKit project, such as one made with REDcode: New Project" },
  ];
  const pick = await vscode.window.showQuickPick(items, { title: `${title}: which project?`, placeHolder: redcode() ? "REDcode has no project open. Pick one, or open it in REDcode first." : "Pick a WolvenKit project" });
  if (!pick) return undefined;
  let project = pick.project;
  if (!project) {
    const chosen = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: true, canSelectMany: false, filters: { "WolvenKit project": ["cpmodproj"] }, title: "A WolvenKit project", openLabel: "Use This Project" });
    const p = chosen?.[0]?.fsPath;
    if (!p) return undefined;
    project = projectAt(p);
    if (!project) {
      void vscode.window.showErrorMessage(`${p} is not a WolvenKit project: it has no .cpmodproj and no source\\archive folder.`);
      return undefined;
    }
  }
  await context.globalState.update(LastProject, project.dir);
  return project;
}

/** REDcode's Pack and Try, when REDcode has this project open. */
function packAndTryFor(project: Project): (() => Promise<unknown>) | undefined {
  const rc = redcode();
  const open = rc?.project?.();
  if (!rc?.packAndTry || !open || path.resolve(open.dir).toLowerCase() !== path.resolve(project.dir).toLowerCase()) return undefined;
  return async () => {
    const r = await rc.packAndTry!();
    log(`REDcode Pack and Try: ${r ?? "cancelled or failed"}`);
  };
}

/**
 * Opens a mesh in REDcode's 3D view, which asks EDGEmat for its materials (renderMaterials below).
 * REDcode opens it at the mesh's first look; the look to pick is shown in the status bar.
 */
async function viewIn3D(target: { mesh: string; appearance?: string } | undefined): Promise<void> {
  if (!target) return;
  const ext = vscode.extensions.getExtension<REDcodeApi>(REDcodeId);
  if (!ext) {
    const pick = await vscode.window.showInformationMessage("View in 3D uses REDcode's 3D view, and REDcode is not installed.", "Show REDcode");
    if (pick) await vscode.commands.executeCommand("extension.open", REDcodeId);
    return;
  }
  const api = ext.isActive ? ext.exports : await ext.activate();
  // REDcode starts its bridge when VS Code starts; give a fresh start a moment to load the game.
  for (let i = 0; i < 30 && !api?.bridge()?.running; i++) await new Promise((r) => setTimeout(r, 500));
  if (!api?.bridge()?.running) {
    const pick = await vscode.window.showWarningMessage("REDcode's REDbridge is not running, so its 3D view cannot open game files.", "Restart REDbridge");
    if (pick) await vscode.commands.executeCommand("redcode.restartBridge");
    return;
  }
  // A project's copy opens as the file; a game mesh through REDcode's game files.
  const uri = isFilePath(target.mesh) ? vscode.Uri.file(target.mesh) : vscode.Uri.from({ scheme: "redcode-game", path: "/" + target.mesh.replace(/\\/g, "/") });
  await vscode.commands.executeCommand("vscode.openWith", uri, "redcode.cr2w");
  if (target.appearance) vscode.window.setStatusBarMessage(`$(eye) EDGEmat: pick the look "${target.appearance}" in the 3D view`, 15000);
}

/**
 * What Open in EDGEmat hands over from REDcode's 3D view: the mesh as REDcode's viewer names it to
 * renderMaterials (its game path, or the file on disk), and the look on screen. Also takes a Uri, a plain
 * string, a node of REDcode's Project view ({ file }), or one of its Game Assets view ({ file: { name } }).
 */
export interface OpenMeshRequest {
  mesh?: string;
  uri?: vscode.Uri | string;
  appearance?: string;
}

function meshOfRequest(arg: unknown): { mesh: string; appearance?: string } | undefined {
  if (arg instanceof vscode.Uri) return arg.scheme === "file" ? { mesh: arg.fsPath } : gamePathOfUri(arg) ? { mesh: gamePathOfUri(arg)! } : undefined;
  if (typeof arg === "string") return arg.trim() ? { mesh: arg.trim() } : undefined;
  const r = (arg ?? {}) as OpenMeshRequest & { file?: unknown };
  const appearance = typeof r.appearance === "string" && r.appearance.trim() ? r.appearance.trim() : undefined;
  const uri = typeof r.uri === "string" ? vscode.Uri.parse(r.uri) : r.uri;
  const asset = (r.file as { name?: unknown } | undefined)?.name;
  const mesh =
    typeof r.mesh === "string" && r.mesh.trim() ? { mesh: r.mesh.trim() }
    : uri ? meshOfRequest(uri)
    : typeof r.file === "string" ? { mesh: r.file }
    : typeof asset === "string" ? { mesh: asset }
    : undefined;
  return mesh && { ...mesh, appearance };
}

/**
 * What Open Material in EDGEmat was given: a file from the Explorer or an editor tab (a Uri), a node of
 * REDcode's Project view ({ file }, docs/api.md there), or a game path.
 */
function materialUri(arg: unknown): vscode.Uri | undefined {
  if (arg instanceof vscode.Uri) return arg;
  if (typeof arg === "string" && arg.trim()) return path.isAbsolute(arg) ? vscode.Uri.file(arg) : gameUri(arg.trim());
  const file = (arg as { file?: unknown } | undefined)?.file;
  if (typeof file === "string") return vscode.Uri.file(file);
  return undefined;
}

/** Opens a material file in the EDGEmat page for its kind: a setup in the setup editor, a surface on its page. */
async function openMaterial(arg: unknown, host: SetupEditorHost): Promise<void> {
  const uri = materialUri(arg) ?? vscode.window.activeTextEditor?.document.uri;
  if (!uri) return openSetupCommand(host);
  const name = uri.path.toLowerCase();
  if (/\.mlsetup(\.json)?$/.test(name)) {
    await vscode.commands.executeCommand("vscode.openWith", uri, SetupEditor.viewType);
  } else if (name.endsWith(".mltemplate")) {
    const gamePath = gamePathOfUri(uri) ?? (uri.scheme === "file" ? gamePathInProject(uri.fsPath) : undefined);
    if (gamePath) host.openSurface(gamePath);
    else void vscode.window.showInformationMessage("EDGEmat opens a surface (.mltemplate) from the game or a project's source\\archive folder.");
  } else {
    void vscode.window.showInformationMessage(`EDGEmat opens setups (.mlsetup) and surfaces (.mltemplate). Other material files come later.`);
  }
}

export function activate(context: vscode.ExtensionContext): EdgematApi {
  output = vscode.window.createOutputChannel("EDGEmat");
  view = new LibraryView();
  tree = vscode.window.createTreeView("edgemat.library", { treeDataProvider: view, showCollapseAll: true }) as vscode.TreeView<unknown>;
  void vscode.commands.executeCommand("setContext", "edgemat.filtered", false);
  const pages = new SurfacePages(context.extensionUri, () => cacheDir, bridgeNow, log);
  const library = () => view.current ?? loadLibrary(cacheDir);
  const find = new FindView(bridgeNow, () => cacheDir, log);
  const findTree = vscode.window.createTreeView("edgemat.find", { treeDataProvider: find, showCollapseAll: true });
  const desk = new Desk(cacheDir);
  fs.mkdirSync(desk.dir, { recursive: true });
  const deskView = new DeskView(desk, bridgeNow, () => cacheDir, log);
  const deskTree = vscode.window.createTreeView("edgemat.desk", { treeDataProvider: deskView, showCollapseAll: true });
  // The MCP server's mat_desk changes desk.json too.
  const deskWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(desk.dir), "desk.json"));
  for (const on of [deskWatcher.onDidChange, deskWatcher.onDidCreate, deskWatcher.onDidDelete]) on(() => deskView.load());
  const materialsChanged = new vscode.EventEmitter<{ mesh?: string; materials: string[] }>();
  const host: SetupEditorHost = {
    extensionUri: context.extensionUri,
    cacheDir: () => cacheDir,
    bridge: bridgeNow,
    library,
    log,
    openSurface: (p) => {
      const template = library()?.templates.find((t) => t.path.toLowerCase() === p.toLowerCase());
      if (template) void pages.show({ kind: "surface", template });
      else void vscode.window.showInformationMessage(`${p} is not in the library: a custom or missing surface.`);
    },
    openMicroblend: (p) => {
      const found = library()?.microblends.find((m) => m.path.toLowerCase() === p.toLowerCase());
      void pages.show({ kind: "microblend", microblend: found ?? { path: p, name: (p.split("\\").pop() ?? p).replace(/\.xbm$/i, "") } });
    },
    project: () => chooseProject(context),
    packAndTry: packAndTryFor,
    materialsChanged: () => materialsChanged.fire({ materials: [] }),
    desk,
    deskChanged: () => deskView.refresh(),
  };
  const setupEditor = new SetupEditor(host);
  const materialPage = new MaterialPage(context, { extensionUri: context.extensionUri, bridge: bridgeNow, project: () => chooseProject(context), packAndTry: packAndTryFor, materialsChanged: () => materialsChanged.fire({ materials: [] }), log });

  context.subscriptions.push(
    output,
    tree,
    vscode.commands.registerCommand("edgemat.rebuildLibrary", () => refresh(true)),
    vscode.commands.registerCommand("edgemat.setGameFolder", setGameFolder),
    vscode.commands.registerCommand("edgemat.showLog", () => output.show()),
    vscode.commands.registerCommand("edgemat.searchLibrary", async () => {
      const q = await vscode.window.showInputBox({ title: "Search the library", prompt: "Plain words, such as leather, worn chrome or denim", value: view.query });
      if (q === undefined) return;
      view.setFilter(q);
      tree.message = view.summary() || undefined;
    }),
    vscode.commands.registerCommand("edgemat.clearSearch", () => {
      view.setFilter("");
      tree.message = view.summary() || undefined;
    }),
    vscode.workspace.registerFileSystemProvider(GameScheme, new GameFiles(bridgeNow, () => cacheDir), { isCaseSensitive: false }),
    vscode.window.registerCustomEditorProvider(SetupEditor.viewType, setupEditor, { supportsMultipleEditorsPerDocument: true }),
    vscode.commands.registerCommand("edgemat.saveToProject", () => setupEditor.saveActiveToProject()),
    vscode.commands.registerCommand("edgemat.openSetup", () => openSetupCommand(host)),
    vscode.commands.registerCommand("edgemat.openMaterial", (arg) => openMaterial(arg, host)),
    vscode.commands.registerCommand("edgemat.openItem", (node) => {
      const subject = LibraryView.subjectOf(node);
      if (subject) void pages.show(subject);
    }),
    findTree,
    vscode.commands.registerCommand("edgemat.find", async () => {
      const q = await vscode.window.showInputBox({ title: "Find", prompt: "A garment's in-game name, such as punk jeans or Sunny Ammo, or part of a mesh path, such as s1_055" });
      if (!q?.trim()) return;
      await vscode.window.withProgress({ location: { viewId: "edgemat.find" }, title: "Finding" }, () => find.search(q));
      findTree.message = find.summary || undefined;
      void vscode.commands.executeCommand("setContext", "edgemat.findActive", true);
    }),
    // Open in EDGEmat, from REDcode's Game Assets and Project views and its 3D view: a mesh or a setup goes on
    // the Desk, shown there with the look on screen open; a setup opens too, and a surface opens on its page.
    vscode.commands.registerCommand("edgemat.openMesh", async (arg?: OpenMeshRequest) => {
      const req = meshOfRequest(arg ?? vscode.window.activeTextEditor?.document.uri);
      const kind = !req ? undefined : /\.mesh$/i.test(req.mesh) ? "mesh" : /\.mlsetup$/i.test(req.mesh) ? "setup" : /\.mltemplate$/i.test(req.mesh) ? "surface" : undefined;
      if (!req || !kind) {
        void vscode.window.showInformationMessage("Open in EDGEmat takes a mesh (.mesh), a setup (.mlsetup) or a surface (.mltemplate), from REDcode's Game Assets, Project or 3D view.");
        return;
      }
      if (kind === "surface") {
        const gamePath = isFilePath(req.mesh) ? gamePathInProject(req.mesh) : req.mesh;
        if (gamePath) host.openSurface(gamePath);
        return;
      }
      const there = desk.matching(req.mesh, kind).length;
      const { node, entry, created } = deskView.put(kind, req.mesh, req.appearance);
      await vscode.commands.executeCommand("edgemat.desk.focus");
      if (node) await deskTree.reveal(node, { select: true, focus: true, expand: true });
      if (created && there) vscode.window.setStatusBarMessage(`$(layers) EDGEmat: the Desk had this one edited already; this is a fresh copy, ${deskLabel(entry)}`, 10000);
      if (node?.kind === "setupFile") await openFoundSetup(entry.path, undefined, "the Desk", entry.root, entry.id);
    }),
    deskTree,
    deskWatcher,
    vscode.commands.registerCommand("edgemat.removeFromDesk", async (node) => {
      const entry = DeskView.entryOf(node);
      if (!entry) return;
      const edits = desk.edited(entry).length;
      if (edits) {
        const go = await vscode.window.showWarningMessage(`Take ${deskLabel(entry)} off the Desk?`, { modal: true, detail: `Its ${edits === 1 ? "edit" : `${edits} edited setups`} on the Desk ${edits === 1 ? "is" : "are"} deleted. Your projects keep what you added to them.` }, "Take It Off");
        if (!go) return;
      }
      deskView.remove([entry]);
      materialsChanged.fire({ materials: [] });
    }),
    vscode.commands.registerCommand("edgemat.renameDeskEntry", async (node) => {
      const entry = DeskView.entryOf(node);
      if (!entry) return;
      const name = await vscode.window.showInputBox({ title: `Rename ${path.win32.basename(entry.path)} on the Desk`, prompt: "A name for this variation, such as dark red. Empty to clear it.", value: entry.name ?? "" });
      if (name === undefined) return;
      desk.rename(entry.id, name);
      deskView.load();
    }),
    vscode.commands.registerCommand("edgemat.deskEntryToProject", (node) => {
      const entry = DeskView.entryOf(node);
      if (entry) return deskToProject([entry.id]);
    }),
    vscode.commands.registerCommand("edgemat.clearDesk", async () => {
      const n = desk.entries().length;
      const edited = desk.editCount();
      if (!n && !edited) return;
      const go = await vscode.window.showWarningMessage(
        "Clear the Desk?",
        { modal: true, detail: `${n} thing${n === 1 ? "" : "s"} come${n === 1 ? "s" : ""} off the Desk${edited ? `, and the edits of ${edited} setup${edited === 1 ? "" : "s"} saved there are deleted` : ""}. Nothing in your projects or the game changes.` },
        "Clear the Desk",
      );
      if (!go) return;
      desk.clear();
      deskView.load();
      materialsChanged.fire({ materials: [] });
    }),
    vscode.commands.registerCommand("edgemat.deskToProject", () => deskToProject()),
    vscode.commands.registerCommand("edgemat.clearFind", () => {
      find.clear();
      findTree.message = undefined;
      void vscode.commands.executeCommand("setContext", "edgemat.findActive", false);
    }),
    vscode.commands.registerCommand("edgemat.openFoundSetup", (setup: string, mask?: string, via?: string, root?: string, deskId?: string) => openFoundSetup(setup, mask, via, root, deskId)),
    vscode.commands.registerCommand("edgemat.copyGamePath", async (node) => {
      const p = LibraryView.gamePathOf(node) ?? FindView.gamePathOf(node);
      if (p) await vscode.env.clipboard.writeText(p);
    }),
    vscode.commands.registerCommand("edgemat.viewIn3D", async (node) => {
      const target = FindView.meshOf(node);
      // A mesh on the Desk opens as its entry's copy, which shows that entry's edits; the game's and the project's keep their look.
      const entry = desk.get(FindView.deskOf(node));
      const bridge = target && entry?.kind === "mesh" ? await bridgeNow() : undefined;
      if (target && entry && bridge) target.mesh = await desk.meshFile(bridge, entry);
      await viewIn3D(target);
    }),
    vscode.commands.registerCommand("edgemat.newMaterial", () => materialPage.open()),
    vscode.commands.registerCommand("edgemat.newMaterialHere", (node) => materialPage.open(FindView.targetsOf(node))),
    vscode.commands.registerCommand("edgemat.setImageKey", () => materialPage.setKey()),
    vscode.commands.registerCommand("edgemat.clearImageKey", () => materialPage.clearKey()),
    vscode.commands.registerCommand("edgemat.connectAssistant", () => connectAssistant(context, log)),
    ...registerWithEditor(context, String(context.extension.packageJSON.version), log),
    materialsChanged,
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (["edgemat.gamePath", "edgemat.bridgePath", "edgemat.dotnetRoot", "redcode.gamePath", "redcode.bridgePath"].some((k) => e.affectsConfiguration(k))) {
        ownBridge?.stop();
        ownBridge = undefined;
        void refresh();
      }
    }),
    { dispose: () => ownBridge?.stop() },
  );

  /**
   * The Desk's + buttons, after the modder confirms: one entry (`only`, the + on its line), or everything on
   * the Desk (the + in its title bar), with one variation picked for each file on it more than once.
   */
  async function deskToProject(only?: string[]): Promise<void> {
    let ids = only ?? desk.entries().map((e) => e.id);
    if (!ids.length) {
      void vscode.window.showInformationMessage("The Desk is empty. Right-click a mesh in REDcode's Game Assets or Project view and pick Open in EDGEmat to put it here.");
      return;
    }
    for (const group of only ? [] : desk.duplicates(ids)) {
      const items = group.map((e) => ({ label: deskLabel(e), description: desk.edited(e).length ? "edited on the Desk" : "as in the game", detail: e.root ? `from ${deskProjectName(e.root)}` : undefined, id: e.id }));
      const pick = await vscode.window.showQuickPick([...items, { label: "$(circle-slash) Skip this one", description: "none of them goes in", id: "" }], {
        title: `The Desk has ${group.length} variations of ${path.win32.basename(group[0].path)}`,
        placeHolder: "In the game one mesh wears one variation: which goes into the project?",
        ignoreFocusOut: true,
      });
      if (!pick) return;
      const out = group.map((e) => e.id).filter((id) => id !== pick.id);
      ids = ids.filter((id) => !out.includes(id));
    }
    if (!ids.length) return;
    const entries = desk.entries().filter((e) => ids.includes(e.id));
    const what = entries.length === 1 ? deskLabel(entries[0]) : "the Desk";
    const unsaved = setupEditor.unsavedOnDesk(ids);
    if (unsaved.length) {
      const go = await vscode.window.showWarningMessage(`${unsaved.join(", ")} ${unsaved.length === 1 ? "has" : "have"} edits not saved yet, which would not go into the project. Save them first with Ctrl+S.`, { modal: true }, "Add Without Them");
      if (!go) return;
    }
    const bridge = await bridgeNow();
    if (!bridge) {
      void vscode.window.showErrorMessage("Adding the Desk to a project needs REDbridge. Set the game folder and REDbridge first.");
      return;
    }
    const project = await chooseProject(context, entries.length === 1 ? `Add ${deskLabel(entries[0])} to Project` : "Add the Desk to Project");
    if (!project) return;
    const suffix = suffixFor(project.name);
    const plural = (k: number, w: string) => `${k} ${w}${k === 1 ? "" : "s"}`;
    const base = (p: string) => p.split("\\").pop();
    // Meshes the project already has with other materials: replace them with the Desk's, or keep them and leave those edits on the Desk.
    let conflicts: DeskConflict[];
    try {
      conflicts = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Comparing ${what} with ${project.name}` }, () => desk.conflicts(bridge, project, suffix, ids));
    } catch (e) {
      void vscode.window.showErrorMessage(`Could not compare the Desk with ${project.name}: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    let replace = false;
    if (conflicts.length) {
      const which = await vscode.window.showWarningMessage(
        `${project.name} already has its own ${conflicts.length === 1 ? base(conflicts[0].mesh) : plural(conflicts.length, "mesh")} from the Desk, with other materials.`,
        {
          modal: true,
          detail:
            `${conflicts.map((c) => `${base(c.mesh)} no longer uses ${c.setups.map(base).join(", ")}, which you edited on the Desk.`).join("\n")}\n\n` +
            "Replace: the project's copy becomes the Desk's mesh, with your Desk edits; what the project's copy had is lost. " +
            "Keep: the project's copy stays as it is, and those edits stay on the Desk.",
        },
        "Replace with the Desk's",
        "Keep the Project's",
      );
      if (!which) return;
      replace = which === "Replace with the Desk's";
    }
    const meshes = entries.filter((e) => e.kind === "mesh").length;
    const edited = entries.reduce((n, e) => n + desk.edited(e).length, 0);
    const clearWord = entries.length === 1 ? "Add and Take It Off the Desk" : "Add and Clear the Desk";
    const go = await vscode.window.showWarningMessage(
      `Add ${what} to ${project.name}?`,
      {
        modal: true,
        detail:
          `${plural(meshes, "mesh")} and ${plural(edited, "setup")} edited on the Desk go into ${project.archive}. ` +
          `Each edited setup is saved as a new setup (named with _${suffix}), and the mesh it was edited on is copied in and pointed at it; the other meshes are copied as they are. ` +
          `Meshes already in the project are kept, and changed only to point at the new setups${conflicts.length ? (replace ? ", except the ones you chose to replace" : "; the kept ones stay on the Desk with their edits") : ""}. ` +
          `${clearWord} takes off the Desk only what went into the project.`,
      },
      "Add to Project",
      clearWord,
    );
    if (!go) return;
    try {
      const r = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Adding ${what} to ${project.name}` }, () => desk.toProject(bridge, project, suffix, { replace, ids }));
      log(`${what === "the Desk" ? "The Desk" : what} added to ${project.archive}: ${r.written.join(", ") || "nothing written"}`);
      for (const s of r.setups) log(`  ${s.from} saved as ${s.to}${s.meshes.length ? `, pointed at by ${s.meshes.join(", ")}` : ""}`);
      for (const n of r.notes) log(`  ${n}`);
      if (go === clearWord) deskView.remove(desk.entries().filter((e) => r.added.includes(e.id) && !r.kept.includes(e.id)));
      materialsChanged.fire({ materials: [] });
      const pack = packAndTryFor(project);
      const kept = r.kept.length ? ` ${plural(r.kept.length, "mesh")} stayed on the Desk with ${r.kept.length === 1 ? "its" : "their"} edits, since the project keeps its own.` : "";
      const done = r.written.length ? `${plural(r.written.length, "file")} written` : "nothing new to write: the project has it all already";
      const choice = await vscode.window.showInformationMessage(
        `Added ${what} to ${project.name}: ${done}.${kept}${r.notes.length ? ` Details in the EDGEmat log.` : ""}`,
        ...(pack && r.written.length ? ["Pack and Try"] : []),
        ...(r.notes.length ? ["Show Log"] : []),
      );
      if (choice === "Pack and Try" && pack) await pack();
      else if (choice === "Show Log") output.show();
    } catch (e) {
      void vscode.window.showErrorMessage(`Adding ${what} to ${project.name} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  installServer(context.extensionPath, log);
  setState("building");
  void refresh();

  return {
    apiVersion: 1,
    async renderMaterials(req) {
      const bridge = await bridgeNow();
      if (!bridge) throw new Error("EDGEmat needs the game folder and REDbridge.");
      // Layer colors come from the library: wait for a first build.
      if (!view.current && building) await building;
      const started = Date.now();
      const maps = await renderMaterials(bridge, library(), cacheDir, req, log, (setup, roots) => setupEditor.liveColorMap(setup, roots));
      log(`3D view: ${Object.keys(maps).length} of ${req.materials?.length ?? "the"} materials for ${req.mesh}${req.appearance ? `, look ${req.appearance}` : ""}, in ${Date.now() - started} ms`);
      return maps;
    },
    onDidChangeMaterials: materialsChanged.event,
  };
}

export function deactivate(): void {
  ownBridge?.stop();
}
