// The Desk (design, "The Desk"): meshes and setups a modder works on before they are in a project. It
// lives in EDGEmat's own folder and lasts across restarts. Each entry has its own folder shaped like a
// project (desk\items\<id>\source\archive): the setups edited from that entry are saved there at their
// game paths, with a copy of its mesh for the 3D view, so the code that reads a project's copies reads an
// entry's the same way, and two variations of one mesh never share edits. desk.json lists the entries.
// Add to Project puts entries in a project: each edited setup as a new setup with the entry's mesh pointed
// at it, and the other meshes as they are.

import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { BridgeClient } from "./bridgeClient";
import { sameSetup, setupToJson } from "./edit";
import { isFilePath } from "./find";
import { readSetup } from "./openSetup";
import { meshUses, newPathFor, projectArchive, saveToProject, type Project } from "./project";
import type { Setup } from "./setup";

export interface DeskEntry {
  /** Names the entry's folder, and the entry in commands and in mat_desk. */
  id: string;
  kind: "mesh" | "setup";
  /** The game path; a file on disk when it is not in a project's source\archive. */
  path: string;
  /** A project's source\archive when the entry is that project's file: its copies are read first. */
  root?: string;
  /** 1 for the first copy of a file on the Desk, 2 for the next variation of it, and so on. */
  variation: number;
  /** A name the modder gave it. */
  name?: string;
  /** When it was put on the Desk (ISO time). */
  added: string;
}

export interface DeskResult {
  /** Files written into the project, relative to its source\archive. */
  written: string[];
  /** Each edited setup: the entry it was edited on, where it went and the meshes pointed at it. */
  setups: { entry: string; from: string; to: string; meshes: string[] }[];
  /** The entries that went into the project. */
  added: string[];
  /** The entries that stayed out: the project keeps its own copy of their mesh. */
  kept: string[];
  notes: string[];
}

/** A Desk mesh the project already holds its own copy of, with other materials than the entry's edited setups. */
export interface DeskConflict {
  entry: string;
  mesh: string;
  /** The entry's edited setups its mesh uses and the project's copy does not. */
  setups: string[];
}

