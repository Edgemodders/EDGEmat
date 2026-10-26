// The Find view (design, "In VS Code"): a garment by its in-game name, or a mesh by part of its path,
// down to its materials. An item opens into its looks (one per body), each look into its meshes, each
// mesh into its materials; a multilayered material opens its setup with the mask set it names. The Desk
// view (deskView.ts) shows its meshes the same way.

import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { deskLabel, deskProjectName, itemMaterials, itemsWearing, loadItems, meshMaterials, searchItems, type BridgeClient, type Desk, type DeskEntry, type ItemEntry, type ItemLook, type MaterialTarget, type MaterialUse, type MeshLook, type WornBy } from "./core";
import { gameUri, optionsQuery, SetupEditor } from "./setupEditor";

export type Node =
  | { kind: "group"; label: string; children: Node[] }
  | { kind: "item"; item: ItemEntry }
  | { kind: "look"; item: ItemEntry; look: ItemLook }
  // On the Desk: `entry` is its line in desk.json; `root` the project's source\archive when the mesh is a
  // project file (its copies are read first); `appearance` the look to open. `open` is a fresh number each
  // time a mesh is put on the Desk, for fresh tree ids, so VS Code opens it instead of keeping an earlier state.
  | { kind: "meshFile"; path: string; root?: string; appearance?: string; open?: number; entry?: DeskEntry }
  | { kind: "setupFile"; entry: DeskEntry }
  // `desk`: the id of the Desk entry a mesh or material is under; its setups open and save in that entry.
  // `worn`: how many of the game's items wear this look, once known (a mesh file's looks only).
  | { kind: "mesh"; mesh: MeshLook; via: string; label: "file" | "appearance"; looks?: ItemLook[]; open?: number; root?: string; desk?: string; worn?: number }
  | { kind: "material"; use: MaterialUse; via: string; mesh: string; look: string; targets: MaterialTarget[]; root?: string; desk?: string }
  | { kind: "message"; text: string };

const file = (p: string) => p.split("\\").pop() ?? p;
/** Where a project file on the Desk comes from: its project by name, or that the project is gone. */
const fromProject = (root: string) => `from ${deskProjectName(root)}${fs.existsSync(root) ? "" : ", not found"}`;
const Limit = 200;

export class FindView implements vscode.TreeDataProvider<Node> {
  protected readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  protected roots: Node[] = [];
  private query = "";
  private readonly walks = new Map<string, Promise<ItemLook[] | string>>();

  /** `desk`: the Desk, whose edited setups are marked and open from it (the Desk view). */
  constructor(protected readonly bridge: () => Promise<BridgeClient | undefined>, private readonly cacheDir: () => string, private readonly log: (line: string) => void, protected readonly desk?: Desk) {}

  get summary(): string {
    if (!this.query) return "";
    const n = (k: string) => (this.roots.find((r) => r.kind === "group" && r.label.startsWith(k)) as { children: Node[] } | undefined)?.children.length ?? 0;
    return `"${this.query}": ${n("Items")} items, ${n("Meshes")} meshes`;
  }

  /** Searches items by name and meshes by path. The first search reads the item list from TweakDB (a few seconds, once per game version). */
  async search(query: string): Promise<void> {
    this.query = query.trim();
    const bridge = await this.bridge();
    if (!bridge) {
      this.roots = [{ kind: "message", text: "Finding needs REDbridge: set the game folder first." }];
      this.changed.fire();
      return;
    }
    const items = searchItems(await loadItems(bridge, this.cacheDir()), this.query);
    const words = this.query.toLowerCase().replace(/[.]/g, " ").split(/\s+/).filter(Boolean);
    const longest = [...words].sort((a, b) => b.length - a.length)[0] ?? "";
    const meshes = longest
      ? (await bridge.search(longest, 20000)).items
          .map((i) => i.name)
          .filter((n) => n.toLowerCase().endsWith(".mesh") && !/\\shadow_meshes\\|_shadow\.mesh$/i.test(n) && words.every((w) => n.toLowerCase().includes(w)))
      : [];
    const group = (label: string, total: number, children: Node[]): Node => ({ kind: "group", label: total > children.length ? `${label} (first ${children.length} of ${total})` : label, children });
    this.roots = [
      ...(items.length ? [group("Items", items.length, items.slice(0, Limit).map((item): Node => ({ kind: "item", item })))] : []),
      ...(meshes.length ? [group("Meshes", meshes.length, meshes.slice(0, Limit).map((path): Node => ({ kind: "meshFile", path })))] : []),
    ];
    if (!this.roots.length) this.roots = [{ kind: "message", text: `Nothing matches "${this.query}". Try an in-game name (punk jeans) or part of a mesh path (s1_055).` }];
    this.changed.fire();
  }

