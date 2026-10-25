// The Desk view (design, "The Desk"): the meshes and setups on the Desk, above the Library. A mesh opens
// into its looks and their materials as in Find; a material opens its setup, which saves on the Desk.
// What is on the Desk is read from desk.json, which the MCP server's mat_desk changes too.

import * as vscode from "vscode";
import type { BridgeClient, Desk, DeskEntry } from "./core";
import { FindView, type Node } from "./findView";

const key = (e: Pick<DeskEntry, "kind" | "path" | "root">) => `${e.kind}:${e.root ?? ""}:${e.path}`.toLowerCase();

export class DeskView extends FindView {
  /** Entries put on the Desk in this session, with the look to open: they show open, under a fresh id. */
  private readonly opened = new Map<string, { open: number; appearance?: string }>();
  private serial = 0;

  constructor(desk: Desk, bridge: () => Promise<BridgeClient | undefined>, cacheDir: () => string, log: (line: string) => void) {
    super(bridge, cacheDir, log, desk);
    this.load();
  }

  /** Reads desk.json again: at the start, after a change here, or after one from the MCP server. */
  load(): void {
    this.roots = this.desk!.entries().map((entry): Node => {
      const o = this.opened.get(key(entry));
      return entry.kind === "mesh" ? { kind: "meshFile", path: entry.path, root: entry.root, entry, open: o?.open, appearance: o?.appearance } : { kind: "setupFile", entry };
    });
    void vscode.commands.executeCommand("setContext", "edgemat.deskEmpty", this.roots.length === 0);
    this.changed.fire();
  }

  /** Redraws the Desk, such as after a setup on it was saved. */
  refresh(): void {
    this.changed.fire();
  }

  /** Puts a mesh or a setup on the Desk (a game path, or a file), opened at `appearance`. Returns its node, to reveal. */
  put(kind: DeskEntry["kind"], p: string, appearance?: string): Node | undefined {
    const entry = this.desk!.add(kind, p);
    this.opened.set(key(entry), { open: ++this.serial, appearance });
    this.load();
    return this.roots.find((n) => (n.kind === "meshFile" || n.kind === "setupFile") && n.entry && key(n.entry) === key(entry));
  }

  remove(node: unknown): DeskEntry | undefined {
    const n = node as Node | undefined;
    const entry = n?.kind === "meshFile" || n?.kind === "setupFile" ? n.entry : undefined;
    if (!entry) return undefined;
    this.desk!.remove(entry);
    this.opened.delete(key(entry));
    this.load();
    return entry;
  }

  /** Only the Desk's own lines are revealed, and they sit at the top. */
  getParent(): Node | undefined {
    return undefined;
  }
}
