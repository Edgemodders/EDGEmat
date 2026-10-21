// Image work for Generate a material (design, "Generate a material", steps 2 to 4): an image made
// seamless, resized, laid out N × N for a garment, and the bumps (normal) and shine (roughness) maps
// derived from it. Plain RGBA in memory, read and written as PNG.

import { PNG } from "pngjs";

export interface Image {
  width: number;
  height: number;
  /** RGBA, 8 bits a channel, rows top to bottom. */
  data: Uint8Array;
}

export function readPng(bytes: Buffer): Image {
  const p = PNG.sync.read(bytes);
  return { width: p.width, height: p.height, data: new Uint8Array(p.data.buffer, p.data.byteOffset, p.data.length) };
}

export function writePng(img: Image): Buffer {
  const p = new PNG({ width: img.width, height: img.height });
  p.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length);
  return PNG.sync.write(p);
}

const blank = (width: number, height: number): Image => ({ width, height, data: new Uint8Array(width * height * 4) });
const clamp8 = (x: number) => (x < 0 ? 0 : x > 255 ? 255 : Math.round(x));
const mod = (a: number, n: number) => ((a % n) + n) % n;

/** The largest centred square of an image. */
export function squareCrop(img: Image): Image {
  const s = Math.min(img.width, img.height);
  if (img.width === s && img.height === s) return img;
  const ox = Math.floor((img.width - s) / 2), oy = Math.floor((img.height - s) / 2);
  const out = blank(s, s);
  for (let y = 0; y < s; y++) out.data.set(img.data.subarray(((oy + y) * img.width + ox) * 4, ((oy + y) * img.width + ox + s) * 4), y * s * 4);
  return out;
}

/** One axis of a resize: each output sample averages the source span it covers (area), or blends its two neighbours when growing. */
function resample1(src: Float32Array, n: number, m: number, out: Float32Array, wrap: boolean): void {
  if (m <= n) {
    const step = n / m;
    for (let i = 0; i < m; i++) {
      const a = i * step, b = a + step;
      let sum = 0;
      for (let j = Math.floor(a); j < Math.ceil(b); j++) {
        const w = Math.min(b, j + 1) - Math.max(a, j);
        sum += src[j] * w;
      }
      out[i] = sum / step;
    }
    return;
  }
  for (let i = 0; i < m; i++) {
    const x = ((i + 0.5) * n) / m - 0.5;
    const j = Math.floor(x), f = x - j;
    const at = (k: number) => src[wrap ? mod(k, n) : Math.min(n - 1, Math.max(0, k))];
    out[i] = at(j) * (1 - f) + at(j + 1) * f;
  }
}

/** Resized to width × height. `wrap` samples across the edges, for a seamless image. */
export function resize(img: Image, width: number, height: number, wrap = true): Image {
  if (img.width === width && img.height === height) return img;
  const mid = new Float32Array(width * img.height * 4);
  const row = new Float32Array(img.width), rowOut = new Float32Array(width);
  for (let y = 0; y < img.height; y++) {
    for (let c = 0; c < 4; c++) {
      for (let x = 0; x < img.width; x++) row[x] = img.data[(y * img.width + x) * 4 + c];
      resample1(row, img.width, width, rowOut, wrap);
      for (let x = 0; x < width; x++) mid[(y * width + x) * 4 + c] = rowOut[x];
    }
  }
  const out = blank(width, height);
  const col = new Float32Array(img.height), colOut = new Float32Array(height);
  for (let x = 0; x < width; x++) {
    for (let c = 0; c < 4; c++) {
      for (let y = 0; y < img.height; y++) col[y] = mid[(y * width + x) * 4 + c];
      resample1(col, img.height, height, colOut, wrap);
      for (let y = 0; y < height; y++) out.data[(y * width + x) * 4 + c] = clamp8(colOut[y]);
    }
  }
  return out;
}

/**
 * The image made to tile: near each edge it fades into a copy shifted by half (whose middle is
 * continuous across the wrap), first across, then down. The blend keeps the image's contrast
 * (variance-preserving), so the edges do not turn grey. `band` is the width of the fade, as a share
 * of the image.
 */