/** One setup edited on one entry, and the game path it goes to in a project. */
interface DeskEdit {
  entry: DeskEntry;
  gamePath: string;
  setup: Setup;
  target: string;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const sameDir = (a?: string, b?: string) => (a ? path.resolve(a).toLowerCase() : "") === (b ? path.resolve(b).toLowerCase() : "");

/** A game path as it is; a file in a project's source\archive as its game path and that folder. */
function where(p: string): { path: string; root?: string } {
  if (!isFilePath(p)) return { path: p.trim().replace(/\//g, "\\") };
  const file = p.replace(/\//g, "\\");
  const root = projectArchive(file);
  return root ? { path: path.relative(root, file), root } : { path: file };
}

/** The entry's file name, with its name or variation: "l1_012_pwa_pants__jeans_tight.mesh, variation 2". */
export function deskLabel(e: DeskEntry): string {
  const extra = e.name ?? (e.variation > 1 ? `variation ${e.variation}` : undefined);
  return `${path.win32.basename(e.path)}${extra ? `, ${extra}` : ""}`;
}

/** The project a project entry comes from, by the folder above its source\archive. */
export function deskProjectName(root: string): string {
  return path.basename(path.dirname(path.dirname(root)));
}

export class Desk {
  readonly dir: string;
  readonly file: string;
  private readonly items: string;

  constructor(cacheDir: string) {
    this.dir = path.join(cacheDir, "desk");
    this.file = path.join(this.dir, "desk.json");
    this.items = path.join(this.dir, "items");
    this.migrate();
  }

  entries(): DeskEntry[] {
    try {
      const list = JSON.parse(fs.readFileSync(this.file, "utf8")).entries;
      return Array.isArray(list) ? list.filter((e: DeskEntry) => (e?.kind === "mesh" || e?.kind === "setup") && typeof e.path === "string" && typeof e.id === "string") : [];
    } catch {
      return [];
    }
  }

  private write(entries: DeskEntry[]): void {
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify({ entries }, null, 2));
  }

  /**
   * The Desk before 2026-10-26 kept one edit per setup for all entries (desk\source\archive) and entries
   * without ids. Each entry gets an id and its own folder, with a copy of every edit, so none is lost.
   */
  private migrate(): void {
    let raw: (Partial<DeskEntry> & { kind: DeskEntry["kind"]; path: string })[] = [];
    try {
      raw = JSON.parse(fs.readFileSync(this.file, "utf8")).entries ?? [];
    } catch {
      return;
    }
    const shared = path.join(this.dir, "source", "archive");
    if (raw.every((e) => e.id) && !fs.existsSync(shared)) return;
    const entries: DeskEntry[] = [];
    for (const e of raw) {
      const variation = entries.filter((x) => x.kind === e.kind && same(x.path, e.path) && sameDir(x.root, e.root)).length + 1;
      entries.push({ id: e.id ?? newId(), kind: e.kind, path: e.path, root: e.root, variation: e.variation ?? variation, name: e.name, added: e.added ?? new Date().toISOString() });
    }
    if (fs.existsSync(shared)) {
      for (const e of entries) fs.cpSync(shared, this.archiveOf(e), { recursive: true, filter: (f) => fs.statSync(f).isDirectory() || /\.mlsetup$/i.test(f) });
      fs.rmSync(path.join(this.dir, "source"), { recursive: true, force: true });
    }
    this.write(entries);
  }

  /** The entry's own folder, shaped like a project's source\archive. */
  archiveOf(e: Pick<DeskEntry, "id">): string {
    return path.join(this.items, e.id, "source", "archive");
  }

  get(id: string | undefined): DeskEntry | undefined {
    return id ? this.entries().find((e) => e.id === id) : undefined;
  }

  /** The entry whose folder holds a file (an edited setup, a mesh copy), with the file's game path. */
  entryAt(file: string): { entry: DeskEntry; gamePath: string } | undefined {
    const rel = path.relative(this.items, file);
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return undefined;
    const [id, source, archive, ...rest] = rel.split(path.sep);
    const entry = this.get(id);
    return entry && same(source ?? "", "source") && same(archive ?? "", "archive") && rest.length ? { entry, gamePath: rest.join("\\") } : undefined;
  }

  /** The entries for a game path or a file. */
  matching(p: string, kind?: DeskEntry["kind"]): DeskEntry[] {
    const at = isFilePath(p) ? this.entryAt(p) : undefined;
    if (at) return [at.entry];
    const w = where(p);
    return this.entries().filter((e) => (!kind || e.kind === kind) && same(e.path, w.path) && sameDir(e.root, w.root));
  }

  /**
   * Puts a mesh or a setup on the Desk: a game path, or a file (a project's file keeps its project as
   * `root`; one of the Desk's own copies is its entry). A copy already there with no edits is reused; when
   * every copy there is edited, a new variation starts, as in the game. `created` says which.
   */
  open(kind: DeskEntry["kind"], p: string): { entry: DeskEntry; created: boolean } {
    const there = this.matching(p, kind);
    const fresh = there.find((e) => !this.edited(e).length);
    if (fresh || (there.length && isFilePath(p) && this.entryAt(p))) return { entry: fresh ?? there[0], created: false };
    const w = where(p);
    const entry: DeskEntry = { id: newId(), kind, ...w, variation: Math.max(0, ...there.map((e) => e.variation)) + 1, added: new Date().toISOString() };
    this.write([...this.entries(), entry]);
    return { entry, created: true };
  }

  rename(id: string, name: string | undefined): void {
    this.write(this.entries().map((e) => (e.id === id ? { ...e, name: name?.trim() || undefined } : e)));
  }

  /** Takes entries off the Desk, with their edits. */
  remove(ids: string[]): void {
    const off = new Set(ids);
    this.write(this.entries().filter((e) => !off.has(e.id)));
    for (const id of ids) fs.rmSync(path.join(this.items, id), { recursive: true, force: true });
  }

  /** Everything off the Desk, edits included. */
  clear(): void {
    fs.rmSync(this.items, { recursive: true, force: true });
    this.write([]);
  }

  /** The entry's edited copy of a setup, by its game path, when there is one. */
  copyOf(e: Pick<DeskEntry, "id">, gamePath: string): string | undefined {
    if (isFilePath(gamePath)) return undefined;
    const f = path.join(this.archiveOf(e), gamePath);
    return fs.existsSync(f) ? f : undefined;
  }

  /** The game paths of the setups edited on an entry. */
  edited(e: Pick<DeskEntry, "id">): string[] {
    const out: string[] = [];
    const archive = this.archiveOf(e);
    const walk = (d: string) => {
      if (!fs.existsSync(d)) return;
      for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, f.name);
        if (f.isDirectory()) walk(full);
        else if (/\.mlsetup$/i.test(f.name)) out.push(path.relative(archive, full));
      }
    };
    walk(archive);
    return out;
  }

  /** How many setups are edited across the Desk. */
  editCount(): number {
    return this.entries().reduce((n, e) => n + this.edited(e).length, 0);
  }

  /** Saves an edited setup in an entry's folder at its game path. */
  async saveSetup(bridge: BridgeClient, e: Pick<DeskEntry, "id">, gamePath: string, setup: Setup): Promise<string> {
    const out = path.join(this.archiveOf(e), gamePath);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await bridge.fromJson(out, { json: JSON.stringify(setupToJson(setup)) });
    return out;
  }

  /**
   * The mesh file REDcode's 3D view opens for a mesh entry: a copy in the entry's folder (the game's,
   * extracted once; a project's, copied fresh each time), so the entry's edits show there, and the game's
   * and the project's meshes keep their own look.
   */
  async meshFile(bridge: BridgeClient, e: DeskEntry): Promise<string> {
    const f = path.join(this.archiveOf(e), e.path);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    if (e.root) fs.copyFileSync(path.join(e.root, e.path), f);
    else if (!fs.existsSync(f)) await bridge.extract(e.path, f);
    return f;
  }

  /** For an entry's folder, the project it came from: its files are read after the entry's own. */
  sourceOf(archive: string | undefined): string | undefined {
    if (!archive) return undefined;
    const rel = path.relative(this.items, archive);
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return undefined;
    return this.get(rel.split(path.sep)[0])?.root;
  }

  /** The files on the Desk more than once (variations), among `ids` (all when not given). */
  duplicates(ids?: string[]): DeskEntry[][] {
    const groups = new Map<string, DeskEntry[]>();
    for (const e of this.chosen(ids)) {
      const k = `${e.kind}:${e.path}`.toLowerCase();
      groups.set(k, [...(groups.get(k) ?? []), e]);
    }
    return [...groups.values()].filter((g) => g.length > 1);
  }

  private chosen(ids?: string[]): DeskEntry[] {
    const all = this.entries();
    return ids ? all.filter((e) => ids.includes(e.id)) : all;
  }

  /**
   * Each setup edited on the chosen entries, with the game path it goes to in a project: beside the game's,
   * named with `suffix`. Two entries that edited one setup differently get names of their own (_2, _3).
   */
  private async edits(bridge: BridgeClient, entries: DeskEntry[], suffix: string): Promise<DeskEdit[]> {
    const out: DeskEdit[] = [];
    for (const entry of entries) {
      for (const gamePath of this.edited(entry)) {
        const setup = await readSetup(bridge, { file: path.join(this.archiveOf(entry), gamePath), gamePath });
        if (entry.kind === "setup") {
          out.push({ entry, gamePath, setup, target: gamePath });
          continue;
        }
        const before = out.filter((x) => x.entry.kind === "mesh" && same(x.gamePath, gamePath));
        const twin = before.find((x) => sameSetup(x.setup, setup));
        const distinct = new Set(before.map((x) => x.target.toLowerCase())).size;
        out.push({ entry, gamePath, setup, target: twin?.target ?? newPathFor(gamePath, distinct ? `${suffix}_${distinct + 1}` : suffix) });
      }
    }
    return out;
  }

  /**
   * The chosen mesh entries the project already holds its own copy of, where that copy no longer uses an
   * edited setup the entry's mesh uses (it was pointed at another material, such as a new one). Adding then
   * either replaces the project's copy with the entry's mesh or keeps it, and the entry stays on the Desk.
   */
  async conflicts(bridge: BridgeClient, project: Pick<Project, "archive">, suffix: string, ids?: string[]): Promise<DeskConflict[]> {
    const out: DeskConflict[] = [];
    const entries = this.chosen(ids).filter((e) => e.kind === "mesh" && !isFilePath(e.path) && !sameDir(e.root, project.archive));
    const edits = await this.edits(bridge, entries, suffix);
    for (const e of entries) {
      if (!fs.existsSync(path.join(project.archive, e.path))) continue;
      const setups: string[] = [];
      for (const x of edits.filter((y) => y.entry.id === e.id)) {
        try {
          const desk = await meshUses(bridge, e.root, e.path, [x.gamePath]);
          if (!desk.materials.length) continue;
          const there = await meshUses(bridge, project.archive, e.path, [x.gamePath, x.target]);
          if (!there.materials.length) setups.push(x.gamePath);
        } catch {
          // An unreadable mesh is reported by toProject.
        }
      }
      if (setups.length) out.push({ entry: e.id, mesh: e.path, setups });
    }
    return out;
  }

  /**
   * Puts entries in a project (`ids`, else all; one entry per file: pick a variation first, see
   * duplicates). Each setup edited on a mesh entry is saved as a new setup (newPathFor with `suffix`) with
   * the entry's mesh copied in and pointed at it, so it shows in the game with no other mod; an edited setup
   * on the Desk alone is saved at its own path (over the game's, which needs Material Texture Override).
   * Every other mesh is copied in as it is; one the project already has is kept. A conflict (see conflicts)
   * is replaced by the entry's mesh with `replace`, else the project's copy is kept and the entry stays out
   * (`kept`). The Desk is left as it was.
   */
  async toProject(bridge: BridgeClient, project: Pick<Project, "archive">, suffix: string, opts: { replace?: boolean; ids?: string[] } = {}): Promise<DeskResult> {
    const entries = this.chosen(opts.ids);
    const twice = this.duplicates(opts.ids);
    if (twice.length) throw new Error(`One variation of each file can go into a project: ${twice.map((g) => g.map(deskLabel).join(" or ")).join("; ")}.`);
    const result: DeskResult = { written: [], setups: [], added: [], kept: [], notes: [] };
    const into = (gamePath: string) => path.join(project.archive, gamePath);
    const conflicts = await this.conflicts(bridge, project, suffix, opts.ids);
    const conflicted = new Set(conflicts.map((c) => c.entry));
    if (!opts.replace) {
      for (const c of conflicts) {
        result.kept.push(c.entry);
        result.notes.push(`${c.mesh}: the project keeps its own copy, which uses other materials, so the Desk's edits to ${c.setups.join(", ")} stay on the Desk.`);
      }
    }
    // Meshes from another project (or replacing the project's own) come over first, so the pointing below changes the copy in this one.
    const meshes: DeskEntry[] = [];
    for (const e of entries.filter((x) => x.kind === "mesh")) {
      if (isFilePath(e.path)) {
        result.notes.push(`${e.path} is not in a project's source\\archive, so its game path is unknown: left out.`);
        continue;
      }
      if (result.kept.includes(e.id)) continue;
      const ownProject = sameDir(e.root, project.archive);
      const replace = opts.replace && conflicted.has(e.id);
      if (!ownProject && (replace || !fs.existsSync(into(e.path)))) {
        fs.mkdirSync(path.dirname(into(e.path)), { recursive: true });
        if (e.root) fs.copyFileSync(path.join(e.root, e.path), into(e.path));
        else if (replace) await bridge.extract(e.path, into(e.path));
        // A game mesh not yet in the project is extracted below, unless the pointing writes it.
        if (e.root || replace) result.written.push(e.path);
        if (replace) result.notes.push(`${e.path}: the project's own copy, with other materials, was replaced by the Desk's.`);
      } else if (!ownProject) {
        result.notes.push(`${e.path} is in the project already: kept as it is.`);
      }
      meshes.push(e);
    }
    const pointed = new Set<string>();
    const edits = await this.edits(bridge, entries.filter((e) => !result.kept.includes(e.id)), suffix);
    for (const x of edits) {
      const users: string[] = [];
      if (x.entry.kind === "mesh") {
        if (!meshes.includes(x.entry)) continue;
        try {
          // A project copy pointed at the new setup by an earlier add counts too.
          if ((await meshUses(bridge, project.archive, x.entry.path, [x.gamePath, x.target])).materials.length) users.push(x.entry.path);
        } catch (e) {
          result.notes.push(`Could not read ${x.entry.path}: ${e instanceof Error ? e.message : String(e)}`);
        }
        if (!users.length) {
          result.notes.push(`${x.gamePath} was edited on ${deskLabel(x.entry)}, which does not use it: left on the Desk.`);
          continue;
        }
      }
      const saved = await saveToProject(bridge, { setup: x.setup, archive: project.archive, target: x.target, from: x.gamePath, meshes: users, suffix });
      for (const w of saved.written) if (!result.written.includes(w)) result.written.push(w);
      for (const m of saved.meshes) pointed.add(m.mesh.toLowerCase());
      result.notes.push(...saved.notes);
      if (x.entry.kind === "setup") result.notes.push(`${x.gamePath} is on the Desk alone, so it was saved at its own path: over the game's setup, it shows in the game only with the Material Texture Override mod.`);
      result.setups.push({ entry: x.entry.id, from: x.gamePath, to: x.target, meshes: saved.meshes.map((m) => m.mesh) });
    }
    for (const e of meshes) {
      if (!pointed.has(e.path.toLowerCase()) && !fs.existsSync(into(e.path))) {
        fs.mkdirSync(path.dirname(into(e.path)), { recursive: true });
        await bridge.extract(e.path, into(e.path));
        result.written.push(e.path);
      }
      result.added.push(e.id);
    }
    for (const e of entries.filter((x) => x.kind === "setup" && !x.root)) {
      if (this.copyOf(e, e.path)) result.added.push(e.id);
      else result.notes.push(`${e.path} was not edited: left out.`);
    }
    return result;
  }
}

function newId(): string {
  return randomBytes(4).toString("hex");
}
