// The surface page (design, "In VS Code"): an editor tab for one surface or microblend, opened from the
// Library. One tab is reused as the modder clicks around, until "Keep open" detaches it. The page shows
// the cached thumbnail at once and swaps in larger images as REDbridge makes them.

import * as vscode from "vscode";
import { describeSurface, imageFile, textureImage, thumbnailFile, type BridgeClient, type Microblend, type Template } from "./core";
import type { PageData } from "./webview/surface";

type Subject = { kind: "surface"; template: Template } | { kind: "microblend"; microblend: Microblend };

const MainSize = 512;
const TextureSize = 192;

export class SurfacePages {
  /** The reused tab; undefined after "Keep open" or when closed. */
  private reused: vscode.WebviewPanel | undefined;
  private shown = new WeakMap<vscode.WebviewPanel, number>();
  private serial = 0;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly cacheDir: () => string,
    private readonly bridge: () => Promise<BridgeClient | undefined>,
    private readonly log: (line: string) => void,
  ) {}

  async show(subject: Subject): Promise<void> {
    const title = subject.kind === "surface" ? subject.template.title : subject.microblend.name.replace(/_/g, " ");
    let panel = this.reused;
    if (panel) {
      panel.title = title;
      panel.reveal(undefined, true);
    } else {
      panel = vscode.window.createWebviewPanel("edgemat.surface", title, { viewColumn: vscode.ViewColumn.Active, preserveFocus: true }, {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "dist"), vscode.Uri.file(this.cacheDir())],
      });
      const p = panel;
      this.reused = p;
      p.onDidDispose(() => { if (this.reused === p) this.reused = undefined; });
      p.webview.onDidReceiveMessage(async (m: { type: string; text?: string }) => {
        if (m.type === "copy" && m.text) {
          await vscode.env.clipboard.writeText(m.text);
          vscode.window.setStatusBarMessage(`Copied ${m.text.length > 60 ? m.text.slice(0, 57) + "..." : m.text}`, 2500);
        } else if (m.type === "keep" && this.reused === p) {
          this.reused = undefined;
        }
      });
    }
    const id = ++this.serial;
    this.shown.set(panel, id);
    const thumb = subject.kind === "surface" ? subject.template.thumbnail : subject.microblend.thumbnail;
    panel.iconPath = thumb ? vscode.Uri.file(thumbnailFile(this.cacheDir(), thumb)) : undefined;

    // First the cached thumbnail, then the larger images.
    const p = panel;
    const render = (images: Images) => {
      if (this.shown.get(p) === id) p.webview.html = this.html(p, subject, images);
    };
    const images: Images = { image: thumb ? thumbnailFile(this.cacheDir(), thumb) : undefined, textures: {} };
    render({ ...images, note: "Making the image..." });
    try {
      const bridge = await this.bridge();
      if (!bridge) {
        render({ ...images, note: "No larger image: REDbridge is not available." });
        return;
      }
      const dir = this.cacheDir();
      const file = (name: string | undefined) => (name ? imageFile(dir, name) : undefined);
      if (subject.kind === "microblend") {
        images.image = file(await textureImage(bridge, dir, subject.microblend.path, MainSize, "alpha")) ?? images.image;
        render(images);
        return;
      }
      const t = describeSurface(subject.template).textures;
      const color = t.find((x) => x.kind === "color")!, normal = t.find((x) => x.kind === "normal")!;
      // The main image is tinted on the page, so it keeps light tones (soft contrast).
      const main = !color.isDefault && color.path ? await textureImage(bridge, dir, color.path, MainSize, "color", "soft") : undefined;
      images.image = file(main ?? (!normal.isDefault && normal.path ? await textureImage(bridge, dir, normal.path, MainSize, "relief", "soft") : undefined)) ?? images.image;
      render(images);
      for (const tex of t) {
        if (tex.isDefault || !tex.path || this.shown.get(p) !== id) continue;
        images.textures[tex.kind] = file(await textureImage(bridge, dir, tex.path, TextureSize, tex.kind === "normal" ? "relief" : "color"));
      }
      images.texturesDone = true;
      render(images);
    } catch (e) {
      this.log(`The surface page could not make an image: ${e instanceof Error ? e.message : String(e)}`);
      render({ ...images, note: "The image could not be made; see Output › EDGEmat." });
    }
  }

  private html(panel: vscode.WebviewPanel, subject: Subject, images: Images): string {
    const w = panel.webview;
    const uri = (file?: string) => (file ? w.asWebviewUri(vscode.Uri.file(file)).toString() : undefined);
    const kept = this.reused !== panel;
    const data: PageData =
      subject.kind === "surface"
        ? {
            kind: "surface",
            info: describeSurface(subject.template),
            image: uri(images.image),
            textures: Object.fromEntries(Object.entries(images.textures).map(([k, f]) => [k, uri(f)])),
            note: images.note,
            texturesDone: !!images.texturesDone,
            kept,
          }
        : { kind: "microblend", name: subject.microblend.name, path: subject.microblend.path, image: uri(images.image), note: images.note, kept };
    const nonce = [...Array(24)].map(() => Math.floor(Math.random() * 36).toString(36)).join("");
    const script = w.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "dist", "webview", "surface.js"));
    const json = JSON.stringify(data).replace(/</g, "\\u003c");
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${w.cspSource}; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style nonce="${nonce}">${Css}</style></head>
<body><script id="data" type="application/json" nonce="${nonce}">${json}</script>
<script nonce="${nonce}" src="${script}"></script></body></html>`;
  }
}

interface Images {
  image?: string;
  textures: Partial<Record<"color" | "normal" | "roughness" | "metalness", string | undefined>>;
  texturesDone?: boolean;
  note?: string;
}

// Theme colors only, so the page follows the REDnode HUD theme (and any other).
const Css = `
:root { --accent: var(--vscode-textLink-foreground); --line: var(--vscode-panel-border, rgba(128,128,128,.35)); }
body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 12px 20px 32px; margin: 0; }
header { border-bottom: 1px solid var(--line); padding-bottom: 10px; margin-bottom: 16px; }
.crumb { text-transform: uppercase; letter-spacing: .12em; font-size: 11px; color: var(--accent); }
.title-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
h1 { font-size: 1.6em; font-weight: 600; margin: 4px 0; flex: 1; text-transform: capitalize; }
h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .12em; color: var(--accent); margin: 0 0 6px; border-left: 2px solid var(--accent); padding-left: 8px; }
h2 .count { color: var(--vscode-descriptionForeground); text-transform: none; letter-spacing: 0; margin-left: 6px; font-weight: normal; }
.actions { display: flex; gap: 10px; align-items: center; }
.path { display: flex; gap: 6px; align-items: center; min-width: 0; }
.path code { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
code { font-family: var(--vscode-editor-font-family); font-size: .92em; color: var(--vscode-textPreformat-foreground); }
/* Buttons must read as buttons: a clear outline, and the accent color for actions such as Open. */
button { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 1px solid var(--vscode-button-border, var(--vscode-descriptionForeground)); border-radius: 2px; padding: 2px 8px; cursor: pointer; font: inherit; }
button:hover { background: var(--vscode-button-secondaryHoverBackground); border-color: var(--accent); }
button.copy { font-size: 11px; padding: 0 6px; }
input[type=search], input[type=text] { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, var(--line)); padding: 3px 6px; font: inherit; min-width: 0; flex: 1; }
input.bad { border-color: var(--vscode-inputValidation-errorBorder); }
input[type=color] { width: 32px; height: 26px; padding: 0; border: 1px solid var(--line); background: none; }
.toggle { display: inline-flex; gap: 6px; align-items: center; cursor: pointer; user-select: none; }
.layout { display: grid; grid-template-columns: minmax(220px, 360px) minmax(0, 1fr); gap: 24px; align-items: start; }
.layout > *, figure { min-width: 0; }
@media (max-width: 760px) { .layout { grid-template-columns: 1fr; } }
.side { position: sticky; top: 12px; display: flex; flex-direction: column; gap: 8px; }
.hero { position: relative; aspect-ratio: 1; border: 1px solid var(--line); background: #808080; overflow: hidden; }
.hero img { width: 100%; height: 100%; object-fit: cover; display: block; image-rendering: auto; }
.tint { position: absolute; inset: 0; mix-blend-mode: multiply; pointer-events: none; }
.noimage { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--vscode-descriptionForeground); background: var(--vscode-editorWidget-background); text-align: center; padding: 8px; box-sizing: border-box; }
.noimage.small { aspect-ratio: 1; height: auto; font-size: 11px; border: 1px solid var(--line); }
.note, .help { color: var(--vscode-descriptionForeground); font-size: 12px; margin: 6px 0; }
.detail { border-top: 1px solid var(--line); padding-top: 8px; }
.big-swatch { height: 48px; border: 1px solid var(--line); position: relative; }
.bright { position: absolute; right: 4px; bottom: 4px; font-size: 10px; background: rgba(0,0,0,.6); color: #fff; padding: 0 4px; }
.detail-name { font-size: 1.2em; font-weight: 600; margin: 6px 0; text-transform: capitalize; }
dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 10px; margin: 0; }
dt { color: var(--vscode-descriptionForeground); }
dd { margin: 0; display: flex; gap: 6px; align-items: center; }
.badge { font-size: 10px; text-transform: uppercase; letter-spacing: .08em; border: 1px solid var(--accent); color: var(--accent); padding: 0 4px; margin-left: 8px; vertical-align: middle; font-weight: normal; }
.main section { margin-bottom: 22px; }
.tools { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; }
.swatches { display: flex; flex-wrap: wrap; gap: 3px; }
.swatch { width: 22px; height: 22px; padding: 0; border: 1px solid rgba(128,128,128,.4); position: relative; }
.swatch:hover { outline: 1px solid var(--vscode-foreground); }
.swatch.selected { outline: 2px solid var(--accent); outline-offset: 1px; z-index: 1; }
.swatch.default::after { content: ""; position: absolute; left: 2px; top: 2px; width: 5px; height: 5px; background: var(--accent); border: 1px solid #000; }
.swatch.is-bright::before { content: "+"; position: absolute; right: 1px; bottom: -2px; font-size: 10px; color: #000; text-shadow: 0 0 2px #fff; }
table { border-collapse: collapse; width: 100%; }
td { padding: 3px 8px 3px 0; border-bottom: 1px solid var(--line); vertical-align: top; }
td.rawcol { width: 8em; white-space: nowrap; }
td.rawcol + td.rawcol { width: 13em; }
.rawcol { display: none; }
body.raw td.rawcol { display: table-cell; }
body.raw p.rawcol { display: block; }
.textures { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
figure { margin: 0; }
figure img { width: 100%; aspect-ratio: 1; object-fit: cover; border: 1px solid var(--line); display: block; }
figcaption { font-size: 12px; margin-top: 4px; }
figcaption .path code { font-size: 10px; }
`;