  clear(): void {
    this.query = "";
    this.roots = [];
    this.changed.fire();
  }

  private walk(item: ItemEntry): Promise<ItemLook[] | string> {
    if (!this.walks.has(item.id)) {
      this.walks.set(item.id, (async () => {
        const bridge = await this.bridge();
        if (!bridge) return "REDbridge is not available.";
        try {
          const m = await itemMaterials(bridge, item);
          for (const w of m.warnings) this.log(`Find ${item.id}: ${w}`);
          return m.looks;
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          this.log(`Find ${item.id}: ${message}`);
          this.walks.delete(item.id);
          return message;
        }
      })());
    }
    return this.walks.get(item.id)!;
  }

  async getChildren(node?: Node): Promise<Node[]> {
    if (!node) return this.roots;
    switch (node.kind) {
      case "group":
        return node.children;
      case "item": {
        const looks = await this.walk(node.item);
        if (typeof looks === "string") return [{ kind: "message", text: looks }];
        return looks.length ? looks.map((look): Node => ({ kind: "look", item: node.item, look })) : [{ kind: "message", text: "No looks found for this item." }];
      }
      case "look": {
        const via = `${node.item.name ?? node.item.id}, ${node.look.body}`;
        const looks = await this.walk(node.item);
        return node.look.meshes.map((mesh): Node => ({ kind: "mesh", mesh, via, label: "file", looks: typeof looks === "string" ? undefined : looks }));
      }
      case "meshFile": {
        const bridge = await this.bridge();
        if (!bridge) return [{ kind: "message", text: "REDbridge is not available." }];
        try {
          const looks = await meshMaterials(bridge, node.path, undefined, node.root);
          const worn = await this.wornLooks(bridge, node.path);
          // Just put on the Desk: the look asked for opens, else the first an item wears, else the first.
          const want = node.open ? (node.appearance ?? (looks.find((l) => worn?.get(l.appearance.toLowerCase())) ?? looks[0])?.appearance)?.toLowerCase() : undefined;
          return looks.map((mesh): Node => ({
            kind: "mesh", mesh, via: `${file(node.path)}, ${mesh.appearance}`, label: "appearance", open: want && mesh.appearance.toLowerCase() === want ? node.open : undefined,
            root: node.root, desk: node.entry?.id, worn: worn ? worn.get(mesh.appearance.toLowerCase()) ?? 0 : undefined,
          }));
        } catch (e) {
          return [{ kind: "message", text: e instanceof Error ? e.message : String(e) }];
        }
      }
      case "mesh":
        return node.mesh.materials.map((use): Node => {
          // The same material on every body's mesh of the item, so a new material goes on all of them.
          const targets: MaterialTarget[] = [];
          for (const look of node.looks ?? []) for (const m of look.meshes) if (m.materials.some((x) => x.name === use.name) && !targets.some((t) => t.mesh === m.mesh)) targets.push({ mesh: m.mesh, material: use.name });
          if (!targets.some((t) => t.mesh === node.mesh.mesh)) targets.unshift({ mesh: node.mesh.mesh, material: use.name });
          return { kind: "material", use, via: node.via, mesh: node.mesh.mesh, look: node.mesh.appearance, targets, root: node.root, desk: node.desk };
        });
      default:
        return [];
    }
  }

