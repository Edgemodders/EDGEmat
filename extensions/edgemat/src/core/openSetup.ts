// Opening a setup from wherever it is: a game path, a binary .mlsetup or WolvenKit .json on disk, or
// a file in a project. Reads it, finds its mask set, lays out its colors, and describes it. The setup
// editor and the MCP tool mat_describe both use this.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { BridgeClient } from "./bridgeClient";
import type { Library } from "./library";
import { compositeSetup, loadMaskSet, maskSetsBeside, rankMaskSets, type MaskSet, type MaskSource } from "./masks";
import { loadMicroblends, readMicroblend } from "./microblend";
import { meshesUsing, projectArchive } from "./project";
import { describeSetup, parseSetup, type Setup, type SetupInfo } from "./setup";

/** A setup's source. A file may carry the game path it stands for (a project copy, or one taken from a mod archive). */
export type SetupSource = { gamePath: string } | { file: string; gamePath?: string };

export interface OpenedSetup {
  source: SetupSource;
  setup: Setup;
  info: SetupInfo;
  masks?: MaskSet;
  /** How the mask set was chosen. */
  maskFrom?: "given" | "beside" | "material";
  /** Other mask sets that could belong to it: game paths or files, best match first. */
  maskChoices: string[];
  maskError?: string;
  /** The flat color map in texture space, and which layer shows where. */
  composite?: { file: string; pick: number[] };
}

/** The game path a file in a WolvenKit project stands for: the part after source\archive\. */
export function gamePathInProject(file: string): string | undefined {
  const m = file.replace(/\//g, "\\").match(/\\source\\archive\\(.+)$/i);
  return m ? m[1] : undefined;
}

export async function readSetup(bridge: BridgeClient | undefined, source: SetupSource): Promise<Setup> {
  if ("file" in source) {
    if (/\.json$/i.test(source.file)) return parseSetup(JSON.parse(fs.readFileSync(source.file, "utf8")));
    if (!bridge) throw new Error("Reading a binary .mlsetup needs REDbridge.");
    const r = await bridge.fileToJson(source.file);
    if (!r.json) throw new Error(`REDbridge returned no JSON for ${source.file}.`);
    return parseSetup(JSON.parse(r.json));
  }
  if (!bridge) throw new Error("Reading a game file needs REDbridge.");
  const r = await bridge.toJson(source.gamePath);
  if (!r.json) throw new Error(`REDbridge returned no JSON for ${source.gamePath}.`);
  return parseSetup(JSON.parse(r.json));
}

/**
 * Mask sets that could go with a setup, best first: the ones named by the materials of meshes that use it
 * (the project's meshes for a project file; the game's when nothing is beside it), then .mlmask files
 * beside it on disk, then in its game folder. A garment's masks can sit in another folder than its setup.
 */
async function maskChoicesFor(bridge: BridgeClient | undefined, source: SetupSource): Promise<{ choices: string[]; named: number }> {
  const beside: string[] = [];
  if ("file" in source) {
    const dir = path.dirname(source.file);
    try {
      beside.push(...rankMaskSets(source.file, fs.readdirSync(dir).filter((f) => /\.mlmask$/i.test(f)).map((f) => path.join(dir, f))));
    } catch {
      // A folder we cannot list has no masks to offer.
    }
  }
  const archive = "file" in source ? projectArchive(source.file) : undefined;
  const gamePath = "gamePath" in source && source.gamePath ? source.gamePath : "file" in source ? gamePathInProject(source.file) : undefined;
  if (bridge && gamePath) beside.push(...(await maskSetsBeside(bridge, gamePath)));
  const named: string[] = [];
  if (bridge && gamePath && (archive || !beside.length)) {
    const uses = await meshesUsing(bridge, gamePath, archive, 20, !archive).catch(() => []);
    for (const m of uses.flatMap((u) => u.masks ?? [])) named.push(archive && fs.existsSync(path.join(archive, m)) ? path.join(archive, m) : m);
  }
  const choices = [...new Set([...named, ...beside])];
  return { choices, named: new Set(named).size };
}

const asMaskSource = (choice: string): MaskSource => (/^[a-z]:\\|^\\\\|^\//i.test(choice) ? { file: choice } : { gamePath: choice });

/**
 * Opens a setup: reads it, takes `mask` or the best mask set beside it, writes its color map into the
 * cache under `dir`, and describes it in plain words. A mask that cannot be read leaves the rest working.
 */
export async function openSetup(bridge: BridgeClient | undefined, lib: Library | undefined, dir: string, source: SetupSource, mask?: string): Promise<OpenedSetup> {
  const setup = await readSetup(bridge, source);
  const { choices: maskChoices, named } = await maskChoicesFor(bridge, source).catch(() => ({ choices: [] as string[], named: 0 }));
  const chosen = mask ?? maskChoices[0];
  let masks: MaskSet | undefined;
  let maskError: string | undefined;
  if (chosen && bridge) {
    try {
      masks = await loadMaskSet(bridge, dir, asMaskSource(chosen));
    } catch (e) {
      maskError = e instanceof Error ? e.message : String(e);
    }
  } else if (!chosen) {
    maskError = "No mask set found beside this setup or named by a mesh that uses it. Choose one to see where each layer shows.";
  }

  if (masks && bridge) await loadMicroblends(bridge, dir, setup.layers.map((l) => l.microblend));
  const maskFrom = masks ? (mask ? "given" : named ? "material" : "beside") : undefined;
  return withSetup({ source, setup, info: describeSetup(setup, lib), masks, maskFrom, maskChoices, maskError }, setup, lib, dir);
}

/**
 * An opened setup with `setup` in place of what it held: described again and its color map redrawn,
 * with the same masks. The setup editor calls it after each edit; openSetup after reading. A microblend
 * not cached yet (loadMicroblends) leaves its layer uncut.
 */
export function withSetup(o: OpenedSetup, setup: Setup, lib: Library | undefined, dir: string): OpenedSetup {
  const { masks, source } = o;
  // First without shares, to know which layers show and their colors; then with them.
  let info = describeSetup(setup, lib, masks?.count);
  let composite: OpenedSetup["composite"];
  if (masks) {
    const stamp = "file" in source && fs.existsSync(source.file) ? fs.statSync(source.file).mtimeMs : "";
    const id = "file" in source ? source.file : source.gamePath;
    const plain = info.layers.map((l) => ({ shown: l.shown, hex: l.color?.hex ?? "#808080", opacity: l.raw.opacity }));
    const layers = plain.map((l, i) => {
      const r = setup.layers[i];
      const mask = l.shown ? readMicroblend(dir, r.microblend) : undefined;
      return { ...l, microblend: mask && { mask, tile: r.mbTile, offsetU: r.microblendOffsetU, offsetV: r.microblendOffsetV } };
    });
    const cuts = layers.map((l, i) => (l.microblend ? [setup.layers[i].microblend, l.microblend.tile, l.microblend.offsetU, l.microblend.offsetV] : null));
    const key = crypto.createHash("sha1").update(JSON.stringify([id, stamp, masks.files[0], plain, "cut1", cuts])).digest("hex").slice(0, 20);
    const file = path.join(dir, "setups", `${key}.png`);
    const c = compositeSetup(masks, layers, file);
    composite = { file, pick: c.pick };
    info = describeSetup(setup, lib, masks.count, c.shares);
  }
  return { ...o, setup, info, composite };
}
