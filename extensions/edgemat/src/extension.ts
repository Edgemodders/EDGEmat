// EDGEmat's extension: the activity bar container and its Library view (M1). Finds the game and
// REDbridge as the design says ("The game folder and the bridge"), uses REDcode's running bridge when
// REDcode is active, and builds the material library from the user's game in the background.

import * as vscode from "vscode";
import type { EdgematApi } from "./api";
import * as path from "node:path";
import { BridgeClient, buildLibrary, defaultCacheDir, findGames, isCurrent, isGameFolder, loadLibrary, projectAt, renderMaterials, resolveBridge, resolveGame, type GameChoice, type Library, type Project } from "./core";
import { FindView, openFoundSetup } from "./findView";
import { LibraryView } from "./libraryView";
import { MaterialPage } from "./materialPage";
import { connectAssistant, installServer, registerWithEditor } from "./mcp";
import { GameFiles, GameScheme, openSetupCommand, SetupEditor, type SetupEditorHost } from "./setupEditor";
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
async function chooseProject(context: vscode.ExtensionContext): Promise<Project | undefined> {
  const open = redcode()?.project?.();
  const fromRedcode = open ? projectAt(open.dir) : undefined;
  if (fromRedcode) return fromRedcode;
  const last = context.globalState.get<string>(LastProject);
  const lastProject = last ? projectAt(last) : undefined;
  const items: (vscode.QuickPickItem & { project?: Project })[] = [
    ...(lastProject ? [{ label: lastProject.name, description: "used last", detail: lastProject.dir, project: lastProject }] : []),
    { label: "$(folder-opened) A project folder or .cpmodproj...", detail: "A WolvenKit project, such as one made with REDcode: New Project" },
  ];
  const pick = await vscode.window.showQuickPick(items, { title: "Save to Project: which project?", placeHolder: redcode() ? "REDcode has no project open. Pick one, or open it in REDcode first." : "Pick a WolvenKit project" });
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
  const uri = vscode.Uri.from({ scheme: "redcode-game", path: "/" + target.mesh.replace(/\\/g, "/") });
  await vscode.commands.executeCommand("vscode.openWith", uri, "redcode.cr2w");
  if (target.appearance) vscode.window.setStatusBarMessage(`$(eye) EDGEmat: pick the look "${target.appearance}" in the 3D view`, 15000);
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
  };
  const setupEditor = new SetupEditor(host);
  const materialPage = new MaterialPage(context, { extensionUri: context.extensionUri, bridge: bridgeNow, project: () => chooseProject(context), packAndTry: packAndTryFor, log });

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
    vscode.commands.registerCommand("edgemat.clearFind", () => {
      find.clear();
      findTree.message = undefined;
      void vscode.commands.executeCommand("setContext", "edgemat.findActive", false);
    }),
    vscode.commands.registerCommand("edgemat.openFoundSetup", (setup: string, mask?: string, via?: string) => openFoundSetup(setup, mask, via)),
    vscode.commands.registerCommand("edgemat.copyGamePath", async (node) => {
      const p = LibraryView.gamePathOf(node) ?? FindView.gamePathOf(node);
      if (p) await vscode.env.clipboard.writeText(p);
    }),
    vscode.commands.registerCommand("edgemat.viewIn3D", (node) => viewIn3D(FindView.meshOf(node))),
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
      const maps = await renderMaterials(bridge, library(), cacheDir, req, log);
      log(`3D view: ${Object.keys(maps).length} of ${req.materials?.length ?? "the"} materials for ${req.mesh}${req.appearance ? `, look ${req.appearance}` : ""}, in ${Date.now() - started} ms`);
      return maps;
    },
    onDidChangeMaterials: materialsChanged.event,
  };
}

export function deactivate(): void {
  ownBridge?.stop();
}
