// The New Material page (design, "Generate a material", "The UI"): a material from words through an AI
// image service the modder chose (their key, their credits), or from their own image. Each Generate adds
// a take; the chosen one is made seamless, its bumps and shine derived, and it is written into a project
// and put on the mesh materials the page was opened for. The key never reaches the page: the page asks,
// the extension calls the service. Nothing is sent until the modder presses Generate or lists models.
// The keys are the EDGE tools' shared ones (REDnode #23): set once here or in any EDGE tool, used by all.

import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import {
  checkKey, generateImage, hasKey, imageAsPng, listModels, sharedKeys, makeMaterial, makeSeamless, materialSlug, readPng, resize, squareCrop, writePng, Services,
  type BridgeClient, type DetailSize, type MadeBy, type MaterialTarget, type Project, type Quality, type ServiceId, type Shine,
} from "./core";

export interface MaterialPageHost {
  extensionUri: vscode.Uri;
  bridge(): Promise<BridgeClient | undefined>;
  project(): Promise<Project | undefined>;
  packAndTry(project: Project): (() => Promise<unknown>) | undefined;
  /** Tells 3D views (REDcode's, through EDGEmat's API) that materials changed, so they draw them again. */
  materialsChanged(): void;
  log(line: string): void;
}

/** What the page starts with. */
export interface MaterialPageData {
  target?: { label: string; targets: MaterialTarget[] };
  service: ServiceId;
  models: Partial<Record<ServiceId, { id: string; name: string }[]>>;
  model: Partial<Record<ServiceId, string>>;
  quality: Quality;
  services: { id: ServiceId; name: string; hasKey: boolean }[];
}

export type MaterialRequest =
  | { op: "models"; service: ServiceId }
  | { op: "generate"; service: ServiceId; model: string; prompt: string; words: string; detail: DetailSize; quality: Quality }
  | { op: "fromFile" }
  | { op: "cancel" }
  | { op: "setKey"; service: ServiceId }
  | { op: "add"; take: string; name: string; repeat: number; bumps: number; shine: Shine; metal: boolean };

export interface Take {
  take: string;
  /** The image as made, and the same made seamless, as data URIs for the page. */
  image: string;
  seamless: string;
  about: string;
  name: string;
}

/** Where EDGEmat 0.3 kept a key, before the shared store: moved once by moveOldKeys. */
const KeySecret = (s: ServiceId) => `edgemat.${s}.apiKey`;
const Tool = "EDGEmat";
const MaxTakes = 20;
const PreviewSize = 512;

export class MaterialPage {
  private panel: vscode.WebviewPanel | undefined;
  private target: MaterialPageData["target"];
  private readonly takes = new Map<string, { png: Buffer; made: MadeBy; name: string }>();
  private nextTake = 1;
  private running: AbortController | undefined;

  constructor(private readonly context: vscode.ExtensionContext, private readonly host: MaterialPageHost) {}

