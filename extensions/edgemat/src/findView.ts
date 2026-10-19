// The Find view (design, "In VS Code"): a garment by its in-game name, or a mesh by part of its path,
// down to its materials. An item opens into its looks (one per body), each look into its meshes, each
// mesh into its materials; a multilayered material opens its setup with the mask set it names.

import * as vscode from "vscode";
import { itemMaterials, loadItems, meshMaterials, searchItems, type BridgeClient, type ItemEntry, type ItemLook, type MaterialUse, type MeshLook } from "./core";
import { gameUri, SetupEditor } from "./setupEditor";

type Node =
  | { kind: "group"; label: string; children: Node[] }
  | { kind: "item"; item: ItemEntry }
  | { kind: "look"; item: ItemEntry; look: ItemLook }
  | { kind: "meshFile"; path: string }
  | { kind: "mesh"; mesh: MeshLook; via: string; label: "file" | "appearance" }
  | { kind: "material"; use: MaterialUse; via: string }
  | { kind: "message"; text: string };

const file = (p: string) => p.split("\\").pop() ?? p;
const Limit = 200;

export class FindView implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  private roots: Node[] = [];
  private query = "";
  private readonly walks = new Map<string, Promise<ItemLook[] | string>>();

  constructor(private readonly bridge: () => Promise<BridgeClient | undefined>, private readonly cacheDir: () => string, private readonly log: (line: string) => void) {}

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
        return node.look.meshes.map((mesh): Node => ({ kind: "mesh", mesh, via, label: "file" }));
      }
      case "meshFile": {
        const bridge = await this.bridge();
        if (!bridge) return [{ kind: "message", text: "REDbridge is not available." }];
        try {
          const looks = await meshMaterials(bridge, node.path);
          return looks.map((mesh): Node => ({ kind: "mesh", mesh, via: `${file(node.path)}, ${mesh.appearance}`, label: "appearance" }));
        } catch (e) {
          return [{ kind: "message", text: e instanceof Error ? e.message : String(e) }];
        }
      }
      case "mesh":
        return node.mesh.materials.map((use): Node => ({ kind: "material", use, via: node.via }));
      default:
        return [];
    }
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
        const t = new vscode.TreeItem(file(node.path), Closed);
        t.description = node.path.slice(0, node.path.lastIndexOf("\\"));
        t.tooltip = node.path;
        t.iconPath = new vscode.ThemeIcon("symbol-structure");
        t.contextValue = "edgemat.mesh";
        return t;
      }
      case "mesh": {
        const t = new vscode.TreeItem(node.label === "file" ? file(node.mesh.mesh) : node.mesh.appearance, node.label === "file" ? vscode.TreeItemCollapsibleState.Expanded : Closed);
        const ml = node.mesh.materials.filter((m) => m.multilayered).length;
        t.description = `${node.label === "file" ? `look ${node.mesh.appearance} · ` : ""}${ml} multilayered of ${node.mesh.materials.length}`;
        t.tooltip = `${node.mesh.mesh}\nmesh appearance ${node.mesh.appearance}${node.mesh.component ? `\ncomponent ${node.mesh.component}` : ""}`;
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
          t.description = `multilayered · ${file(u.setup ?? "no setup")}`;
          t.iconPath = new vscode.ThemeIcon("layers");
          md.appendMarkdown("Multilayered. Click to open its setup with the mask set this material names.\n\n");
          md.appendCodeblock(`setup ${u.setup ?? "(none)"}\nmask  ${u.mask ?? "(none)"}${u.globalNormal ? `\nnormal ${u.globalNormal}` : ""}`, "text");
          if (u.setup) t.command = { command: "edgemat.openFoundSetup", title: "Open Setup", arguments: [u.setup, u.mask, node.via] };
          t.contextValue = "edgemat.gamePath";
        } else {
          t.description = file(u.base || "unknown material");
          t.iconPath = new vscode.ThemeIcon("circle-outline");
          md.appendMarkdown(`Not multilayered: EDGEmat edits these later (M6).${u.baseColor ? " Its color texture shows in View in 3D." : ""}\n\n`);
          if (u.baseColor) md.appendCodeblock(`color ${u.baseColor}`, "text");
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
    return n?.kind === "meshFile" ? n.path : n?.kind === "mesh" ? n.mesh.mesh : n?.kind === "material" ? n.use.setup : undefined;
  }

  /** The mesh behind a node, for View in 3D, with the look (mesh appearance) the node shows. */
  static meshOf(node: unknown): { mesh: string; appearance?: string } | undefined {
    const n = node as Node | undefined;
    return n?.kind === "meshFile" ? { mesh: n.path } : n?.kind === "mesh" ? { mesh: n.mesh.mesh, appearance: n.mesh.appearance } : undefined;
  }
}

/** Opens a setup found through Find, with the mask set its material names. */
export function openFoundSetup(setup: string, mask?: string, via?: string): Thenable<unknown> {
  return vscode.commands.executeCommand("vscode.openWith", gameUri(setup, { mask, via }), SetupEditor.viewType);
}