  /** On hover: a mesh look's tooltip gains the game's items that wear it, with their TweakDB ids. */
  async resolveTreeItem(item: vscode.TreeItem, node: Node): Promise<vscode.TreeItem> {
    if (node.kind !== "mesh" || typeof item.tooltip !== "string") return item;
    const worn = await this.wornBy(node.mesh.mesh, node.mesh.appearance).catch(() => undefined);
    if (!worn) return item;
    const lines = worn.map((w) => `${w.name ?? "(no in-game name)"}: ${w.id}${w.body === "any" ? "" : ` (${w.body})`}`);
    const said = worn.length ? ["Worn in the game by:", ...lines, "Right-click › Copy CET Command gives V one."] : ["No clothing item in the game wears this look."];
    item.tooltip = [item.tooltip, "", ...said].join("\n");
    return item;
  }

  /**
   * How many of the game's items wear each look of a mesh, by lowercase look name. The first time builds
   * the index (about ten seconds): the looks show without it, and again with it once it is built.
   */
  private async wornLooks(bridge: BridgeClient, mesh: string): Promise<Map<string, number> | undefined> {
    const all = itemsWearing(bridge, this.cacheDir(), mesh).then((looks) => new Map(looks.map((l) => [l.appearance.toLowerCase(), new Set(l.items.map((w) => w.id)).size])));
    const quick = await Promise.race([all.catch(() => undefined), new Promise<undefined>((r) => setTimeout(() => r(undefined), 1500))]);
    if (!quick) void all.then(() => this.changed.fire(), () => undefined);
    return quick;
  }

  /** The game's items that wear a mesh look; every look of the mesh when `appearance` is not given. */
  async wornBy(mesh: string, appearance?: string): Promise<WornBy[]> {
    const bridge = await this.bridge();
    if (!bridge) return [];
    const looks = await itemsWearing(bridge, this.cacheDir(), mesh, appearance);
    return looks.flatMap((l) => l.items).filter((w, i, all) => all.findIndex((x) => x.id === w.id && x.body === w.body) === i);
  }

