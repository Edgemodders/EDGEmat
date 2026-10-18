// The setup editor (design, "In VS Code"), read-only in M2: a custom editor for .mlsetup and WolvenKit
// .mlsetup.json files, wherever they come from: disk, a project, REDcode's game files (redcode-game:),
// EDGEmat's own game files (edgemat-game:), or a mod archive (extracted into the cache). It shows each
// layer in plain words, a flat color map of the setup in texture space, and where each layer shows.

import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { gamePathInProject, openSetup, type BridgeClient, type Library, type OpenedSetup, type SetupSource } from "./core";
import type { SetupPageData } from "./webview/setup";

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
 * A read-only file system over the game archives, so a game setup opens in the setup editor with a
 * lock on its tab. Reading bytes extracts the file into the cache.
 */
export class GameFiles implements vscode.FileSystemProvider {
  private readonly emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile = this.emitter.event;
  constructor(private readonly bridge: () => Promise<BridgeClient | undefined>, private readonly cacheDir: () => string) {}
  watch(): vscode.Disposable {
    return new vscode.Disposable(() => undefined);
  }
  stat(): vscode.FileStat {
    return { type: vscode.FileType.File, ctime: 0, mtime: 0, size: 0, permissions: vscode.FilePermission.Readonly };
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
  createDirectory(): void { throw vscode.FileSystemError.NoPermissions(); }
  writeFile(): void { throw vscode.FileSystemError.NoPermissions(); }
  delete(): void { throw vscode.FileSystemError.NoPermissions(); }
  rename(): void { throw vscode.FileSystemError.NoPermissions(); }
}

class SetupDocument implements vscode.CustomDocument {
  /** The mask set named by the mesh's material, when the setup was opened from Find. */
  readonly mask?: string;
  readonly origin: string;
  constructor(readonly uri: vscode.Uri, readonly source: SetupSource, origin: string) {
    const { mask, via } = uriOptions(uri);
    this.mask = mask;
    this.origin = via ? `${origin} · from ${via}` : origin;
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
  log(line: string): void;
}

/** Files taken out of mod archives: the extracted file, the game path inside the archive, and the archive's name. */
const fromMods = new Map<string, { gamePath: string; archive: string }>();

export class SetupEditor implements vscode.CustomReadonlyEditorProvider<SetupDocument> {
  static readonly viewType = "edgemat.setup";

  constructor(private readonly host: SetupEditorHost) {}

  async openCustomDocument(uri: vscode.Uri): Promise<SetupDocument> {
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
    let mask: string | undefined = doc.mask;
    let opened: OpenedSetup | undefined;
    let serial = 0;

    const load = async () => {
      const id = ++serial;
      w.html = this.html(w, { kind: "loading", title: this.title(doc), origin: doc.origin });
      try {
        const bridge = await this.host.bridge();
        const o = await openSetup(bridge, this.host.library(), this.host.cacheDir(), doc.source, mask);
        if (id !== serial) return;
        opened = o;
        w.html = this.html(w, this.data(w, doc, o, !!doc.mask && mask === doc.mask));
      } catch (e) {
        if (id !== serial) return;
        const message = e instanceof Error ? e.message : String(e);
        this.host.log(`The setup editor could not open ${doc.uri.toString()}: ${message}`);
        w.html = this.html(w, { kind: "error", title: this.title(doc), origin: doc.origin, message });
      }
    };

    w.onDidReceiveMessage(async (m: { type: string; text?: string; path?: string }) => {
      if (m.type === "copy" && m.text) {
        await vscode.env.clipboard.writeText(m.text);
        vscode.window.setStatusBarMessage(`Copied ${m.text.length > 60 ? m.text.slice(0, 57) + "..." : m.text}`, 2500);
      } else if (m.type === "surface" && m.path) {
        this.host.openSurface(m.path);
      } else if (m.type === "microblend" && m.path) {
        this.host.openMicroblend(m.path);
      } else if (m.type === "chooseMask") {
        const picked = await this.chooseMask(opened);
        if (picked) {
          mask = picked;
          void load();
        }
      } else if (m.type === "reload") {
        void load();
      }
    });

    if (doc.source && "file" in doc.source) {
      const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(path.dirname(doc.source.file)), path.basename(doc.source.file)));
      watcher.onDidChange(() => void load());
      panel.onDidDispose(() => watcher.dispose());
    }
    await load();
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

  /** `fromMaterial`: the mask set in use is the one the mesh's material names. */
  private data(w: vscode.Webview, doc: SetupDocument, o: OpenedSetup, fromMaterial: boolean): SetupPageData {
    const uri = (f: string) => w.asWebviewUri(vscode.Uri.file(f)).toString();
    const sourcePath = "gamePath" in o.source && o.source.gamePath ? o.source.gamePath : "file" in o.source ? o.source.file : "";
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
      surfaceThumbs: Object.fromEntries(
        o.info.layers.filter((l) => l.surface.found).map((l) => {
          const t = this.host.library()?.templates.find((x) => x.path === l.surface.path || x.path.toLowerCase() === l.surface.path.toLowerCase());
          return [l.surface.path, t?.thumbnail ? uri(path.join(this.host.cacheDir(), "thumbs", t.thumbnail)) : undefined];
        }),
      ),
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
button.link { background: none; border: none; color: var(--accent); padding: 0; text-decoration: underline; cursor: pointer; }
.toggle { display: inline-flex; gap: 6px; align-items: center; cursor: pointer; user-select: none; }
.warnings { border-left: 2px solid var(--warn); padding: 4px 10px; margin: 0 0 14px; color: var(--warn); }
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
td { padding: 3px 8px 3px 0; border-bottom: 1px solid var(--line); vertical-align: top; }
td:first-child { color: var(--vscode-descriptionForeground); width: 9em; }
.rawcol { display: none; }
body.raw .rawcol { display: table-cell; }
body.raw span.rawcol, body.raw p.rawcol { display: inline; }
.raw-inline { color: var(--vscode-textPreformat-foreground); font-family: var(--vscode-editor-font-family); font-size: .9em; margin-left: 8px; }
.maskthumb { width: 100%; aspect-ratio: 1; border: 1px solid var(--line); display: block; background: #000; }
.center { display: flex; align-items: center; justify-content: center; min-height: 50vh; color: var(--vscode-descriptionForeground); }
`;
