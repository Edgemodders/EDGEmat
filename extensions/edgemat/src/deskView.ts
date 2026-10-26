// The Desk view (design, "The Desk"): the meshes and setups on the Desk, above the Library. A mesh opens
// into its looks and their materials as in Find; a material opens its setup, which saves in that Desk
// entry. What is on the Desk is read from desk.json, which the MCP server's mat_desk changes too.

import * as vscode from "vscode";
import type { BridgeClient, Desk, DeskEntry } from "./core";
import { FindView, type Node } from "./findView";

export class DeskView extends FindView {
  /** Entries put on the Desk in this session, by id, with the look to open: they show open, under a fresh id. */
  private readonly opened = new Map<string, { open: number; appearance?: string }>();
  private serial = 0;

  constructor(desk: Desk, bridge: () => Promise<BridgeClient | undefined>, cacheDir: () => string, log: (line: string) => void) {
    super(bridge, cacheDir, log, desk);
    this.load();
  }

  /** Reads desk.json again: at the start, after a change here, or after one from the MCP server. */
  load(): void {
    this.roots = this.desk!.entries().map((entry): Node => {
      const o = this.opened.get(entry.id);
      return entry.kind === "mesh" ? { kind: "meshFile", path: entry.path, root: entry.root, entry, open: o?.open, appearance: o?.appearance } : { kind: "setupFile", entry };
    });
    void vscode.commands.executeCommand("setContext", "edgemat.deskEmpty", this.roots.length === 0);
    this.changed.fire();
  }

  /** Redraws the Desk, such as after a setup on it was saved. */
  refresh(): void {
    this.changed.fire();
  }

  /**
   * Puts a mesh or a setup on the Desk (a game path, or a file), opened at `appearance`: a copy there with no
   * edits is reused, else a new variation starts (`created`). Returns its node, to reveal.
   */
  put(kind: DeskEntry["kind"], p: string, appearance?: string): { node?: Node; entry: DeskEntry; created: boolean } {
    const { entry, created } = this.desk!.open(kind, p);
    this.opened.set(entry.id, { open: ++this.serial, appearance });
    this.load();
    return { node: this.nodeOf(entry.id), entry, created };
  }

  nodeOf(id: string): Node | undefined {
    return this.roots.find((n) => (n.kind === "meshFile" || n.kind === "setupFile") && n.entry?.id === id);
  }

  /** The Desk entry of a line on the Desk. */
  static entryOf(node: unknown): DeskEntry | undefined {
    const n = node as Node | undefined;
    return n?.kind === "meshFile" || n?.kind === "setupFile" ? n.entry : undefined;
  }

  remove(entries: DeskEntry[]): void {
    this.desk!.remove(entries.map((e) => e.id));
    for (const e of entries) this.opened.delete(e.id);
    this.load();
  }

  /** Only the Desk's own lines are revealed, and they sit at the top. */
  getParent(): Node | undefined {
    return undefined;
  }
}
