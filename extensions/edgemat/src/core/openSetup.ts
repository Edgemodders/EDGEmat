// Opening a setup from wherever it is: a game path, a binary .mlsetup or WolvenKit .json on disk, or
// a file in a project. Reads it, finds its mask set, lays out its colors, and describes it. The setup
// editor and the MCP tool mat_describe both use this.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { BridgeClient } from "./bridgeClient";
import type { Library } from "./library";
import { compositeSetup, loadMaskSet, maskSetsBeside, rankMaskSets, type MaskSet, type MaskSource } from "./masks";
import { describeSetup, parseSetup, type Setup, type SetupInfo } from "./setup";

/** A setup's source. A file may carry the game path it stands for (a project copy, or one taken from a mod archive). */
export type SetupSource = { gamePath: string } | { file: string; gamePath?: string };

export interface OpenedSetup {
  source: SetupSource;
  setup: Setup;
  info: SetupInfo;
  masks?: MaskSet;
  /** How the mask set was chosen. */
  maskFrom?: "given" | "beside";
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

/** Mask sets that could go with a setup: .mlmask files beside it on disk, then in its game folder. */
async function maskChoicesFor(bridge: BridgeClient | undefined, source: SetupSource): Promise<string[]> {
  const out: string[] = [];
  if ("file" in source) {
    const dir = path.dirname(source.file);
    try {
      out.push(...rankMaskSets(source.file, fs.readdirSync(dir).filter((f) => /\.mlmask$/i.test(f)).map((f) => path.join(dir, f))));
    } catch {
      // A folder we cannot list has no masks to offer.
    }
  }
  const gamePath = "gamePath" in source ? source.gamePath : gamePathInProject(source.file);
  if (bridge && gamePath) out.push(...(await maskSetsBeside(bridge, gamePath)));
  return out;
}

const asMaskSource = (choice: string): MaskSource => (/^[a-z]:\\|^\\\\|^\//i.test(choice) ? { file: choice } : { gamePath: choice });

/**
 * Opens a setup: reads it, takes `mask` or the best mask set beside it, writes its color map into the
 * cache under `dir`, and describes it in plain words. A mask that cannot be read leaves the rest working.
 */
export async function openSetup(bridge: BridgeClient | undefined, lib: Library | undefined, dir: string, source: SetupSource, mask?: string): Promise<OpenedSetup> {
  const setup = await readSetup(bridge, source);
  const maskChoices = await maskChoicesFor(bridge, source).catch(() => [] as string[]);
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
    maskError = "No mask set found beside this setup. Choose one to see where each layer shows.";
  }

  // First without shares, to know which layers show and their colors; then with them.
  let info = describeSetup(setup, lib, masks?.count);
  let composite: OpenedSetup["composite"];
  if (masks) {
    const stamp = "file" in source && fs.existsSync(source.file) ? fs.statSync(source.file).mtimeMs : "";
    const id = "file" in source ? source.file : source.gamePath;
    const layers = info.layers.map((l) => ({ shown: l.shown, hex: l.color?.hex ?? "#808080", opacity: l.raw.opacity }));
    const key = crypto.createHash("sha1").update(JSON.stringify([id, stamp, masks.files[0], layers])).digest("hex").slice(0, 20);
    const file = path.join(dir, "setups", `${key}.png`);
    const c = compositeSetup(masks, layers, file);
    composite = { file, pick: c.pick };
    info = describeSetup(setup, lib, masks.count, c.shares);
  }
  return { source, setup, info, masks, maskFrom: masks ? (mask ? "given" : "beside") : undefined, maskChoices, maskError, composite };
}