  /** Opens the page, for the mesh materials given (from Find) or for none. */
  open(target?: MaterialPageData["target"]): void {
    this.target = target;
    const title = target ? `New Material: ${target.targets[0]?.material ?? ""}` : "New Material";
    if (this.panel) {
      this.panel.title = title;
      this.panel.reveal();
      void this.panel.webview.postMessage({ type: "target", target });
      return;
    }
    const panel = vscode.window.createWebviewPanel("edgemat.material", title, vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(this.host.extensionUri, "dist")],
    });
    this.panel = panel;
    panel.iconPath = vscode.Uri.joinPath(this.host.extensionUri, "images", "icon.png");
    panel.onDidDispose(() => {
      this.running?.abort();
      if (this.panel === panel) this.panel = undefined;
    });
    panel.webview.onDidReceiveMessage(async (m: { type: string; id: number; req: MaterialRequest }) => {
      if (m.type !== "op") return;
      try {
        const result = await this.handle(m.req);
        void panel.webview.postMessage({ type: "result", id: m.id, ok: true, result });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        this.host.log(`New Material, ${m.req.op}: ${message}`);
        void panel.webview.postMessage({ type: "result", id: m.id, ok: false, error: message });
      }
    });
    void this.data().then((data) => (panel.webview.html = this.html(panel, data)));
  }

  private async data(): Promise<MaterialPageData> {
    const g = this.context.globalState;
    const services = await Promise.all((Object.keys(Services) as ServiceId[]).map(async (id) => ({ id, name: Services[id].name, hasKey: hasKey(id) })));
    return {
      target: this.target,
      service: g.get<ServiceId>("edgemat.generate.service") ?? "gemini",
      models: g.get("edgemat.generate.models") ?? {},
      model: g.get("edgemat.generate.model") ?? {},
      quality: g.get<Quality>("edgemat.generate.quality") ?? "medium",
      services,
    };
  }

  /** The service's key: from the shared store, else asked for once in a password box. */
  async key(service: ServiceId, ask = true): Promise<string | undefined> {
    const k = await sharedKeys.getKey(service, { tool: Tool });
    if (k || !ask) return k;
    return this.setKey(service);
  }

  async setKey(service?: ServiceId): Promise<string | undefined> {
    const s = service ?? (await pickService("Set the API key for"));
    if (!s) return undefined;
    const info = Services[s];
    const k = await vscode.window.showInputBox({
      title: `EDGEmat: ${info.name} API key`,
      prompt: `For Generate. Kept encrypted for your Windows account in the EDGE tools' shared key store, so every EDGE tool that needs it uses it too, and sent only to ${info.name}. Make one at ${info.keyFrom}.`,
      password: true,
      ignoreFocusOut: true,
      validateInput: (v) => (v.trim() ? checkKey(s, v) : null),
    });
    if (!k?.trim()) return undefined;
    await sharedKeys.setKey(s, k.trim());
    return k.trim();
  }

  async clearKey(): Promise<void> {
    const s = await pickService("Clear the API key for");
    if (!s) return;
    const go = await vscode.window.showWarningMessage(`Clear the ${Services[s].name} API key?`, { modal: true, detail: "It is the EDGE tools' shared key: every EDGE tool that uses it asks for it again." }, "Clear It");
    if (!go) return;
    await sharedKeys.removeKey(s);
    void vscode.window.showInformationMessage(`EDGEmat: the ${Services[s].name} API key is cleared.`);
  }

  private async handle(req: MaterialRequest): Promise<unknown> {
    const g = this.context.globalState;
    switch (req.op) {
      case "setKey":
        return { hasKey: !!(await this.setKey(req.service)) };
      case "cancel":
        this.running?.abort();
        return {};
      case "models": {
        const key = await this.key(req.service);
        if (!key) throw new Error(`No ${Services[req.service].name} API key. EDGEmat: Set Image Service Key adds one.`);
        const models = await listModels(req.service, { key, timeoutMs: 30_000 });
        await g.update("edgemat.generate.models", { ...g.get("edgemat.generate.models"), [req.service]: models });
        if (!models.length) throw new Error(`${Services[req.service].name} lists no image models for this key.`);
        return { models };
      }
      case "generate": {
        if (!req.prompt.trim()) throw new Error("Describe the material first.");
        const key = await this.key(req.service);
        if (!key) throw new Error(`No ${Services[req.service].name} API key. EDGEmat: Set Image Service Key adds one.`);
        let model = req.model;
        let models: { id: string; name: string }[] | undefined;
        if (!model) {
          models = await listModels(req.service, { key, timeoutMs: 30_000 });
          await g.update("edgemat.generate.models", { ...g.get("edgemat.generate.models"), [req.service]: models });
          model = models[0]?.id;
          if (!model) throw new Error(`${Services[req.service].name} lists no image models for this key.`);
        }
        await g.update("edgemat.generate.service", req.service);
        await g.update("edgemat.generate.model", { ...g.get("edgemat.generate.model"), [req.service]: model });
        await g.update("edgemat.generate.quality", req.quality);
        const running = (this.running = new AbortController());
        const started = Date.now();
        const img = await Promise.resolve(
          vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `EDGEmat: generating with ${Services[req.service].name} (${model})...`, cancellable: true }, (_, token) => {
            token.onCancellationRequested(() => running.abort());
            return generateImage(req.service, model, req.prompt, { key, signal: running.signal, quality: req.quality });
          }),
        ).finally(() => {
            if (this.running === running) this.running = undefined;
          });
        this.host.log(`New Material: ${Services[req.service].name} ${model} made an image in ${((Date.now() - started) / 1000).toFixed(1)} s`);
        const bridge = await this.host.bridge();
        const png = bridge ? await imageAsPng(bridge, img.bytes, img.mime.includes("jpeg") ? ".jpg" : img.mime.includes("webp") ? ".webp" : ".png") : img.bytes;
        return { ...this.addTake(png, { service: Services[req.service].name, model, prompt: req.prompt, words: req.words }, req.words, `${Services[req.service].name} · ${model}`), models, model };
      }
      case "fromFile": {
        const picked = await vscode.window.showOpenDialog({ canSelectMany: false, title: "An image for the material", openLabel: "Use This Image", filters: { Images: ["png", "jpg", "jpeg", "tga", "dds", "bmp", "tif", "tiff"] } });
        const file = picked?.[0]?.fsPath;
        if (!file) return { cancelled: true };
        const bridge = await this.host.bridge();
        const bytes = fs.readFileSync(file);
        const png = bridge ? await imageAsPng(bridge, bytes, path.extname(file)) : bytes;
        const words = path.basename(file, path.extname(file)).replace(/[_-]+/g, " ");
        return this.addTake(png, { file }, words, path.basename(file));
      }
      case "add":
        return this.add(req);
    }
  }

  private addTake(png: Buffer, made: MadeBy, name: string, about: string): Take {
    const img = squareCrop(readPng(png));
    const small = resize(img, PreviewSize, PreviewSize);
    const take = `take${this.nextTake++}`;
    this.takes.set(take, { png, made, name });
    while (this.takes.size > MaxTakes) this.takes.delete(this.takes.keys().next().value!);
    const uri = (b: Buffer) => `data:image/png;base64,${b.toString("base64")}`;
    return { take, image: uri(writePng(small)), seamless: uri(writePng(makeSeamless(small))), about, name };
  }

  private async add(req: Extract<MaterialRequest, { op: "add" }>): Promise<unknown> {
    const t = this.takes.get(req.take);
    if (!t) throw new Error("That take is gone: generate it again.");
    const bridge = await this.host.bridge();
    if (!bridge) throw new Error("EDGEmat needs the game folder and REDbridge to write the material.");
    const project = await this.host.project();
    if (!project) return { cancelled: true };
    const targets = this.target?.targets ?? [];
    const started = Date.now();
    const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `EDGEmat: writing ${materialSlug(req.name)} into ${project.name}...` }, () =>
      makeMaterial(bridge, project.archive, { name: req.name, image: t.png, repeat: req.repeat, bumps: req.bumps, shine: req.shine, metal: req.metal, made: t.made }, targets),
    );
    this.host.log(`New Material: ${result.written.length} files into ${project.name} in ${((Date.now() - started) / 1000).toFixed(1)} s`);
    for (const f of result.written) this.host.log(`  ${f}`);
    for (const a of result.applied) this.host.log(`  ${a.mesh} › ${a.material}: ${a.mi} (${a.how})`);
    const where = result.applied.length ? ` and put on ${result.applied.length} mesh material${result.applied.length === 1 ? "" : "s"}` : "";
    if (result.applied.length) this.host.materialsChanged();
    const pack = this.host.packAndTry(project);
    const actions = [...(pack ? ["Pack and Try"] : []), "Show Files"];
    void vscode.window.showInformationMessage(`Saved ${materialSlug(req.name)} into ${project.name}${where}.`, ...actions).then(async (pick) => {
      if (pick === "Pack and Try") await pack?.();
      else if (pick === "Show Files") await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(path.join(project.archive, result.mi)));
    });
    return { folder: result.folder, mi: result.mi, applied: result.applied, written: result.written.length, project: project.name };
  }

  private html(panel: vscode.WebviewPanel, data: MaterialPageData): string {
    const w = panel.webview;
    const nonce = [...Array(24)].map(() => Math.floor(Math.random() * 36).toString(36)).join("");
    const script = w.asWebviewUri(vscode.Uri.joinPath(this.host.extensionUri, "dist", "webview", "material.js"));
    const json = JSON.stringify(data).replace(/</g, "\\u003c");
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${w.cspSource} data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style nonce="${nonce}">${Css}</style></head>
<body><script id="data" type="application/json" nonce="${nonce}">${json}</script>
<script nonce="${nonce}" src="${script}"></script></body></html>`;
  }
}

/**
 * Moves keys EDGEmat 0.3 kept in VS Code's secret storage into the shared store, once: a key already in
 * the store wins, and the old copy is deleted either way.
 */
export async function moveOldKeys(context: vscode.ExtensionContext, log: (line: string) => void): Promise<void> {
  const moved: string[] = [];
  for (const id of Object.keys(Services) as ServiceId[]) {
    try {
      const old = await context.secrets.get(KeySecret(id));
      if (!old) continue;
      if (!hasKey(id)) {
        await sharedKeys.setKey(id, old);
        moved.push(Services[id].name);
      }
      await context.secrets.delete(KeySecret(id));
    } catch (e) {
      log(`Keys: could not move the ${Services[id].name} key to the shared store: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (moved.length) {
    log(`Keys: moved the ${moved.join(" and ")} key to the shared store`);
    void vscode.window.showInformationMessage(`EDGEmat: your ${moved.join(" and ")} key is now in the EDGE tools' shared key store, so EDGEmat's assistant tools and other EDGE tools use it too.`);
  }
}

