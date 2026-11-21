// The bake (M5; design, "Phases"): a layered material's look as the game draws it, as plain maps in the
// mesh's UV space. This first part is the color. Each layer's surface texture, tiled, under its color
// preset, mixed through the layers' coverage (masks and microblends, masks.ts), all in linear light.
//
// Hypotheses, to check against in-game screenshots (behavior spec, section 5):
// - Preset colors are linear. First evidence 2026-11-16: the Cowboy hat's felt preset, 0.465 grey,
//   shows light grey in the game (182 of 255 read as linear, 119 as a screen value).
// - A surface's color texture is detail around a neutral middle: the three measured on 2026-11-16 (felt,
//   plastic, croc leather) average 186 to 188 of 255, 0.5 in linear. So color = preset × 2 × texture.
// - The tiling is the layer's matTile times the surface's own multiplier (describeSetup's `tiling`).
// Not used yet: colorMaskLevels, ratio, roughness, metal and normals (later parts of the bake).
// Surface textures come from the user's game through REDbridge and are cached under `dir`; nothing here
// ships with EDGEmat.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { PNG } from "pngjs";
import type { BridgeClient } from "./bridgeClient";
import { wholeTexture, wholeTextureFile } from "./images";
import type { Library } from "./library";
import { coverage, MaskSize } from "./masks";
import { readMicroblend } from "./microblend";
import type { OpenedSetup } from "./openSetup";

/** The baked map's side, in pixels. */
export const BakeSize = 1024;
/** Surface textures are read at most this size on a side. */
const TextureSide = 512;
/** What no layer covers: a dark grey, as the flat color map shows it. */
const Uncovered = 0.12;

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const toScreen = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

/** A surface texture in linear light, with its smaller versions for distant (finely tiled) sampling. */
interface Mips {
  levels: { size: number; rgb: Float32Array }[];
}

const mipsRead = new Map<string, Mips | null>();

/** Box-filtered halves down to one pixel. The texture is made square by sampling, which tiling hides. */
function makeMips(png: PNG): Mips {
  let size = 1;
  while (size * 2 <= Math.min(png.width, png.height)) size *= 2;
  const rgb = new Float32Array(size * size * 3);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const sx = Math.floor((x * png.width) / size), sy = Math.floor((y * png.height) / size);
    const o = (sy * png.width + sx) * 4;
    for (let k = 0; k < 3; k++) rgb[(y * size + x) * 3 + k] = toLinear(png.data[o + k] / 255);
  }
  const levels = [{ size, rgb }];
  while (levels[levels.length - 1].size > 1) {
    const prev = levels[levels.length - 1], s = prev.size / 2, next = new Float32Array(s * s * 3);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) for (let k = 0; k < 3; k++) {
      const at = (dx: number, dy: number) => prev.rgb[((y * 2 + dy) * prev.size + x * 2 + dx) * 3 + k];
      next[(y * s + x) * 3 + k] = (at(0, 0) + at(1, 0) + at(0, 1) + at(1, 1)) / 4;
    }
    levels.push({ size: s, rgb: next });
  }
  return { levels };
}

/** A cached surface texture, or undefined when it is not cached yet (loadSurfaceTextures) or unreadable. */
function readSurfaceTexture(dir: string, gamePath: string): Mips | undefined {
  const file = wholeTextureFile(dir, { gamePath }, TextureSide);
  if (mipsRead.has(file)) return mipsRead.get(file) ?? undefined;
  if (!fs.existsSync(file)) return undefined;
  let mips: Mips | null = null;
  try {
    mips = makeMips(PNG.sync.read(fs.readFileSync(file)));
  } catch {
    // Drawn with a neutral texture instead.
  }
  mipsRead.set(file, mips);
  return mips ?? undefined;
}

/** The surface color textures of these templates (game paths), cached for bakeColor. One that fails is left out. */
export async function loadSurfaceTextures(bridge: BridgeClient, lib: Library | undefined, dir: string, templates: string[]): Promise<void> {
  const byPath = new Map((lib?.templates ?? []).map((t) => [t.path.toLowerCase(), t]));
  for (const t of new Set(templates.map((p) => p.toLowerCase()))) {
    const texture = byPath.get(t)?.textures.color;
    if (!texture) continue;
    await wholeTexture(bridge, dir, { gamePath: texture }, TextureSide).catch(() => undefined);
  }
}

/** Bilinear sample of a mip level at texture coordinates (u, v), wrapping. Writes into `out`. */
function sample(level: Mips["levels"][number], u: number, v: number, out: number[]): void {
  const s = level.size;
  const fx = (u - Math.floor(u)) * s - 0.5, fy = (v - Math.floor(v)) * s - 0.5;
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  const wrap = (i: number) => ((i % s) + s) % s;
  const a = (wrap(y0) * s + wrap(x0)) * 3, b = (wrap(y0) * s + wrap(x0 + 1)) * 3;
  const c = (wrap(y0 + 1) * s + wrap(x0)) * 3, d = (wrap(y0 + 1) * s + wrap(x0 + 1)) * 3;
  const r = level.rgb;
  for (let k = 0; k < 3; k++) out[k] = (r[a + k] * (1 - tx) + r[b + k] * tx) * (1 - ty) + (r[c + k] * (1 - tx) + r[d + k] * tx) * ty;
}

