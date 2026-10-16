// EDGEmat's extension: the activity bar container and its Library view (M1). Finds the game and
// REDbridge as the design says ("The game folder and the bridge"), uses REDcode's running bridge when
// REDcode is active, and builds the material library from the user's game in the background.

import * as vscode from "vscode";
import { BridgeClient, buildLibrary, defaultCacheDir, findGames, isCurrent, isGameFolder, loadLibrary, resolveBridge, resolveGame, type GameChoice, type Library } from "./core";
import { LibraryView } from "./libraryView";

/** The parts of REDcode's API (version 1, REDcode 0.9.0, docs/api.md) EDGEmat uses. */
interface REDcodeApi {
  readonly apiVersion: 1;
  bridge(): BridgeClient | undefined;
  gamePath(): string | undefined;
}

/** The part of REDdeck's API (version 1) EDGEmat uses. */
interface REDdeckApi {
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

const redcode = () => activeApi<REDcodeApi>("edgemodders.redcode-cyberpunk");
const reddeck = () => activeApi<REDdeckApi>("edgemodders.reddeck");

async function findGame(search: boolean): Promise<GameChoice | undefined> {
  return resolveGame(settings, { redcodeGamePath: () => redcode()?.gamePath(), reddeckGamePath: () => reddeck()?.gamePath() }, search);
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

export function activate(context: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel("EDGEmat");
  view = new LibraryView();
  tree = vscode.window.createTreeView("edgemat.library", { treeDataProvider: view, showCollapseAll: true }) as vscode.TreeView<unknown>;
  void vscode.commands.executeCommand("setContext", "edgemat.filtered", false);

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
    vscode.commands.registerCommand("edgemat.copyGamePath", async (node) => {
      const p = LibraryView.gamePathOf(node);
      if (p) await vscode.env.clipboard.writeText(p);
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (["edgemat.gamePath", "edgemat.bridgePath", "edgemat.dotnetRoot", "redcode.gamePath", "redcode.bridgePath"].some((k) => e.affectsConfiguration(k))) {
        ownBridge?.stop();
        ownBridge = undefined;
        void refresh();
      }
    }),
    { dispose: () => ownBridge?.stop() },
  );

  setState("building");
  void refresh();
}

export function deactivate(): void {
  ownBridge?.stop();
}
