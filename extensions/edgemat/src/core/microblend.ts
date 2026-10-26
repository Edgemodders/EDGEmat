// A microblend's mask (its alpha channel), for the color map. A layer shows where its own mask and the
// microblend's mask add up to more than 1 (spec, section 5). Measured 2026-10-26 on the slim-fits'
// leather setup against the game: its piping mask sits near 0.65 with the default microblend (a flat
// 0.41) and shows solid; its denim mask sits near 0.55 with lint_01 (black but for specks) and hardly
// shows. Exported through REDbridge once and cached under `dir`\microblends. Nothing here ships with EDGEmat.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { PNG } from "pngjs";
import type { BridgeClient } from "./bridgeClient";

export interface MicroblendMask {
  /** Width and height; 1 for a flat microblend. */
  size: number;
  /** 0 to 255, row by row. */
  alpha: Uint8Array;
}

const Folder = "microblends";
const MaxSide = 1024;
const read = new Map<string, MicroblendMask | null>();

const fileFor = (dir: string, gamePath: string) =>
  path.join(dir, Folder, crypto.createHash("sha1").update(gamePath.toLowerCase()).digest("hex").slice(0, 20) + ".png");

/** A cached microblend mask, or undefined when it is not cached yet (or could not be read). */
export function readMicroblend(dir: string, gamePath: string): MicroblendMask | undefined {
  if (!gamePath) return undefined;
  const file = fileFor(dir, gamePath);
  if (read.has(file)) return read.get(file) ?? undefined;
  if (!fs.existsSync(file)) return undefined;
  const png = PNG.sync.read(fs.readFileSync(file));
  const alpha = new Uint8Array(png.width * png.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = png.data[i * 4];
  const mask = { size: png.width, alpha };
  read.set(file, mask);
  return mask;
}

/** Exports and caches the masks of these microblends (game paths) that are not cached yet. One that fails is left out. */
export async function loadMicroblends(bridge: BridgeClient, dir: string, gamePaths: string[]): Promise<void> {
  for (const gamePath of new Set(gamePaths.filter(Boolean))) {
    const file = fileFor(dir, gamePath);
    if (fs.existsSync(file)) continue;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp-${process.pid}.png`;
    try {
      await bridge.toPng(gamePath, tmp);
      const src = PNG.sync.read(fs.readFileSync(tmp));
      // Every n-th texel at most MaxSide on a side; a flat one is kept as one pixel.
      const step = Math.max(1, Math.ceil(Math.max(src.width, src.height) / MaxSide));
      const w = Math.floor(src.width / step), h = Math.floor(src.height / step), side = Math.min(w, h);
      const a = (x: number, y: number) => src.data[(y * step * src.width + x * step) * 4 + 3];
      const first = a(0, 0);
      let flat = true;
      for (let y = 0; y < side && flat; y++) for (let x = 0; x < side; x++) if (a(x, y) !== first) { flat = false; break; }
      const size = flat ? 1 : side;
      const out = new PNG({ width: size, height: size });
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const o = (y * size + x) * 4, v = a(x, y);
        out.data[o] = out.data[o + 1] = out.data[o + 2] = v;
        out.data[o + 3] = 255;
      }
      fs.writeFileSync(file, PNG.sync.write(out));
    } catch {
      // Without its mask the layer is drawn by its own mask alone.
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }
}