export function makeSeamless(img: Image, band = 0.25): Image {
  const pass = (src: Image, across: boolean): Image => {
    const { width: w, height: h } = src;
    const mean = [0, 0, 0];
    for (let i = 0; i < w * h; i++) for (let c = 0; c < 3; c++) mean[c] += src.data[i * 4 + c];
    for (let c = 0; c < 3; c++) mean[c] /= w * h;
    const n = across ? w : h, b = Math.max(1, band * n);
    const out = blank(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const k = across ? x : y;
        const t = Math.min(1, Math.min(k, n - 1 - k) / b);
        const wa = t * t * (3 - 2 * t), wb = 1 - wa;
        const sx = across ? mod(x + Math.floor(w / 2), w) : x, sy = across ? y : mod(y + Math.floor(h / 2), h);
        const i = (y * w + x) * 4, j = (sy * w + sx) * 4;
        // Halfway between a plain blend (greys out) and a fully variance-preserving one (overshoots on sharp pictures).
        const norm = Math.sqrt(1 / Math.sqrt(wa * wa + wb * wb));
        for (let c = 0; c < 3; c++) out.data[i + c] = clamp8(mean[c] + (wa * (src.data[i + c] - mean[c]) + wb * (src.data[j + c] - mean[c])) * norm);
        out.data[i + 3] = 255;
      }
    }
    return out;
  };
  return pass(pass(img, true), false);
}

/** The image laid out `n` × `n` in a `size` px square: the repeat baked into one texture. */
export function repeat(img: Image, n: number, size: number): Image {
  const cell = Math.max(1, Math.round(size / n));
  const tile = resize(img, cell, cell);
  const out = blank(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = ((y % cell) * cell + (x % cell)) * 4;
      out.data.set(tile.data.subarray(i, i + 4), (y * size + x) * 4);
    }
  }
  return out;
}

/** Each pixel's brightness, 0 to 1. */
function heights(img: Image): Float32Array {
  const h = new Float32Array(img.width * img.height);
  for (let i = 0; i < h.length; i++) h[i] = (0.2126 * img.data[i * 4] + 0.7152 * img.data[i * 4 + 1] + 0.0722 * img.data[i * 4 + 2]) / 255;
  return h;
}

/**
 * A normal map from the image's brightness, read as height (bright is raised), across the wrap so it
 * tiles too. `strength` 0 is flat; 1 is a moderate relief. Green points up the image (unverified
 * against the game's convention: one flag flips it).
 */
export function normalMap(img: Image, strength = 1, greenUp = true): Image {
  const { width: w, height: h } = img;
  const raw = heights(img);
  // A light 3 × 3 blur, so single-pixel noise does not read as bumps.
  const hb = new Float32Array(raw.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += raw[mod(y + dy, h) * w + mod(x + dx, w)];
    hb[y * w + x] = s / 9;
  }
  const at = (x: number, y: number) => hb[mod(y, h) * w + mod(x, w)];
  // Scaled to the image size, so a 512 and a 2048 px image give the same relief.
  const k = strength * 8 * (w / 1024);
  const out = blank(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)) / 8;
      const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)) / 8;
      let nx = -dx * k, ny = (greenUp ? dy : -dy) * k, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const i = (y * w + x) * 4;
      out.data[i] = clamp8((nx * 0.5 + 0.5) * 255);
      out.data[i + 1] = clamp8((ny * 0.5 + 0.5) * 255);
      out.data[i + 2] = clamp8((nz * 0.5 + 0.5) * 255);
      out.data[i + 3] = 255;
    }
  }
  return out;
}

/**
 * A roughness map from the image: darker than its surroundings reads rougher (worn, in the grain),
 * brighter reads smoother. Grey, centred on mid-grey; the material's scale and bias set the overall
 * shine.
 */
export function roughnessMap(img: Image): Image {
  const lum = heights(img);
  let mean = 0;
  for (const v of lum) mean += v;
  mean /= lum.length;
  let varSum = 0;
  for (const v of lum) varSum += (v - mean) ** 2;
  const sd = Math.sqrt(varSum / lum.length) || 1;
  const out = blank(img.width, img.height);
  for (let i = 0; i < lum.length; i++) {
    const g = clamp8((0.5 + (0.25 * (mean - lum[i])) / sd) * 255);
    out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = g;
    out.data[i * 4 + 3] = 255;
  }
  return out;
}

/** How visible the image's wrap seam is: the mean colour difference across its edges against the mean step inside, about 1 for a tiling image. */
export function seamScore(img: Image): number {
  const { width: w, height: h, data } = img;
  const mx = Math.floor(w / 2), my = Math.floor(h / 2);
  const diff = (a: number, b: number) => Math.abs(data[a] - data[b]) + Math.abs(data[a + 1] - data[b + 1]) + Math.abs(data[a + 2] - data[b + 2]);
  let edge = 0, inner = 0;
  for (let y = 0; y < h; y++) {
    edge += diff((y * w + w - 1) * 4, y * w * 4);
    inner += diff((y * w + mx - 1) * 4, (y * w + mx) * 4);
  }
  for (let x = 0; x < w; x++) {
    edge += diff(((h - 1) * w + x) * 4, x * 4);
    inner += diff(((my - 1) * w + x) * 4, (my * w + x) * 4);
  }
  return edge / Math.max(1, inner);
}
