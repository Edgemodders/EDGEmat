// Mask sets (.mlmask): one greyscale mask per layer, white where the layer shows (behavior spec,
// section 4). Exported through REDbridge (WolvenKit's export writes one PNG per layer), scaled to 512
// px and cached. From the masks and each layer's color, a flat color map of the setup in the garment's
// texture (UV) space, each layer's share of it, and which layer shows where.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { PNG } from "pngjs";
import type { BridgeClient } from "./bridgeClient";
import { writeThumbnail } from "./thumbnail";

export const MaskSize = 512;
/** The pick map's side: which layer shows, sampled on a grid this size. */
export const PickSize = 128;

export type MaskSource = { gamePath: string } | { file: string };

export interface MaskSet {
  /** The game path or file of the .mlmask. */
  source: MaskSource;
  name: string;
  count: number;
  /** One 512 px greyscale PNG per layer, in layer order. */
  files: string[];
}

const sourceText = (s: MaskSource) => ("gamePath" in s ? s.gamePath : s.file);

/** The .mlmask files in a game folder, best match for the setup's file name first. */
export async function maskSetsBeside(bridge: BridgeClient, setupGamePath: string): Promise<string[]> {
  const folder = setupGamePath.slice(0, setupGamePath.lastIndexOf("\\") + 1);
  if (!folder) return [];
  const r = await bridge.search(folder, 500);
  const masks = r.items.map((i) => i.name).filter((n) => n.toLowerCase().endsWith(".mlmask") && n.toLowerCase().startsWith(folder.toLowerCase()));
  return rankMaskSets(setupGamePath, masks);
}

/** Mask set paths ranked by how much of their name they share with the setup's: ml_x_red.mlsetup goes with ml_x_masksset.mlmask. */
export function rankMaskSets(setupPath: string, masks: string[]): string[] {
  const base = (p: string) => (p.split(/[\\/]/).pop() ?? p).toLowerCase().replace(/\.[^.]+$/, "").replace(/_masksset$/, "");
  const s = base(setupPath);
  const common = (m: string) => {
    const b = base(m);
    let i = 0;
    while (i < b.length && i < s.length && b[i] === s[i]) i++;
    return i;
  };
  return [...new Set(masks)].sort((a, b) => common(b) - common(a) || a.localeCompare(b));
}

/** The masks of a mask set, exported once and cached under `dir`\masks. */
export async function loadMaskSet(bridge: BridgeClient, dir: string, source: MaskSource): Promise<MaskSet> {
  const text = sourceText(source);
  const stamp = "file" in source ? `${fs.statSync(source.file).mtimeMs}` : "";
  const key = crypto.createHash("sha1").update(`${text.toLowerCase()}:${stamp}`).digest("hex").slice(0, 20);
  const out = path.join(dir, "masks", key);
  const name = (text.split(/[\\/]/).pop() ?? text).replace(/\.mlmask$/i, "");
  const meta = path.join(out, "maskset.json");
  if (fs.existsSync(meta)) {
    const files = (JSON.parse(fs.readFileSync(meta, "utf8")) as { files: string[] }).files.map((f) => path.join(out, f));
    if (files.every((f) => fs.existsSync(f))) return { source, name, count: files.length, files };
  }

  // WolvenKit exports a file that sits in an archive folder; give it one, then export into a raw folder.
  fs.mkdirSync(dir, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(dir, "tmp-mask-"));
  try {
    const archive = path.join(tmp, "archive"), raw = path.join(tmp, "raw");
    const file = path.join(archive, `${name}.mlmask`);
    fs.mkdirSync(archive, { recursive: true });
    if ("gamePath" in source) await bridge.extract(source.gamePath, file);
    else fs.copyFileSync(source.file, file);
    const result = await bridge.exportFile(file, archive, raw);
    const pngs = result.written
      .map((w) => ({ w, i: Number(w.match(/_(\d+)\.png$/i)?.[1]) }))
      .filter((x) => Number.isInteger(x.i))
      .sort((a, b) => a.i - b.i);
    if (!pngs.length) throw new Error(`No mask images came back from ${text}.`);
    fs.mkdirSync(out, { recursive: true });
    const files: string[] = [];
    for (const { w, i } of pngs) {
      const f = `${i}.png`;
      writeThumbnail(path.isAbsolute(w) ? w : path.join(raw, w), path.join(out, f), MaskSize, "relief", "none");
      files.push(f);
    }
    fs.writeFileSync(meta, JSON.stringify({ source: text, files }));
    return { source, name, count: files.length, files: files.map((f) => path.join(out, f)) };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

export interface CompositeLayer {
  shown: boolean;
  /** #rrggbb */
  hex: string;
  opacity: number;
}

export interface Composite {
  /** Each layer's share of the texture where it is what shows, 0 to 1. */
  shares: number[];
  /** PickSize × PickSize, row by row: the index of the layer that shows most at each point. */
  pick: number[];
}

/**
 * Lays each shown layer's color over the ones below through its mask (opacity up to 1) and writes the
 * result to `outFile`: flat colors in texture space, not the game's look. Layers without a mask are left out.
 */
export function compositeSetup(masks: MaskSet, layers: CompositeLayer[], outFile: string): Composite {
  const n = MaskSize * MaskSize;
  const read = (f: string) => {
    const png = PNG.sync.read(fs.readFileSync(f));
    const m = new Float32Array(n);
    for (let i = 0; i < n; i++) m[i] = png.data[i * 4] / 255;
    return m;
  };
  const used = layers.map((l, i) => (l.shown && i < masks.files.length ? i : -1)).filter((i) => i >= 0);
  const mask = new Map(used.map((i) => [i, read(masks.files[i])]));
  const rgb = new Float32Array(n * 3);
  const remain = new Float32Array(n).fill(1);
  const shares = layers.map(() => 0);
  const best = new Float32Array(PickSize * PickSize);
  const pick = new Array<number>(PickSize * PickSize).fill(-1);
  const step = MaskSize / PickSize;

  // Top layer first: each takes what the layers above leave.
  for (const i of [...used].reverse()) {
    const m = mask.get(i)!;
    const o = Math.min(1, Math.max(0, layers[i].opacity));
    const hex = layers[i].hex;
    const c = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16) / 255);
    let sum = 0;
    for (let p = 0; p < n; p++) {
      const w = m[p] * o * remain[p];
      if (w <= 0) continue;
      remain[p] -= w;
      sum += w;
      rgb[p * 3] += c[0] * w; rgb[p * 3 + 1] += c[1] * w; rgb[p * 3 + 2] += c[2] * w;
      const y = Math.floor(p / MaskSize), x = p % MaskSize;
      if (y % step === step / 2 && x % step === step / 2) {
        const q = (y - step / 2) / step * PickSize + (x - step / 2) / step;
        if (w > best[q]) { best[q] = w; pick[q] = i; }
      }
    }
    shares[i] = sum / n;
  }

  const out = new PNG({ width: MaskSize, height: MaskSize });
  for (let p = 0; p < n; p++) {
    // Whatever no layer covers stays a neutral dark grey.
    for (let k = 0; k < 3; k++) out.data[p * 4 + k] = Math.round(Math.min(1, rgb[p * 3 + k] + remain[p] * 0.12) * 255);
    out.data[p * 4 + 3] = 255;
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, PNG.sync.write(out));
  return { shares, pick };
}
