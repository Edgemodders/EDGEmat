// The Library view in EDGEmat's activity bar container: the surfaces (templates) by category and the
// microblends, each with a thumbnail from the game, filtered by plain words.

import * as vscode from "vscode";
import { byCategory, searchMicroblends, searchTemplates, thumbnailFile, type Library, type Microblend, type Template } from "./core";

type Node =
  | { kind: "surfaces"; templates: Template[] }
  | { kind: "category"; name: string; templates: Template[] }
  | { kind: "template"; template: Template }
  | { kind: "microblends"; microblends: Microblend[] }
  | { kind: "microblend"; microblend: Microblend };

const plural = (n: number, one: string, many = one + "s") => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export class LibraryView implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  private library: Library | undefined;
  private cacheDir = "";
  private filter = "";

  set(library: Library | undefined, cacheDir: string): void {
    this.library = library;
    this.cacheDir = cacheDir;
    this.changed.fire();
  }

  get current(): Library | undefined {
    return this.library;
  }

  get query(): string {
    return this.filter;
  }

  setFilter(query: string): void {
    this.filter = query.trim();
    void vscode.commands.executeCommand("setContext", "edgemat.filtered", this.filter !== "");
    this.changed.fire();
  }

  /** A one-line summary for the view's message. */
  summary(): string {
    const lib = this.library;
    if (!lib) return "";
    if (this.filter) {
      const t = searchTemplates(lib, this.filter).length, m = searchMicroblends(lib, this.filter).length;
      return `"${this.filter}": ${plural(t, "surface")}, ${plural(m, "microblend")}`;
    }
    return `${plural(lib.counts.templates, "surface")} · ${plural(lib.counts.microblends, "microblend")} · built ${lib.builtAt.slice(0, 10)}`;
  }

  getChildren(node?: Node): Node[] {
    const lib = this.library;
    if (!lib) return [];
    if (!node) {
      const templates = searchTemplates(lib, this.filter);
      const microblends = searchMicroblends(lib, this.filter);
      return [
        ...(templates.length ? [{ kind: "surfaces", templates } as Node] : []),
        ...(microblends.length ? [{ kind: "microblends", microblends } as Node] : []),
      ];
    }
    switch (node.kind) {
      case "surfaces":
        return [...byCategory(node.templates)].map(([name, templates]) => ({ kind: "category", name, templates }));
      case "category":
        return node.templates.map((template) => ({ kind: "template", template }));
      case "microblends":
        return node.microblends.map((microblend) => ({ kind: "microblend", microblend }));
      default:
        return [];
    }
  }

  getTreeItem(node: Node): vscode.TreeItem {
    const open = this.filter ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed;
    switch (node.kind) {
      case "surfaces": {
        const item = new vscode.TreeItem("Surfaces", vscode.TreeItemCollapsibleState.Expanded);
        item.description = plural(node.templates.length, "template");
        item.iconPath = new vscode.ThemeIcon("layers");
        return item;
      }
      case "category": {
        const item = new vscode.TreeItem(node.name, open);
        item.description = String(node.templates.length);
        item.iconPath = vscode.ThemeIcon.Folder;
        return item;
      }
      case "microblends": {
        const item = new vscode.TreeItem("Microblends", open);
        item.description = plural(node.microblends.length, "microblend");
        item.iconPath = new vscode.ThemeIcon("symbol-color");
        return item;
      }
      case "template":
        return this.templateItem(node.template);
      case "microblend": {
        const m = node.microblend;
        const item = new vscode.TreeItem(m.name.replace(/_/g, " "));
        item.tooltip = m.path;
        item.contextValue = "edgemat.gamePath";
        item.id = m.path;
        item.command = { command: "edgemat.openItem", title: "Open", arguments: [node] };
        if (m.thumbnail) item.iconPath = vscode.Uri.file(thumbnailFile(this.cacheDir, m.thumbnail));
        return item;
      }
    }
  }

  private templateItem(t: Template): vscode.TreeItem {
    const item = new vscode.TreeItem(t.title);
    item.id = t.path;
    item.contextValue = "edgemat.gamePath";
    item.command = { command: "edgemat.openItem", title: "Open", arguments: [{ kind: "template", template: t }] };
    item.description = `${t.group ? t.group + " · " : ""}${plural(t.colors.length, "color")}`;
    if (t.thumbnail) item.iconPath = vscode.Uri.file(thumbnailFile(this.cacheDir, t.thumbnail));
    const tip = new vscode.MarkdownString();
    if (t.thumbnail) tip.appendMarkdown(`![](${vscode.Uri.file(thumbnailFile(this.cacheDir, t.thumbnail)).toString()}|width=96)\n\n`);
    tip.appendMarkdown(`**${t.title}**\n\n`);
    tip.appendMarkdown(`${plural(t.colors.length, "color")} · ${plural(t.roughLevelsOut.length, "roughness level")} · ${plural(t.normalStrength.length, "normal strength")}\n\n`);
    tip.appendMarkdown(`Tiling ${t.tiling} · ${t.textures.metalness?.includes("\\default\\") ? "no metal map" : "own metal map"}\n\n`);
    tip.appendCodeblock(t.path, "text");
    item.tooltip = tip;
    return item;
  }

  /** What a node opens on the surface page. */
  static subjectOf(node: Node | undefined): { kind: "surface"; template: Template } | { kind: "microblend"; microblend: Microblend } | undefined {
    return node?.kind === "template" ? { kind: "surface", template: node.template } : node?.kind === "microblend" ? { kind: "microblend", microblend: node.microblend } : undefined;
  }

  /** The game path behind a node, for "Copy Game Path". */
  static gamePathOf(node: Node | undefined): string | undefined {
    return node?.kind === "template" ? node.template.path : node?.kind === "microblend" ? node.microblend.path : undefined;
  }
}