  getTreeItem(node: Node): vscode.TreeItem {
    const None = vscode.TreeItemCollapsibleState.None, Closed = vscode.TreeItemCollapsibleState.Collapsed;
    switch (node.kind) {
      case "group": {
        const t = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Expanded);
        t.iconPath = new vscode.ThemeIcon(node.label.startsWith("Items") ? "tag" : "symbol-structure");
        t.description = String(node.children.length);
        return t;
      }
      case "item": {
        const t = new vscode.TreeItem(node.item.name ?? node.item.id, Closed);
        t.description = `${node.item.slot} · ${node.item.id}`;
        t.tooltip = `${node.item.name ?? "(no in-game name)"}\n${node.item.id}\nSlot: ${node.item.slot}\nEntity: ${node.item.entityName}, appearance ${node.item.appearanceName}`;
        t.iconPath = new vscode.ThemeIcon("tag");
        t.contextValue = "edgemat.item";
        return t;
      }
      case "look": {
        const t = new vscode.TreeItem(`${node.look.body[0].toUpperCase()}${node.look.body.slice(1)} body`, vscode.TreeItemCollapsibleState.Expanded);
        t.description = `${file(node.look.app)} › ${node.look.appAppearance}`;
        t.tooltip = `${node.look.app}\nappearance ${node.look.appAppearance}`;
        t.iconPath = new vscode.ThemeIcon("person");
        return t;
      }
      case "meshFile": {
        const e = node.entry;
        const t = new vscode.TreeItem(e ? deskLabel(e) : file(node.path), node.open ? vscode.TreeItemCollapsibleState.Expanded : Closed);
        const folder = node.path.slice(0, node.path.lastIndexOf("\\"));
        const edits = e && this.desk ? this.desk.edited(e).length : 0;
        t.description = e ? [edits ? "edited on the Desk" : "", e.root ? fromProject(e.root) : folder].filter(Boolean).join(" · ") : node.root ? "the project's copy" : folder;
        t.tooltip = `${node.path}${node.root ? `\n${e ? "A file of the project" : "The project's copy, in"} ${node.root}` : ""}${edits ? `\n${edits} setup${edits === 1 ? "" : "s"} edited on this Desk entry: + puts them in a project.` : ""}`;
        if (e) t.id = `desk:${e.id}:${node.open ?? 0}`;
        else if (node.open) t.id = `open${node.open}:${node.root ?? ""}:${node.path}`;
        t.iconPath = new vscode.ThemeIcon("symbol-structure");
        t.contextValue = node.entry ? "edgemat.mesh edgemat.deskEntry" : "edgemat.mesh";
        return t;
      }
      case "setupFile": {
        const e = node.entry;
        const edited = !e.root && !!this.desk?.copyOf(e, e.path);
        const t = new vscode.TreeItem(deskLabel(e), None);
        t.description = e.root ? fromProject(e.root) : edited ? "edited on the Desk" : "as in the game";
        t.tooltip = `${e.path}${e.root ? `\nA file of the project ${e.root}` : edited ? "\nEdited on the Desk: + puts it in a project." : ""}`;
        t.id = `desk:${e.id}`;
        t.iconPath = new vscode.ThemeIcon("layers");
        t.command = { command: "edgemat.openFoundSetup", title: "Open Setup", arguments: [e.path, undefined, "the Desk", e.root, e.id] };
        t.contextValue = "edgemat.gamePath edgemat.deskEntry";
        return t;
      }
      case "mesh": {
        const t = new vscode.TreeItem(node.label === "file" ? file(node.mesh.mesh) : node.mesh.appearance, node.label === "file" || node.open ? vscode.TreeItemCollapsibleState.Expanded : Closed);
        const ml = node.mesh.materials.filter((m) => m.multilayered).length;
        const worn = node.worn === undefined ? "" : node.worn ? `worn by ${node.worn} item${node.worn > 1 ? "s" : ""} · ` : "no item · ";
        t.description = `${node.label === "file" ? `look ${node.mesh.appearance} · ` : worn}${ml} multilayered of ${node.mesh.materials.length}`;
        t.tooltip = `${node.mesh.mesh}\nmesh appearance ${node.mesh.appearance}${node.mesh.component ? `\ncomponent ${node.mesh.component}` : ""}`;
        if (node.open) t.id = `open${node.open}:${node.mesh.mesh}:${node.mesh.appearance}`;
        t.iconPath = new vscode.ThemeIcon(node.label === "file" ? "symbol-structure" : "symbol-color");
        t.contextValue = "edgemat.mesh";
        return t;
      }
      case "material": {
        const u = node.use;
        const t = new vscode.TreeItem(u.name, None);
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**${u.name}**${u.chunks > 1 ? ` (${u.chunks} chunks across LODs)` : ""}\n\n`);
        if (u.multilayered) {
          const edited = !!node.desk && !!u.setup && !(node.root && fs.existsSync(path.join(node.root, u.setup))) && !!this.desk?.copyOf({ id: node.desk }, u.setup);
          t.description = `${edited ? "edited on the Desk · " : ""}multilayered · ${file(u.setup ?? "no setup")}`;
          t.iconPath = new vscode.ThemeIcon("layers");
          md.appendMarkdown(`Multilayered. Click to open its setup with the mask set this material names.${node.desk ? " Ctrl+S in the setup editor saves it on the Desk." : ""}\n\n`);
          md.appendCodeblock(`setup ${u.setup ?? "(none)"}\nmask  ${u.mask ?? "(none)"}${u.globalNormal ? `\nnormal ${u.globalNormal}` : ""}`, "text");
          if (u.setup) t.command = { command: "edgemat.openFoundSetup", title: "Open Setup", arguments: [u.setup, u.mask, node.via, node.root, node.desk, node.mesh, node.look] };
          t.contextValue = "edgemat.gamePath edgemat.material";
        } else {
          t.description = file(u.base || "unknown material");
          t.iconPath = new vscode.ThemeIcon("circle-outline");
          md.appendMarkdown(`Not multilayered: EDGEmat edits these later (M6).${u.baseColor ? " Its color texture shows in View in 3D." : ""}\n\n`);
          if (u.baseColor) md.appendCodeblock(`color ${u.baseColor}`, "text");
          t.contextValue = "edgemat.material";
        }
        if (u.base) md.appendCodeblock(`base ${u.base}${u.instances.length ? `\nvia  ${u.instances.join("\n     ")}` : ""}`, "text");
        t.tooltip = md;
        return t;
      }
      case "message": {
        const t = new vscode.TreeItem(node.text, None);
        t.iconPath = new vscode.ThemeIcon("info");
        return t;
      }
    }
  }

  /** The game path behind a node, for Copy Game Path: a mesh, or a material's setup. */
  static gamePathOf(node: unknown): string | undefined {
    const n = node as Node | undefined;
    return n?.kind === "meshFile" ? n.path : n?.kind === "setupFile" ? n.entry.path : n?.kind === "mesh" ? n.mesh.mesh : n?.kind === "material" ? n.use.setup : undefined;
  }

  /** The mesh materials a new material goes on, from a material node: the same material on each body's mesh. */
  static targetsOf(node: unknown): { targets: MaterialTarget[]; label: string } | undefined {
    const n = node as Node | undefined;
    if (n?.kind !== "material") return undefined;
    return { targets: n.targets, label: `${n.use.name} · ${n.via}` };
  }

  /** The mesh behind a node, for View in 3D, with the look (mesh appearance) the node shows; the project's copy when Find read that. */
  static meshOf(node: unknown): { mesh: string; appearance?: string } | undefined {
    const n = node as Node | undefined;
    const at = (p: string, root?: string) => (root ? path.join(root, p) : p);
    return n?.kind === "meshFile" ? { mesh: at(n.path, n.root), appearance: n.appearance } : n?.kind === "mesh" ? { mesh: at(n.mesh.mesh, n.root), appearance: n.mesh.appearance } : undefined;
  }

  /** For Copy CET Command: an item's own id, or the mesh look (or whole mesh) whose items to offer. */
  static wornOf(node: unknown): { item: ItemEntry } | { mesh: string; appearance?: string } | undefined {
    const n = node as Node | undefined;
    return n?.kind === "item" ? { item: n.item } : n?.kind === "meshFile" ? { mesh: n.path } : n?.kind === "mesh" ? { mesh: n.mesh.mesh, appearance: n.mesh.appearance } : n?.kind === "material" ? { mesh: n.mesh, appearance: n.look } : undefined;
  }

  /** The Desk entry a mesh node is under, by id: its 3D view then opens the entry's copy, with the entry's edits. */
  static deskOf(node: unknown): string | undefined {
    const n = node as Node | undefined;
    return n?.kind === "meshFile" ? n.entry?.id : n?.kind === "mesh" ? n.desk : undefined;
  }
}

/**
 * Opens a setup found through Find or on the Desk, with the mask set its material names: the project's copy
 * when a project mesh's `root` holds one, else the game's (from the Desk, `desk`: its Desk copy once edited).
 */
export function openFoundSetup(setup: string, mask?: string, via?: string, root?: string, desk?: string, mesh?: string, look?: string): Thenable<unknown> {
  const local = root ? path.join(root, setup) : undefined;
  const uri = local && fs.existsSync(local) ? vscode.Uri.file(local).with({ query: optionsQuery({ mask, via, mesh, look }) }) : gameUri(setup, { mask, via, desk, mesh, look });
  return vscode.commands.executeCommand("vscode.openWith", uri, SetupEditor.viewType);
}
