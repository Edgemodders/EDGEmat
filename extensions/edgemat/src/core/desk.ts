// The Desk (design, "The Desk"): meshes and setups a modder works on before they are in a project. It
// lives in EDGEmat's own folder and lasts across restarts. Its folder is shaped like a project
// (desk\source\archive), so an edited setup is saved there at its game path and the code that reads a
// project's copies first reads the Desk's the same way. desk.json lists what is on it. Add to Project
// puts it all in a project: each edited setup as a new setup with the Desk's meshes that use it pointed
// at it, and the other meshes as they are.

import * as fs from "node:fs";
import * as path from "node:path";
import type { BridgeClient } from "./bridgeClient";
import { setupToJson } from "./edit";
import { isFilePath } from "./find";
import { readSetup } from "./openSetup";
import { meshUses, newPathFor, projectArchive, saveToProject, type Project } from "./project";
import type { Setup } from "./setup";

export interface DeskEntry {
  kind: "mesh" | "setup";
  /** The game path; a file on disk when it is not in a project's source\archive. */
  path: string;
  /** A project's source\archive when the entry is that project's file: its copies are read first. */
  root?: string;
  /** When it was put on the Desk (ISO time). */
  added: string;
}

export interface DeskResult {
  /** Files written into the project, relative to its source\archive. */
  written: string[];
  /** Each edited setup: where it went and the meshes pointed at it. */
  setups: { from: string; to: string; meshes: string[] }[];
  notes: string[];
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** A game path as it is; a file in a project's source\archive as its game path and that folder. */
function where(p: string): { path: string; root?: string } {
  if (!isFilePath(p)) return { path: p.trim().replace(/\//g, "\\") };
  const file = p.replace(/\//g, "\\");
  const root = projectArchive(file);
  return root ? { path: path.relative(root, file), root } : { path: file };
}

export class Desk {
  readonly dir: string;
  /** Where edited setups are saved, at their game paths. */
  readonly archive: string;
  readonly file: string;

  constructor(cacheDir: string) {
    this.dir = path.join(cacheDir, "desk");
    this.archive = path.join(this.dir, "source", "archive");
    this.file = path.join(this.dir, "desk.json");
  }

  entries(): DeskEntry[] {
    try {
      const list = JSON.parse(fs.readFileSync(this.file, "utf8")).entries;
      return Array.isArray(list) ? list.filter((e: DeskEntry) => (e?.kind === "mesh" || e?.kind === "setup") && typeof e.path === "string") : [];
    } catch {
      return [];
    }
  }

  private write(entries: DeskEntry[]): void {
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify({ entries }, null, 2));
  }

  /**
   * Puts a mesh or a setup on the Desk: a game path, or a file. A file in a project's source\archive is kept
   * as its game path with the project's folder as `root`. Returns the entry, the one already there if any.
   */
  add(kind: DeskEntry["kind"], p: string): DeskEntry {
    const found = this.find(p, kind);
    if (found) return found;
    const entry: DeskEntry = { kind, ...where(p), added: new Date().toISOString() };
    this.write([...this.entries(), entry]);
    return entry;
  }

  /** The entry for a game path or a file, when it is on the Desk. */
  find(p: string, kind?: DeskEntry["kind"]): DeskEntry | undefined {
    const w = where(p);
    return this.entries().find((e) => (!kind || e.kind === kind) && same(e.path, w.path) && same(e.root ?? "", w.root ?? ""));
  }

  /** Takes an entry off the Desk. A setup's edits go with it; a mesh's setups keep theirs. */
  remove(entry: Pick<DeskEntry, "kind" | "path" | "root">): void {
    this.write(this.entries().filter((e) => !(e.kind === entry.kind && same(e.path, entry.path) && same(e.root ?? "", entry.root ?? ""))));
    if (entry.kind === "setup" && !entry.root) fs.rmSync(path.join(this.archive, entry.path), { force: true });
  }

  /** Everything off the Desk, edits included. */
  clear(): void {
    fs.rmSync(this.archive, { recursive: true, force: true });
    this.write([]);
  }

  /** The Desk's edited copy of a setup, by its game path, when there is one. */
  copyOf(gamePath: string): string | undefined {
    if (isFilePath(gamePath)) return undefined;
    const f = path.join(this.archive, gamePath);
    return fs.existsSync(f) ? f : undefined;
  }

  /** Whether a file is one of the Desk's copies. */
  holds(file: string): boolean {
    const rel = path.relative(this.archive, file);
    return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
  }

  /** The game paths of the setups edited on the Desk. */
  edited(): string[] {
    const out: string[] = [];
    const walk = (d: string) => {
      if (!fs.existsSync(d)) return;
      for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, f.name);
        if (f.isDirectory()) walk(full);
        else if (/\.mlsetup$/i.test(f.name)) out.push(path.relative(this.archive, full));
      }
    };
    walk(this.archive);
    return out;
  }

  /** Saves an edited setup on the Desk at its game path. */
  async saveSetup(bridge: BridgeClient, gamePath: string, setup: Setup): Promise<string> {
    const out = path.join(this.archive, gamePath);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await bridge.fromJson(out, { json: JSON.stringify(setupToJson(setup)) });
    return out;
  }

  /**
   * Puts the Desk in a project. Each edited setup that a mesh on the Desk uses is saved as a new setup
   * (newPathFor with `suffix`) with those meshes copied in and pointed at it, so it shows in the game with no
   * other mod; an edited setup put on the Desk alone is saved at its own path (over the game's, which needs
   * Material Texture Override). Every other mesh is copied in as it is. The Desk is left as it was.
   */
  async toProject(bridge: BridgeClient, project: Pick<Project, "archive">, suffix: string): Promise<DeskResult> {
    const result: DeskResult = { written: [], setups: [], notes: [] };
    const entries = this.entries();
    const into = (gamePath: string) => path.join(project.archive, gamePath);
    // Meshes from another project come over first, so the pointing below changes the copy in this one.
    const meshes: string[] = [];
    for (const e of entries.filter((x) => x.kind === "mesh")) {
      if (isFilePath(e.path)) {
        result.notes.push(`${e.path} is not in a project's source\\archive, so its game path is unknown: left out.`);
        continue;
      }
      if (e.root && !same(path.resolve(e.root), path.resolve(project.archive)) && !fs.existsSync(into(e.path))) {
        fs.mkdirSync(path.dirname(into(e.path)), { recursive: true });
        fs.copyFileSync(path.join(e.root, e.path), into(e.path));
        result.written.push(e.path);
      }
      meshes.push(e.path);
    }
    const alone = entries.filter((x) => x.kind === "setup").map((x) => x.path.toLowerCase());
    const pointed = new Set<string>();
    for (const gamePath of this.edited()) {
      const renamed = newPathFor(gamePath, suffix);
      const users: string[] = [];
      for (const m of meshes) {
        try {
          // A project copy pointed at the new setup by an earlier add counts too.
          if ((await meshUses(bridge, project.archive, m, [gamePath, renamed])).materials.length) users.push(m);
        } catch (e) {
          result.notes.push(`Could not read ${m}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      if (!users.length && !alone.includes(gamePath.toLowerCase())) {
        result.notes.push(`${gamePath} was edited on the Desk, but nothing on the Desk uses it now: left on the Desk.`);
        continue;
      }
      const setup = await readSetup(bridge, { file: path.join(this.archive, gamePath), gamePath });
      const to = users.length ? renamed : gamePath;
      const saved = await saveToProject(bridge, { setup, archive: project.archive, target: to, from: gamePath, meshes: users, suffix });
      for (const w of saved.written) if (!result.written.includes(w)) result.written.push(w);
      for (const m of saved.meshes) pointed.add(m.mesh.toLowerCase());
      result.notes.push(...saved.notes);
      if (!users.length) result.notes.push(`${gamePath} is on the Desk alone, so it was saved at its own path: over the game's setup, it shows in the game only with the Material Texture Override mod.`);
      result.setups.push({ from: gamePath, to, meshes: saved.meshes.map((m) => m.mesh) });
    }
    for (const m of meshes) {
      if (pointed.has(m.toLowerCase()) || fs.existsSync(into(m))) continue;
      fs.mkdirSync(path.dirname(into(m)), { recursive: true });
      await bridge.extract(m, into(m));
      result.written.push(m);
    }
    for (const e of entries.filter((x) => x.kind === "setup" && !x.root && !this.copyOf(x.path))) result.notes.push(`${e.path} was not edited: left out.`);
    return result;
  }
}