/** Bilinear sample of a MaskSize weight map at UV (u, v), clamped at the edges. */
function weightAt(w: Float32Array, u: number, v: number): number {
  const fx = Math.min(MaskSize - 1, Math.max(0, u * MaskSize - 0.5)), fy = Math.min(MaskSize - 1, Math.max(0, v * MaskSize - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(MaskSize - 1, x0 + 1), y1 = Math.min(MaskSize - 1, y0 + 1);
  const tx = fx - x0, ty = fy - y0;
  return (w[y0 * MaskSize + x0] * (1 - tx) + w[y0 * MaskSize + x1] * tx) * (1 - ty) + (w[y1 * MaskSize + x0] * (1 - tx) + w[y1 * MaskSize + x1] * tx) * ty;
}

/**
 * The setup's color as the game draws it (hypotheses above), BakeSize square in texture space, written to
 * the cache under `dir`. Undefined without a mask set. Surface textures not cached yet (loadSurfaceTextures)
 * are drawn neutral, so the colors still come out right, without their grain.
 */
export function bakeColor(o: OpenedSetup, lib: Library | undefined, dir: string): string | undefined {
  const { masks, setup, info } = o;
  if (!masks) return undefined;
  lib ??= o.templates;
  const byPath = new Map((lib?.templates ?? []).map((t) => [t.path.toLowerCase(), t]));
  const layers = info.layers.map((l, i) => {
    const r = setup.layers[i];
    const mb = l.shown ? readMicroblend(dir, r.microblend) : undefined;
    const texture = byPath.get(r.material.toLowerCase())?.textures.color;
    return {
      shown: l.shown,
      opacity: r.opacity,
      microblend: mb && { mask: mb, tile: r.mbTile, offsetU: r.microblendOffsetU, offsetV: r.microblendOffsetV },
      // A color the surface lacks shows white in the game (in-game test R1-A); describeSetup gives it as 1, 1, 1.
      color: (l.color?.rgb ?? [0.5, 0.5, 0.5]).map((c) => Math.max(0, c)),
      tiling: l.tiling || 1,
      offset: [r.offsetU, r.offsetV],
      texture,
      mips: texture ? readSurfaceTexture(dir, texture) : undefined,
    };
  });

  const stamp = "file" in o.source && fs.existsSync(o.source.file) ? fs.statSync(o.source.file).mtimeMs : "";
  const id = "file" in o.source ? o.source.file : o.source.gamePath;
  const key = crypto.createHash("sha1")
    .update(JSON.stringify(["bake-color-1", id, stamp, masks.files[0], layers.map((l) => [l.shown, l.opacity, l.color, l.tiling, l.offset, l.texture, !!l.mips, l.microblend && [setup.layers[layers.indexOf(l)].microblend, l.microblend.tile, l.microblend.offsetU, l.microblend.offsetV, l.microblend.mask.size]])]))
    .digest("hex").slice(0, 20);
  const file = path.join(dir, "bakes", `${key}.color.png`);
  if (fs.existsSync(file)) return file;

  const { weights, remain } = coverage(masks, layers);
  const S = BakeSize;
  const rgb = new Float32Array(S * S * 3);
  const texel = [0, 0, 0];
  for (const [i, w] of weights) {
    const l = layers[i];
    const mips = l.mips;
    // The mip level whose texels are about one baked pixel: the tiling spreads the texture over fewer pixels.
    const level = mips ? mips.levels[Math.min(mips.levels.length - 1, Math.max(0, Math.round(Math.log2((l.tiling * mips.levels[0].size) / S))))] : undefined;
    for (let y = 0; y < S; y++) {
      const v = (y + 0.5) / S;
      for (let x = 0; x < S; x++) {
        const u = (x + 0.5) / S;
        const cw = weightAt(w, u, v);
        if (cw <= 0) continue;
        if (level) sample(level, u * l.tiling + l.offset[0], v * l.tiling + l.offset[1], texel);
        else texel[0] = texel[1] = texel[2] = 0.5;
        const p = (y * S + x) * 3;
        for (let k = 0; k < 3; k++) rgb[p + k] += cw * l.color[k] * 2 * texel[k];
      }
    }
  }
  const out = new PNG({ width: S, height: S });
  const grey = toLinear(Uncovered);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const p = y * S + x;
    const left = weightAt(remain, (x + 0.5) / S, (y + 0.5) / S);
    for (let k = 0; k < 3; k++) out.data[p * 4 + k] = Math.round(toScreen(Math.min(1, rgb[p * 3 + k] + left * grey)) * 255);
    out.data[p * 4 + 3] = 255;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(out));
  return file;
}