async function pickService(title: string): Promise<ServiceId | undefined> {
  const pick = await vscode.window.showQuickPick(
    (Object.keys(Services) as ServiceId[]).map((id) => ({ label: Services[id].name, id })),
    { title: `EDGEmat: ${title}...` },
  );
  return pick?.id;
}

// Theme colors only, so the page follows the REDnode HUD theme (and any other).
const Css = `
:root { --accent: var(--vscode-textLink-foreground); --line: var(--vscode-panel-border, rgba(128,128,128,.35)); }
body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 12px 20px 32px; margin: 0; }
header { border-bottom: 1px solid var(--line); padding-bottom: 10px; margin-bottom: 16px; }
.crumb { text-transform: uppercase; letter-spacing: .12em; font-size: 11px; color: var(--accent); }
h1 { font-size: 1.6em; font-weight: 600; margin: 4px 0; }
h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .12em; color: var(--accent); margin: 0 0 8px; border-left: 2px solid var(--accent); padding-left: 8px; }
section { margin-bottom: 22px; max-width: 980px; }
.help, .note { color: var(--vscode-descriptionForeground); font-size: 12px; margin: 6px 0; }
.target { border: 1px solid var(--accent); padding: 6px 10px; display: inline-block; }
button { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 1px solid var(--vscode-button-border, var(--vscode-descriptionForeground)); border-radius: 2px; padding: 3px 10px; cursor: pointer; font: inherit; }
button:hover { background: var(--vscode-button-secondaryHoverBackground); border-color: var(--accent); }
button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: var(--vscode-button-background); }
button.primary:hover { background: var(--vscode-button-hoverBackground); }
button:disabled { opacity: .5; cursor: default; }
textarea, input[type=text], input[type=number], select { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, var(--line)); padding: 4px 6px; font: inherit; box-sizing: border-box; }
select { background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground); border-color: var(--vscode-dropdown-border, var(--line)); }
textarea { width: 100%; resize: vertical; }
.row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin: 8px 0; }
.row label { display: inline-flex; gap: 6px; align-items: center; }
.tabs { display: flex; gap: 0; margin-bottom: 10px; }
.tabs button { border-radius: 0; }
.tabs button.on { border-color: var(--accent); color: var(--accent); }
details summary { cursor: pointer; color: var(--vscode-descriptionForeground); font-size: 12px; }
.status { min-height: 1.4em; color: var(--accent); }
.status.error { color: var(--vscode-errorForeground); }
.takes { display: grid; grid-template-columns: repeat(auto-fill, minmax(128px, 1fr)); gap: 10px; }
.take { border: 1px solid var(--line); padding: 4px; cursor: pointer; background: none; text-align: left; color: inherit; }
.take img { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; }
.take span { display: block; font-size: 11px; color: var(--vscode-descriptionForeground); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 3px; }
.take.on { border-color: var(--accent); outline: 1px solid var(--accent); }
.chosen { display: grid; grid-template-columns: minmax(220px, 420px) minmax(0, 1fr); gap: 20px; align-items: start; }
@media (max-width: 760px) { .chosen { grid-template-columns: 1fr; } }
.tiled { aspect-ratio: 1; border: 1px solid var(--line); background-size: 33.333% 33.333%; background-repeat: repeat; image-rendering: auto; }
dl { display: grid; grid-template-columns: auto 1fr; gap: 8px 12px; margin: 0; align-items: center; }
dt { color: var(--vscode-descriptionForeground); }
dd { margin: 0; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.done { border-left: 2px solid var(--accent); padding-left: 10px; }
code { font-family: var(--vscode-editor-font-family); font-size: .92em; color: var(--vscode-textPreformat-foreground); }
`;
