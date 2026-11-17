// Reshape: a garment's shape changed by words (design, "Reshape: a garment's shape changed by words").
// 1. Views: the garment drawn from its own mesh and look, front, left, back and right, as one picture.
// 2. Change: an image service changes that picture by words (OpenAI's GPT Image by default); a change
//    can build on the last one. 3. Model: Tripo makes a 3D model from the four changed views, then its
//    retopology brings it to a game's face count with the texture baked on. 4. Fit: the model placed on
//    the game's garment and imported over its mesh, with Tripo's texture as its material.
// Each step keeps its files in a work folder (`reshape.json` beside them), so the steps run apart: a
// player looks at the pictures, refines, and makes the model later. The fit is built here for Wardrobe
// Designer and moves to EDGEfab when that resumes (owner, 2026-11-02; EDGEfab #3). For now it fits
// garments that move with one bone (hats, helmets, glasses); other garments say so before Tripo is paid.

import * as fs from "node:fs";
import * as path from "node:path";
import { writeTexture, writeTexturedMaterial, applyMaterial } from "./apply";
import type { BridgeClient } from "./bridgeClient";
import { bbox, imageOf, primitives, readGlb, writeGlb, type Box, type Glb, type GlbPart } from "./glb";
import { editImage, type ServiceId } from "./imageServices";
import type { Library } from "./library";
import { readPng, resize, writePng, type Image } from "./maps";
import { imageAsPng, materialSlug } from "./material";
import { renderMaterials } from "./render";
import { bendOnto, carryOnto, coveredTriangles, tuckUnder, uvIslands } from "./transfer";
import { Tripo } from "./tripo";

type Vec3 = [number, number, number];
export type ViewName = "front" | "left" | "back" | "right";

export const ReshapeDefaults = {
  /** Pixels a side for each view; the four together are twice that. */
  size: 768,
  /** The image service and model for the pictures (owner, 2026-11-02: GPT Image drew the change alike from all sides). */
  service: "openai" as ServiceId,
  models: { openai: "gpt-image-2.5-sunburst", gemini: "gemini-3-pro-image" } as Record<ServiceId, string>,
  /** Tripo's geometry model for multiview to model. */
  tripoModel: "v3.1-20260211",
  /** The retopology's face count. */
  faces: 6000,
  /** Credits each Tripo task took on 2026-11-02, for the cost shown before Make it. */
  credits: { model: 30, retopology: 30 },
};

/** A mesh of the look, as the views drew it and the fit replaces it. */
export interface ReshapeMesh {
  mesh: string;
  appearance: string;
  /** The game's mesh as WolvenKit exported it, kept in the work folder. */
  glb: string;
  /** The material of each submesh in this appearance. */
  chunkMaterials: string[];
  /** The bones the mesh moves with. */
  bones: string[];
}

/** What the views step saved: `reshape.json` in the work folder. */
export interface ReshapeViews {
  work: string;
  /** The four views as one picture, two by two: front and left above, back and right below. */
  sheet: string;
  views: { view: ViewName; file: string }[];
  frame: { front: Vec3; center: Vec3; scale: number; size: number; box: Box };
  meshes: ReshapeMesh[];
  /** Whether step 4 can fit this garment yet, and why not. */
  fit: { ok: boolean; bone?: string; why?: string };
  /** The views' background: dark behind a light garment, white behind a dark one (none: white, before 2026-11-17). */
  background?: ReshapeBackground;
  /** The changes made so far, newest last. */
  changes: ReshapeChange[];
}

export type ReshapeBackground = "white" | "dark";

/** The views' background colors. Dark is not black, so a black garment's edge still shows. */
const Backgrounds: Record<ReshapeBackground, [number, number, number]> = { white: [255, 255, 255], dark: [26, 26, 28] };

export interface ReshapeChange {
  words: string;
  service: ServiceId;
  model: string;
  /** The changed picture, and its four views. */
  sheet: string;
  views: { view: ViewName; file: string }[];
  /** The change this one built on, by its sheet, or none for the game's look. */
  from?: string;
  /** Each view's outline before and after, in metres. */
  outline: { view: ViewName; before: [number, number]; after: [number, number] }[];
  made: string;
}

export interface ReshapeModel {
  task: string;
  /** Tripo's model, and its retopology (the one the fit uses). */
  model: string;
  low: string;
  preview?: string;
  credits: number;
}

export interface ReshapeFit {
  /** Every project file written, relative to the archive folder. */
  written: string[];
  mesh: string;
  /** What the made piece wears: the game's own materials (every look keeps its own), or Tripo's paint. */
  wears: "game" | "tripo";
  /** The material Tripo's paint went on, when it did. */
  material?: string;
  notes: string[];
  /** The fitted model drawn as the views, for a look before the game. */
  sheet: string;
}

export interface Project {
  /** The WolvenKit project's source\archive and source\raw folders. */
  archive: string;
  raw: string;
}

type Log = (line: string) => void;
const Up: Vec3 = [0, 1, 0];

// ---------- vectors ----------

const sub = (a: number[], b: number[]): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: number[], b: number[]): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: number[]): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** The axis a word like "+z" or "-x" names. */
export function axis(word: string): Vec3 {
  const m = /^([+-])?([xyz])$/i.exec(word);
  if (!m) throw new Error(`An axis is +x, -x, +z or -z, not ${word}`);
  const v: Vec3 = [0, 0, 0];
  v["xyz".indexOf(m[2].toLowerCase())] = m[1] === "-" ? -1 : 1;
  return v;
}

/** The four cameras, from the garment's centre. Left is the garment's own left side; facing `front` with up Y, its left is up x front. */
function cameras(front: Vec3): { view: ViewName; cam: Vec3 }[] {
  const left = cross(Up, front);
  return [
    { view: "front", cam: front },
    { view: "left", cam: left },
    { view: "back", cam: [-front[0], -front[1], -front[2]] },
    { view: "right", cam: [-left[0], -left[1], -left[2]] },
  ];
}

// ---------- drawing ----------

interface DrawPart {
  pos: Float64Array;
  nrm: Float64Array | null;
  uv: Float64Array | null;
  idx: Float64Array;
  texture?: Image;
}

/**
 * Draws parts orthographically from `cam` on `bg`: each texel from the part's color map, under a soft
 * studio light (a key light above the camera to its left, a fill from the right, and plenty of ambient
 * light). Drawn at twice the size and halved, for smooth edges. `scale` is pixels per metre. `lum` is the
 * garment's median brightness (0 to 255), for choosing the background.
 */
function draw(parts: DrawPart[], cam: Vec3, center: number[], scale: number, size: number, bg: readonly number[] = Backgrounds.white): Image & { lum: number } {
  const S = size * 2;
  const right = unit(cross(Up, cam));
  const key = unit([cam[0] * 0.8 - right[0] * 0.4, 0.6, cam[2] * 0.8 - right[2] * 0.4]);
  const fill = unit([cam[0] * 0.5 + right[0] * 0.8, 0.2, cam[2] * 0.5 + right[2] * 0.8]);
  const depth = new Float64Array(S * S).fill(-Infinity);
  const color = new Float64Array(S * S * 3);
  for (let i = 0; i < S * S; i++) color.set(bg, i * 3);
  const hist = new Float64Array(256);
  for (const p of parts) {
    const n = p.pos.length / 3;
    const sx = new Float64Array(n), sy = new Float64Array(n), sz = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      const d = sub([p.pos[k * 3], p.pos[k * 3 + 1], p.pos[k * 3 + 2]], center);
      sx[k] = S / 2 + dot(d, right) * scale * 2;
      sy[k] = S / 2 - dot(d, Up) * scale * 2;
      sz[k] = dot(d, cam);
    }
    const tex = p.texture;
    for (let t = 0; t < p.idx.length; t += 3) {
      const [a, b, c] = [p.idx[t], p.idx[t + 1], p.idx[t + 2]];
      const area = (sx[b] - sx[a]) * (sy[c] - sy[a]) - (sx[c] - sx[a]) * (sy[b] - sy[a]);
      if (Math.abs(area) < 1e-9) continue;
      const pa = [p.pos[a * 3], p.pos[a * 3 + 1], p.pos[a * 3 + 2]];
      const face = unit(cross(sub([p.pos[b * 3], p.pos[b * 3 + 1], p.pos[b * 3 + 2]], pa), sub([p.pos[c * 3], p.pos[c * 3 + 1], p.pos[c * 3 + 2]], pa)));
      const x0 = Math.max(0, Math.floor(Math.min(sx[a], sx[b], sx[c]))), x1 = Math.min(S - 1, Math.ceil(Math.max(sx[a], sx[b], sx[c])));
      const y0 = Math.max(0, Math.floor(Math.min(sy[a], sy[b], sy[c]))), y1 = Math.min(S - 1, Math.ceil(Math.max(sy[a], sy[b], sy[c])));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const px = x + 0.5, py = y + 0.5;
          const w0 = ((sx[b] - px) * (sy[c] - py) - (sx[c] - px) * (sy[b] - py)) / area;
          const w1 = ((sx[c] - px) * (sy[a] - py) - (sx[a] - px) * (sy[c] - py)) / area;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const z = w0 * sz[a] + w1 * sz[b] + w2 * sz[c];
          const i = y * S + x;
          if (z <= depth[i]) continue;
          depth[i] = z;
          let nn: Vec3 = face;
          if (p.nrm) nn = unit([0, 1, 2].map((q) => w0 * p.nrm![a * 3 + q] + w1 * p.nrm![b * 3 + q] + w2 * p.nrm![c * 3 + q]));
          if (dot(nn, cam) < 0) nn = [-nn[0], -nn[1], -nn[2]];
          // A soft studio light, bright enough that nothing reads as dark: the shading shows the image
          // service and Tripo the form, while the colors stay near the game's. Tripo's paint keeps some of
          // it (2026-11-16: under a harder light the made hat came out darker at the sides), which matters
          // only when the made piece wears Tripo's paint; by default it wears the game's materials.
          const shade = 0.62 + 0.42 * Math.max(0, dot(nn, key)) + 0.12 * Math.max(0, dot(nn, fill));
          let rgb = [150, 150, 150];
          if (tex && p.uv) {
            let u = w0 * p.uv[a * 2] + w1 * p.uv[b * 2] + w2 * p.uv[c * 2];
            let v = w0 * p.uv[a * 2 + 1] + w1 * p.uv[b * 2 + 1] + w2 * p.uv[c * 2 + 1];
            u -= Math.floor(u);
            v -= Math.floor(v);
            const tx = Math.min(tex.width - 1, Math.floor(u * tex.width)), ty = Math.min(tex.height - 1, Math.floor(v * tex.height));
            const o = (ty * tex.width + tx) * 4;
            rgb = [tex.data[o], tex.data[o + 1], tex.data[o + 2]];
          }
          for (let q = 0; q < 3; q++) color[i * 3 + q] = Math.min(255, rgb[q] * shade);
        }
      }
    }
  }
  for (let i = 0; i < S * S; i++) if (depth[i] > -Infinity) hist[Math.round(0.2126 * color[i * 3] + 0.7152 * color[i * 3 + 1] + 0.0722 * color[i * 3 + 2])]++;
  const total = hist.reduce((a, b) => a + b, 0);
  let lum = 0;
  for (let s = 0; lum < 255 && s + hist[lum] < total / 2; lum++) s += hist[lum];
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      for (let q = 0; q < 3; q++) {
        let s = 0;
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) s += color[((y * 2 + dy) * S + x * 2 + dx) * 3 + q];
        out[(y * size + x) * 4 + q] = Math.round(s / 4);
      }
      out[(y * size + x) * 4 + 3] = 255;
    }
  }
  return { width: size, height: size, data: out, lum };
}

/** Four square pictures as one, two by two, in the cameras' order. */
function grid(images: Image[]): Image {
  const s = images[0].width;
  const out = new Uint8Array(s * 2 * s * 2 * 4);
  images.forEach((img, i) => {
    const ox = (i % 2) * s, oy = Math.floor(i / 2) * s;
    for (let y = 0; y < s; y++) out.set(img.data.subarray(y * s * 4, (y + 1) * s * 4), ((oy + y) * s * 2 + ox) * 4);
  });
  return { width: s * 2, height: s * 2, data: out };
}

/** The four quarters of a picture, in the grid's order, each scaled to `size`. */
function cut(img: Image, size: number): Image[] {
  const hw = Math.floor(img.width / 2), hh = Math.floor(img.height / 2);
  return [0, 1, 2, 3].map((i) => {
    const ox = (i % 2) * hw, oy = Math.floor(i / 2) * hh;
    const data = new Uint8Array(hw * hh * 4);
    for (let y = 0; y < hh; y++) data.set(img.data.subarray(((oy + y) * img.width + ox) * 4, ((oy + y) * img.width + ox + hw) * 4), y * hw * 4);
    const q = { width: hw, height: hh, data };
    return hw === size && hh === size ? q : resize(q, size, size, false);
  });
}

/**
 * The box of a picture's garment, in pixels: what differs from its background, read from its corners (the
 * views' own white or dark, or near it in a picture an image service made).
 */
function outline(img: Image): { x0: number; y0: number; x1: number; y1: number; w: number; h: number } | undefined {
  const corner: number[][] = [];
  const m = Math.max(1, Math.floor(img.width / 64));
  for (const [cx, cy] of [[0, 0], [img.width - m, 0], [0, img.height - m], [img.width - m, img.height - m]]) {
    for (let y = cy; y < cy + m; y++) for (let x = cx; x < cx + m; x++) {
      const o = (y * img.width + x) * 4;
      corner.push([img.data[o], img.data[o + 1], img.data[o + 2]]);
    }
  }
  const bg = [0, 1, 2].map((q) => corner.map((c) => c[q]).sort((a, b) => a - b)[Math.floor(corner.length / 2)]);
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const o = (y * img.width + x) * 4;
      if (Math.abs(img.data[o] - bg[0]) < 12 && Math.abs(img.data[o + 1] - bg[1]) < 12 && Math.abs(img.data[o + 2] - bg[2]) < 12) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return x1 < 0 ? undefined : { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** The background a picture is shown on in a dark window (REDnode's HUD look). */
export const ReshapeDark = [12, 14, 18] as const;

/**
 * A copy of a reshape picture for a dark window: the white background around the garment, flooded in
 * from the picture's edges, turned dark, and the light fringe at the garment's edge blended into it. The
 * picture itself keeps its background, which the image service is asked to keep and the fit reads the
 * outline against; a picture already on the views' dark background is copied as it is. Written beside it
 * as `<name>.dark.png` (again only when the picture is newer).
 */
export function reshapeOnDark(sheet: string): string {
  const out = sheet.replace(/\.png$/i, "") + ".dark.png";
  if (fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(sheet).mtimeMs) return out;
  const img = readPng(fs.readFileSync(sheet));
  const { width: W, height: H, data } = img;
  // A picture on the views' dark background has nothing to flood: the white flood below finds no seed.
  const light = (i: number) => Math.min(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
  const bg = new Uint8Array(W * H);
  const stack: number[] = [];
  const seed = (i: number) => {
    if (!bg[i] && light(i) > 225) (bg[i] = 1), stack.push(i);
  };
  for (let x = 0; x < W; x++) seed(x), seed((H - 1) * W + x);
  for (let y = 0; y < H; y++) seed(y * W), seed(y * W + W - 1);
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % W;
    if (x > 0) seed(i - 1);
    if (x < W - 1) seed(i + 1);
    if (i >= W) seed(i - W);
    if (i < (H - 1) * W) seed(i + W);
  }
  const dark = new Uint8Array(data);
  for (let i = 0; i < W * H; i++) {
    let t = 0;
    if (bg[i]) t = 1;
    else {
      const x = i % W;
      const near = (x > 0 && bg[i - 1]) || (x < W - 1 && bg[i + 1]) || (i >= W && bg[i - W]) || (i < (H - 1) * W && bg[i + W]);
      if (near && light(i) > 160) t = (light(i) - 160) / 95;
    }
    if (t) for (let q = 0; q < 3; q++) dark[i * 4 + q] = Math.round(data[i * 4 + q] * (1 - t) + ReshapeDark[q] * t);
    dark[i * 4 + 3] = 255;
  }
  fs.writeFileSync(out, writePng({ width: W, height: H, data: dark }));
  return out;
}

// ---------- the work folder ----------

const stateFile = (work: string) => path.join(work, "reshape.json");

/** The views step's record in a work folder, or undefined when there is none. */
export function loadReshape(work: string): ReshapeViews | undefined {
  try {
    return JSON.parse(fs.readFileSync(stateFile(work), "utf8")) as ReshapeViews;
  } catch {
    return undefined;
  }
}

function saveReshape(v: ReshapeViews): void {
  fs.writeFileSync(stateFile(v.work), JSON.stringify(v, null, 2));
}

// ---------- 1. views ----------

/**
 * The garment's meshes exported (kept in `work` as `<mesh>.original.glb`) and drawn from four sides in
 * their look's colors: the project's copy of a mesh and its materials when the project has one, so a
 * restyled look shows as restyled. The garment fills half of each view, so a change has room to grow.
 * Starts the record over: changes made before are forgotten (their files stay).
 */
export async function reshapeViews(bridge: BridgeClient, lib: Library | undefined, cacheDir: string, meshes: { mesh: string; appearance: string }[], project: Project, work: string, opts: { size?: number; front?: Vec3; log?: Log } = {}): Promise<ReshapeViews> {
  const log = opts.log ?? (() => {});
  const size = opts.size ?? ReshapeDefaults.size;
  fs.mkdirSync(work, { recursive: true });
  const parts: (DrawPart & { mesh: string })[] = [];
  const out: ReshapeMesh[] = [];
  for (const m of meshes) {
    const meshFile = path.join(project.archive, m.mesh);
    // The project's copy shows a restyled look; one this module fitted is not the garment's own shape or
    // materials, so the game's is drawn instead.
    const fitted = readFitted(work).includes(m.mesh.toLowerCase());
    const local = fs.existsSync(meshFile) && !fitted;
    const read = local ? await bridge.fileToJson(meshFile) : await bridge.toJson(m.mesh);
    if (!read.json) throw new Error(`${path.basename(m.mesh)} could not be read`);
    const json = JSON.parse(read.json).Data.RootChunk;
    const appearance = (json.appearances ?? []).map((a: any) => a.Data ?? a).find((a: any) => (a.name?.$value ?? a.name) === m.appearance);
    const chunkMaterials: string[] = (appearance?.chunkMaterials ?? []).map((n: any) => n.$value ?? n);
    const glb = path.join(work, path.basename(m.mesh).replace(/\.mesh$/i, ".original.glb"));
    if (!fs.existsSync(glb)) {
      // A mesh not in the project, or one this module fitted: the game's own, exported through a scratch copy.
      const source = local ? meshFile : path.join(work, "export", m.mesh);
      if (source !== meshFile) {
        fs.mkdirSync(path.dirname(source), { recursive: true });
        await bridge.extract(m.mesh, source);
      }
      const root = source === meshFile ? project.archive : path.join(work, "export");
      const raw = source === meshFile ? project.raw : path.join(work, "export-raw");
      const exported = await bridge.exportFile(source, root, raw, { meshMaterials: false });
      const rel = exported.written.find((f) => /\.glb$/i.test(f));
      if (!exported.ok || !rel) throw new Error(`WolvenKit's export of ${path.basename(m.mesh)} wrote no .glb`);
      fs.copyFileSync(path.join(raw, rel), glb);
    }
    const g = readGlb(fs.readFileSync(glb));
    const bones: string[] = (g.json.skins?.[0]?.joints ?? []).map((j: number) => g.json.nodes[j].name);
    out.push({ mesh: m.mesh, appearance: m.appearance, glb, chunkMaterials, bones });
    const maps = await renderMaterials(bridge, lib, cacheDir, { mesh: local ? meshFile : m.mesh, appearance: m.appearance }, log);
    const textures = new Map(Object.entries(maps).filter(([, v]) => v.baseColor).map(([k, v]) => [k, readPng(Buffer.from(v.baseColor!))]));
    for (const p of primitives(g)) {
      const chunk = Number(/submesh_(\d+)/i.exec(p.mesh)?.[1] ?? -1);
      parts.push({ ...p, texture: textures.get(chunkMaterials[chunk]) });
    }
  }
  // Only the most detailed level: WolvenKit names the parts submesh_NN_LOD_N, LOD_1 the most detailed.
  const lodOf = (p: { mesh: string }) => Number(/lod_?(\d+)/i.exec(p.mesh)?.[1] ?? 0);
  const best = Math.min(...parts.map(lodOf));
  const lod = parts.filter((p) => lodOf(p) === best);
  if (!lod.length) throw new Error("The garment's meshes have nothing to draw");
  const box = bbox(lod);
  const center = box.lo.map((l, c) => (l + box.hi[c]) / 2) as Vec3;
  const scale = (size * 0.5) / Math.max(...box.size);
  // WolvenKit's export turns the game's forward (+Y) into glTF's -Z.
  const front = opts.front ?? ([0, 0, -1] as Vec3);
  const cams = cameras(front);
  let drawn = cams.map((c) => draw(lod, c.cam, center, scale, size));
  // A light garment (the white cowboy hat) on dark, so its edge and its light parts stay clear; a dark one on white.
  const lum = drawn.reduce((s, d) => s + d.lum, 0) / drawn.length;
  const background: ReshapeBackground = lum > 140 ? "dark" : "white";
  if (background === "dark") drawn = cams.map((c) => draw(lod, c.cam, center, scale, size, Backgrounds.dark));
  const views = cams.map((c, i) => {
    const file = path.join(work, `view_${c.view}.png`);
    fs.writeFileSync(file, writePng(drawn[i]));
    return { view: c.view, file };
  });
  const sheet = path.join(work, "views.png");
  fs.writeFileSync(sheet, writePng(grid(drawn)));
  const bones = [...new Set(out.flatMap((m) => m.bones))];
  const fit = bones.length === 1
    ? { ok: true, bone: bones[0] }
    : { ok: false, why: `it moves with ${bones.length} bones; Reshape fits garments that move with one bone (hats, helmets, glasses) so far` };
  const v: ReshapeViews = { work, sheet, views, frame: { front, center, scale, size, box }, meshes: out, fit, background, changes: [] };
  saveReshape(v);
  log(`Views: ${out.length} mesh(es), ${box.size.map((x) => x.toFixed(2)).join(" x ")} m, on ${background === "dark" ? "dark grey" : "white"}${fit.ok ? `, on ${fit.bone}` : `; not fittable yet: ${fit.why}`}`);
  return v;
}

// ---------- 2. change ----------

/** The words sent with the views (design, "Reshape", step 2). */
export function reshapePrompt(what: string, words: string, background: ReshapeBackground = "white"): string {
  const bg = background === "dark" ? "plain very dark grey" : "plain white";
  return [
    `The picture shows one ${what} from four sides, on a ${bg} background, as a 2 by 2 grid of orthographic views: top left from the front, top right from its left side, bottom left from the back, bottom right from its right side. It is lit by a soft studio light, and its colors are its true colors.`,
    `Change it: ${words.trim()}.`,
    `A changed part replaces the old one: the old part is gone, not kept inside, under or beside the new one, so the ${what} still has each of its parts once.`,
    `Show the changed ${what} in the same four views and the same grid, with the same straight-on camera at the same distance and scale: the parts the words do not change keep their size and place, and a part made bigger may reach past where the old one did. The same soft studio light, ${bg} background.`,
    "Change it the same way in every view, so the four views show one object. Each view keeps its own details where they are: what shows only from the front stays only in the front view. Keep its colors and materials unless the words change them. No text, labels, shadows on the ground or borders.",
  ].join(" ");
}

/**
 * The views changed by words, as one picture, then cut into four. `from`: build on the last change
 * (default) or start from the game's look ("game"). The change is added to the record.
 */
export async function reshapeChange(bridge: BridgeClient, v: ReshapeViews, words: string, opts: { key: string; what: string; service?: ServiceId; model?: string; from?: "last" | "game"; signal?: AbortSignal; log?: Log }): Promise<ReshapeChange> {
  const service = opts.service ?? ReshapeDefaults.service;
  const model = opts.model ?? ReshapeDefaults.models[service];
  const base = opts.from === "game" ? undefined : v.changes.at(-1);
  const sheet = base?.sheet ?? v.sheet;
  const t = Date.now();
  const img = await editImage(service, model, reshapePrompt(opts.what, words, v.background), [{ bytes: fs.readFileSync(sheet), mime: "image/png" }], {
    key: opts.key,
    aspect: "1:1",
    size: v.frame.size * 2,
    timeoutMs: 300_000,
    signal: opts.signal,
  });
  const change = await reshapeAddPicture(bridge, v, img.bytes, { words, service, model, from: base?.sheet });
  opts.log?.(`${service === "openai" ? "GPT Image" : "Gemini"} (${model}) changed the views in ${((Date.now() - t) / 1000).toFixed(1)} s: ${change.outline.map((l) => `${l.view} ${l.after[0]} x ${l.after[1]} m`).join(", ")}`);
  return change;
}

/**
 * A changed picture of the four views added to the record as the newest change: one an image service
 * made, or one made elsewhere (a test, a picture edited by hand). PNG, JPEG or WebP bytes.
 */
export async function reshapeAddPicture(bridge: BridgeClient, v: ReshapeViews, bytes: Buffer, made: { words: string; service: ServiceId; model: string; from?: string }): Promise<ReshapeChange> {
  const png = readPng(await imageAsPng(bridge, bytes, bytes[0] === 0xff ? ".jpg" : bytes.subarray(8, 12).toString("ascii") === "WEBP" ? ".webp" : ".png"));
  const n = v.changes.length + 1;
  const file = path.join(v.work, `change_${n}.png`);
  fs.writeFileSync(file, writePng(png));
  const quarters = cut(png, v.frame.size);
  const cams = cameras(v.frame.front);
  const views = cams.map((c, i) => {
    const f = path.join(v.work, `change_${n}_${c.view}.png`);
    fs.writeFileSync(f, writePng(quarters[i]));
    return { view: c.view, file: f };
  });
  const m = (px: number) => Number((px / v.frame.scale).toFixed(3));
  const lines: ReshapeChange["outline"] = [];
  cams.forEach((c, i) => {
    const a = outline(readPng(fs.readFileSync(v.views[i].file))), b = outline(quarters[i]);
    if (a && b) lines.push({ view: c.view, before: [m(a.w), m(a.h)], after: [m(b.w), m(b.h)] });
  });
  const change: ReshapeChange = { words: made.words.trim(), service: made.service, model: made.model, sheet: file, views, from: made.from, outline: lines, made: new Date().toISOString() };
  v.changes.push(change);
  saveReshape(v);
  return change;
}

/** Takes the last change back: the one before it (or the game's look) is the one built on next. */
export function reshapeBack(v: ReshapeViews): ReshapeChange | undefined {
  const gone = v.changes.pop();
  saveReshape(v);
  return gone;
}

// ---------- 3. model ----------

/**
 * A 3D model from a change's four views (Tripo's multiview to model), then Tripo's retopology to `faces`
 * with the texture baked on. `task` reuses a finished multiview task. About 60 credits on 2026-11-02.
 */
export async function reshapeModel(tripo: Tripo, v: ReshapeViews, change: ReshapeChange, opts: { faces?: number; task?: string; progress?: (step: string, percent: number) => void; log?: Log } = {}): Promise<ReshapeModel> {
  const log = opts.log ?? (() => {});
  const faces = opts.faces ?? ReshapeDefaults.faces;
  let taskId = opts.task;
  if (!taskId) {
    const inputs: Record<string, string>[] = [];
    for (const w of change.views) inputs.push({ [w.view]: await tripo.upload(w.file) });
    taskId = (await tripo.call<{ task_id: string }>("POST", "/generation/multiview-to-model", { inputs, model: ReshapeDefaults.tripoModel, texture: true, pbr: true })).task_id;
  }
  const task = await tripo.wait(taskId, (p) => opts.progress?.("model", p));
  const stem = path.basename(change.sheet, ".png");
  const model = path.join(v.work, `${stem}_model_${task.task_id}.glb`);
  await tripo.download(task.output?.model_url ?? task.output?.pbr_model ?? task.output?.model, model);
  let preview: string | undefined;
  if (task.output?.rendered_image_url) {
    preview = path.join(v.work, `${stem}_model_${task.task_id}_preview${path.extname(new URL(task.output.rendered_image_url).pathname) || ".png"}`);
    await tripo.download(task.output.rendered_image_url, preview).catch(() => (preview = undefined));
  }
  // A reused task was paid for when it was made.
  let credits = opts.task ? 0 : task.credits_consumed ?? 0;
  log(opts.task ? `Tripo's model from task ${task.task_id}, already paid` : `Tripo made the model: ${credits || "?"} credits`);
  let low = model;
  if (faces > 0) {
    low = path.join(v.work, `${stem}_model_${task.task_id}_${faces}.glb`);
    if (!fs.existsSync(low)) {
      const { task_id } = await tripo.call<{ task_id: string }>("POST", "/mesh/decimate", { input: task.task_id, model: "v2.0", face_limit: faces, bake: true });
      const done = await tripo.wait(task_id, (p) => opts.progress?.("faces", p));
      credits += done.credits_consumed ?? 0;
      log(`Tripo brought it to about ${faces} faces: ${done.credits_consumed ?? "?"} credits`);
      await tripo.download(done.output?.model_url ?? done.output?.pbr_model ?? done.output?.model, low);
    }
  }
  return { task: task.task_id, model, low, preview, credits };
}

// ---------- 4. fit ----------

/**
 * A part's triangles without its stray pieces: pieces joined by shared corners (by position, so UV seams
 * do not split them). A piece is dropped when it lies wholly outside the largest piece's box (a scrap
 * beside the model), or holds less than `share` of the triangles; a small piece on the garment stays.
 */
function mainPieces(p: DrawPart, share: number): Float64Array {
  const n = p.pos.length / 3;
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = (i: number) => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  const join = (a: number, b: number) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  const at = new Map<string, number>();
  for (let v = 0; v < n; v++) {
    const key = `${Math.round(p.pos[v * 3] * 1e5)},${Math.round(p.pos[v * 3 + 1] * 1e5)},${Math.round(p.pos[v * 3 + 2] * 1e5)}`;
    const seen = at.get(key);
    if (seen !== undefined) join(v, seen);
    else at.set(key, v);
  }
  for (let t = 0; t < p.idx.length; t += 3) {
    join(p.idx[t], p.idx[t + 1]);
    join(p.idx[t], p.idx[t + 2]);
  }
  const pieces = new Map<number, { tris: number; lo: number[]; hi: number[] }>();
  for (let t = 0; t < p.idx.length; t += 3) {
    const r = find(p.idx[t]);
    let c = pieces.get(r);
    if (!c) pieces.set(r, (c = { tris: 0, lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] }));
    c.tris++;
    for (let k = 0; k < 3; k++) for (let d = 0; d < 3; d++) {
      c.lo[d] = Math.min(c.lo[d], p.pos[p.idx[t + k] * 3 + d]);
      c.hi[d] = Math.max(c.hi[d], p.pos[p.idx[t + k] * 3 + d]);
    }
  }
  const main = [...pieces.values()].sort((a, b) => b.tris - a.tris)[0];
  const outside = (c: { lo: number[]; hi: number[] }) => [0, 1, 2].some((d) => c.lo[d] > main.hi[d] || c.hi[d] < main.lo[d]);
  const least = (share * p.idx.length) / 3;
  const out: number[] = [];
  for (let t = 0; t < p.idx.length; t += 3) {
    const c = pieces.get(find(p.idx[t]))!;
    if (c === main || (c.tris >= least && !outside(c))) out.push(p.idx[t], p.idx[t + 1], p.idx[t + 2]);
  }
  return Float64Array.from(out);
}

/** A part with only the vertices its triangles use. */
function compact<T extends DrawPart>(p: T): T {
  const map = new Map<number, number>();
  const idx = new Float64Array(p.idx.length);
  p.idx.forEach((v, i) => {
    if (!map.has(v)) map.set(v, map.size);
    idx[i] = map.get(v)!;
  });
  const pick = (a: Float64Array | null, n: number) => {
    if (!a) return a;
    const out = new Float64Array(map.size * n);
    for (const [v, w] of map) for (let q = 0; q < n; q++) out[w * n + q] = a[v * n + q];
    return out;
  };
  return { ...p, idx, pos: pick(p.pos, 3)!, nrm: pick(p.nrm, 3), uv: pick(p.uv, 2) };
}

/** Per-vertex tangents from the UVs (xyz and the handedness in w), for the game's normal mapping. */
function tangents(pos: Float64Array, nrm: Float64Array, uv: Float64Array, idx: number[]): Float32Array {
  const n = pos.length / 3;
  const t = new Float64Array(n * 3), b = new Float64Array(n * 3);
  for (let i = 0; i < idx.length; i += 3) {
    const [a, c, d] = [idx[i], idx[i + 1], idx[i + 2]];
    const e1 = [0, 1, 2].map((q) => pos[c * 3 + q] - pos[a * 3 + q]), e2 = [0, 1, 2].map((q) => pos[d * 3 + q] - pos[a * 3 + q]);
    const du1 = uv[c * 2] - uv[a * 2], dv1 = uv[c * 2 + 1] - uv[a * 2 + 1], du2 = uv[d * 2] - uv[a * 2], dv2 = uv[d * 2 + 1] - uv[a * 2 + 1];
    const r = 1 / (du1 * dv2 - du2 * dv1);
    if (!Number.isFinite(r)) continue;
    for (const v of [a, c, d]) {
      for (let q = 0; q < 3; q++) {
        t[v * 3 + q] += (e1[q] * dv2 - e2[q] * dv1) * r;
        b[v * 3 + q] += (e2[q] * du1 - e1[q] * du2) * r;
      }
    }
  }
  const out = new Float32Array(n * 4);
  for (let v = 0; v < n; v++) {
    const N: Vec3 = [nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]];
    let T: Vec3 = [t[v * 3], t[v * 3 + 1], t[v * 3 + 2]];
    T = sub(T, N.map((x) => x * dot(N, T)));
    if (Math.hypot(...T) < 1e-9) T = cross(N, Math.abs(N[1]) < 0.9 ? Up : [1, 0, 0]);
    T = unit(T);
    out.set([...T, dot(cross(N, T), [b[v * 3], b[v * 3 + 1], b[v * 3 + 2]]) < 0 ? -1 : 1], v * 4);
  }
  return out;
}

/** A submesh's data as the fit writes it. */
interface ChunkData {
  pos: Float64Array;
  nrm: Float64Array | null;
  uv: Float64Array | null;
  uv1?: Float64Array | null;
  /** RGBA per vertex. */
  color?: Float64Array | null;
  idx: ArrayLike<number>;
}

/**
 * The exported .glb with its mesh parts replaced by one: the fitted parts merged, each vertex fully on
 * the skin's joint `boneIndex`. The armature, the skin and the first part's names and extras are kept,
 * so WolvenKit's import reads it as the game's mesh.
 */
function gameGlb(orig: Glb, parts: DrawPart[], boneIndex: number): Buffer {
  const meshNodes: number[] = orig.json.nodes.map((n: any, i: number) => (n.mesh != null ? i : -1)).filter((i: number) => i >= 0);
  const keepNode = meshNodes.find((i) => /submesh_0*0(_|$)/i.test(orig.json.nodes[i].name ?? "")) ?? meshNodes[0];
  const count = parts.reduce((s, p) => s + p.pos.length / 3, 0);
  const pos = new Float64Array(count * 3), nrm = new Float64Array(count * 3), uv = new Float64Array(count * 2);
  const idx: number[] = [];
  let base = 0;
  for (const p of parts) {
    pos.set(p.pos, base * 3);
    if (p.nrm) nrm.set(p.nrm, base * 3);
    if (p.uv) uv.set(p.uv, base * 2);
    for (const i of p.idx) idx.push(i + base);
    base += p.pos.length / 3;
  }
  return gameGlbParts(orig, [{ node: keepNode, part: { pos, nrm, uv, idx } }], boneIndex);
}

/**
 * The exported .glb with the mesh nodes in `chunks` given new data and every other mesh node dropped,
 * each vertex fully on the skin's joint `boneIndex`. The armature, the skin and the kept nodes' names and
 * extras stay, so WolvenKit's import reads it as the game's mesh, its submeshes in the same order.
 */
function gameGlbParts(orig: Glb, chunks: { node: number; part: ChunkData }[], boneIndex: number): Buffer {
  const json = structuredClone(orig.json);
  const meshNodes: number[] = json.nodes.map((n: any, i: number) => (n.mesh != null ? i : -1)).filter((i: number) => i >= 0);
  const keepNodes = new Set(chunks.map((c) => c.node));
  const drop = new Set(meshNodes.filter((i) => !keepNodes.has(i)));
  const remap = new Map<number, number>();
  json.nodes.forEach((_: unknown, i: number) => {
    if (!drop.has(i)) remap.set(i, remap.size);
  });
  const fix = (list?: number[]) => list?.filter((i) => remap.has(i)).map((i) => remap.get(i)!);
  json.nodes = json.nodes.filter((_: unknown, i: number) => !drop.has(i)).map((n: any) => (n.children ? { ...n, children: fix(n.children) } : n));
  for (const s of json.scenes ?? []) s.nodes = fix(s.nodes);
  for (const s of json.skins ?? []) {
    s.joints = fix(s.joints);
    if (s.skeleton != null) s.skeleton = remap.get(s.skeleton);
  }
  // The kept nodes' meshes, in node order, so the submeshes keep their order.
  const ordered = [...keepNodes].sort((a, b) => a - b);
  json.meshes = ordered.map((n) => json.meshes[orig.json.nodes[n].mesh]);
  ordered.forEach((n, i) => (json.nodes[remap.get(n)!].mesh = i));
  const chunksBin: Buffer[] = [orig.bin];
  let offset = orig.bin.length;
  const put = (typed: Float32Array | Uint16Array | Uint32Array, type: string, componentType: number, extra: Record<string, unknown> = {}) => {
    const pad = (4 - (offset % 4)) % 4;
    if (pad) {
      chunksBin.push(Buffer.alloc(pad));
      offset += pad;
    }
    const bytes = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length });
    chunksBin.push(bytes);
    offset += bytes.length;
    const comps = ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 } as Record<string, number>)[type];
    json.accessors.push({ bufferView: json.bufferViews.length - 1, componentType, count: typed.length / comps, type, ...extra });
    return json.accessors.length - 1;
  };
  for (const n of ordered) {
    const part = chunks.find((c) => c.node === n)!.part;
    writePrimitive(json.meshes[json.nodes[remap.get(n)!].mesh], part, boneIndex, put);
  }
  const bin = Buffer.concat(chunksBin);
  json.buffers = [{ byteLength: bin.length }];
  return writeGlb(json, bin);
}

/** One submesh's data written as a mesh's only primitive, through `put` (which adds an accessor). */
function writePrimitive(mesh: any, part: ChunkData, boneIndex: number, put: (typed: Float32Array | Uint16Array | Uint32Array, type: string, componentType: number, extra?: Record<string, unknown>) => number): void {
  const count = part.pos.length / 3;
  const pos = part.pos;
  const nrm = part.nrm && part.nrm.length === pos.length ? Float64Array.from(part.nrm) : new Float64Array(count * 3);
  const uv = part.uv && part.uv.length === count * 2 ? part.uv : new Float64Array(count * 2);
  const idx = Array.from(part.idx);
  // Parts without normals get their faces'.
  for (let i = 0; i < idx.length; i += 3) {
    const [a, b, c] = [idx[i], idx[i + 1], idx[i + 2]];
    if (nrm[a * 3] || nrm[a * 3 + 1] || nrm[a * 3 + 2]) continue;
    const pa = [pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2]];
    const f = unit(cross(sub([pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]], pa), sub([pos[c * 3], pos[c * 3 + 1], pos[c * 3 + 2]], pa)));
    for (const v of [a, b, c]) nrm.set(f, v * 3);
  }
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < count; v++) for (let c = 0; c < 3; c++) {
    lo[c] = Math.min(lo[c], pos[v * 3 + c]);
    hi[c] = Math.max(hi[c], pos[v * 3 + c]);
  }
  const joints = new Uint16Array(count * 4), weights = new Float32Array(count * 4);
  for (let v = 0; v < count; v++) {
    joints[v * 4] = boneIndex;
    weights[v * 4] = 1;
  }
  const uv32 = Float32Array.from(uv);
  const uv1 = part.uv1 && part.uv1.length === count * 2 ? Float32Array.from(part.uv1) : uv32.slice();
  const color = part.color && part.color.length === count * 4 ? Float32Array.from(part.color) : new Float32Array(count * 4);
  const prim = mesh.primitives[0];
  prim.attributes = {
    POSITION: put(Float32Array.from(pos), "VEC3", 5126, { min: lo, max: hi }),
    NORMAL: put(Float32Array.from(nrm), "VEC3", 5126),
    TANGENT: put(tangents(pos, nrm, uv, idx), "VEC4", 5126),
    COLOR_0: put(color, "VEC4", 5126),
    TEXCOORD_0: put(uv32, "VEC2", 5126),
    TEXCOORD_1: put(uv1, "VEC2", 5126),
    JOINTS_0: put(joints, "VEC4", 5123),
    WEIGHTS_0: put(weights, "VEC4", 5126),
  };
  prim.indices = put(Uint32Array.from(idx), "SCALAR", 5125);
  delete prim.targets;
  mesh.primitives = [prim];
}

/** A part's level of detail: WolvenKit names the parts submesh_NN_LOD_N, LOD_1 the most detailed. */
const lodOf = (p: { mesh: string }) => Number(/lod_?(\d+)/i.exec(p.mesh)?.[1] ?? 0);

const fittedFile = (work: string) => path.join(work, "fitted.json");

/** The game paths (lower case) of the meshes this work folder fitted into a project. */
function readFitted(work: string): string[] {
  try {
    return JSON.parse(fs.readFileSync(fittedFile(work), "utf8")) as string[];
  } catch {
    return [];
  }
}

/**
 * Tripo's model fitted onto the game's garment and imported over the look's first mesh in the project.
 * One-bone garments only (`v.fit`). Placed where the change's views show it: each view's outline gives
 * the garment's extent, by the views' own scale; then the top `anchor` of its height (a hat's crown) is
 * centred where the game's is, since that part sits on the body.
 *
 * `wears`: "game" (the default) keeps the game's materials: the game mesh is bent onto the new shape and
 * its submeshes, UVs and vertex colors carried over (`transfer.ts`), so every look of the item keeps its
 * own materials and can be restyled. "tripo" puts Tripo's color and roughness on it as a new material (in
 * `folder`, a game path such as `edgemat\reshape\<words>`), on the look's first part only. `lib` and
 * `cacheDir` let the fitted picture show the game's materials.
 */
export async function reshapeFit(bridge: BridgeClient, v: ReshapeViews, change: ReshapeChange, model: ReshapeModel, project: Project, opts: { folder: string; wears?: "game" | "tripo"; anchor?: number; modelFront?: Vec3; lib?: Library; cacheDir?: string; log?: Log }): Promise<ReshapeFit> {
  const wears = opts.wears ?? "game";
  if (!v.fit.ok || !v.fit.bone) throw new Error(`This garment cannot be fitted yet: ${v.fit.why}`);
  const log = opts.log ?? (() => {});
  const notes: string[] = [];
  const { front, center, scale, size } = v.frame;
  const low = readGlb(fs.readFileSync(model.low));
  // Tripo's models face +X; turned about the vertical to face the garment's front.
  const tripoFront = opts.modelFront ?? ([1, 0, 0] as Vec3);
  const turn = Math.atan2(cross(tripoFront, front)[1], dot(tripoFront, front));
  const [cosT, sinT] = [Math.cos(turn), Math.sin(turn)];
  const rotY = (a: Float64Array) => {
    const out = new Float64Array(a.length);
    for (let k = 0; k < a.length; k += 3) {
      out[k] = a[k] * cosT + a[k + 2] * sinT;
      out[k + 1] = a[k + 1];
      out[k + 2] = -a[k] * sinT + a[k + 2] * cosT;
    }
    return out;
  };
  let res: (DrawPart & { rough?: Image })[] = [];
  for (const p of primitives(low)) {
    const pbr = low.json.materials?.[p.material ?? 0]?.pbrMetallicRoughness ?? {};
    const tex = async (ref?: { index: number }) => {
      const img = ref ? imageOf(low, ref.index) : undefined;
      return img ? readPng(await imageAsPng(bridge, img.bytes, img.ext)) : undefined;
    };
    res.push({ pos: rotY(p.pos), nrm: p.nrm && rotY(p.nrm), uv: p.uv, idx: p.idx, texture: await tex(pbr.baseColorTexture), rough: await tex(pbr.metallicRoughnessTexture) });
  }
  // Tripo leaves small loose pieces beside a model at times: dropped, so they neither show nor widen the fit.
  let dropped = 0;
  res = res.map((p) => {
    const kept = mainPieces(p, 0.005);
    dropped += (p.idx.length - kept.length) / 3;
    return compact({ ...p, idx: kept });
  });
  if (dropped) notes.push(`${dropped} triangles in loose pieces beside the model left out`);
  const rb = bbox(res);

  // The box the changed views show, per axis, averaged over the views that see it.
  const want = { lo: [0, 0, 0], hi: [0, 0, 0], n: [0, 0, 0] };
  const add = (k: number, a: number, b: number) => {
    want.lo[k] += Math.min(a, b);
    want.hi[k] += Math.max(a, b);
    want.n[k]++;
  };
  const cams = cameras(front);
  cams.forEach((c, i) => {
    const s = outline(readPng(fs.readFileSync(change.views[i].file)));
    if (!s) return;
    const right = unit(cross(Up, c.cam));
    const k = right.map(Math.abs).indexOf(Math.max(...right.map(Math.abs)));
    add(k, center[k] + ((s.x0 - size / 2) / scale) * right[k], center[k] + ((s.x1 + 1 - size / 2) / scale) * right[k]);
    add(1, center[1] - (s.y0 - size / 2) / scale, center[1] - (s.y1 + 1 - size / 2) / scale);
  });
  if (want.n.some((n) => !n)) throw new Error("The changed views do not show the garment from every side");
  const lo = want.lo.map((x, k) => x / want.n[k]), hi = want.hi.map((x, k) => x / want.n[k]);
  const stretch = [0, 1, 2].map((k) => (hi[k] - lo[k]) / (rb.size[k] || 1));
  const placed: (DrawPart & { rough?: Image })[] = res.map((p) => {
    const pos = new Float64Array(p.pos.length), nrm = p.nrm ? new Float64Array(p.nrm.length) : null;
    for (let k = 0; k < p.pos.length; k += 3) {
      for (let c = 0; c < 3; c++) pos[k + c] = (p.pos[k + c] - rb.lo[c]) * stretch[c] + lo[c];
      // A stretch turns normals by its inverse.
      if (nrm) nrm.set(unit([0, 1, 2].map((c) => p.nrm![k + c] / stretch[c])), k);
    }
    return { ...p, pos, nrm };
  });
  const anchor = opts.anchor ?? 0.3;
  const game = (await Promise.all(v.meshes.map(async (m) => primitives(readGlb(fs.readFileSync(m.glb)))))).flat();
  const best = Math.min(...game.map(lodOf));
  const gameParts = game.filter((p) => lodOf(p) === best);
  if (anchor > 0) {
    const topCentre = (ps: { pos: Float64Array }[]) => {
      const b = bbox(ps);
      const l = [Infinity, Infinity, Infinity], h = [-Infinity, -Infinity, -Infinity];
      for (const p of ps) for (let k = 0; k < p.pos.length; k += 3) {
        if (p.pos[k + 1] < b.hi[1] - anchor * b.size[1]) continue;
        for (let c = 0; c < 3; c++) {
          l[c] = Math.min(l[c], p.pos[k + c]);
          h[c] = Math.max(h[c], p.pos[k + c]);
        }
      }
      return l.map((x, c) => (x + h[c]) / 2);
    };
    const was = topCentre(gameParts), now = topCentre(placed);
    const shift = [was[0] - now[0], 0, was[2] - now[2]];
    for (const p of placed) for (let k = 0; k < p.pos.length; k += 3) for (const c of [0, 2]) p.pos[k + c] += shift[c];
    log(`Fit: ${[0, 1, 2].map((k) => (hi[k] - lo[k]).toFixed(2)).join(" x ")} m; the top centred on the game's (moved ${(Math.hypot(shift[0], shift[2]) * 100).toFixed(1)} cm)`);
  }
  const stemOf = path.basename(change.sheet, ".png");
  const sheet = path.join(v.work, `${stemOf}_fitted${wears === "game" ? "_game" : ""}.png`);

  // The look's first mesh, rebuilt from the fitted model, imported over the project's copy.
  const target = v.meshes[0];
  const orig = readGlb(fs.readFileSync(target.glb));
  const joints: number[] = orig.json.skins?.[0]?.joints ?? [];
  const boneIndex = joints.findIndex((j) => orig.json.nodes[j].name === v.fit.bone);
  if (boneIndex < 0) throw new Error(`No bone ${v.fit.bone} in ${path.basename(target.mesh)}`);
  let glbBytes: Buffer;
  if (wears === "game") {
    // The game mesh's own submeshes (its most detailed level), bent onto the new shape and carried over.
    const own = primitives(orig);
    const ownBest = Math.min(...own.map(lodOf));
    const src = own.filter((p) => lodOf(p) === ownBest);
    const t0 = Date.now();
    const merged = mergeParts(placed);
    // What another part covers closely (the crown under the band) gives the new shape no material.
    const { hidden, over } = coveredTriangles(src, 0.012);
    const bent = bendOnto(src, merged, { hidden });
    // Kept as the game's own geometry, bent onto the new shape and lifted a little off it so the new
    // surface does not show through: small submeshes (under a fifth of what shows: a hat's buckle, its
    // glass) and small UV islands lying over another surface (a hat's band). A band only a triangle or two
    // of the new shape tall would come out jagged, and a buckle would lose its detail. The rest takes the
    // new shape, with the materials of the nearest game surface that shows.
    const area = src.map((p, k) => {
      const a = new Float64Array(p.idx.length / 3);
      for (let t = 0; t < a.length; t++) {
        if (hidden[k][t]) continue;
        const [x, y, z] = [p.idx[t * 3], p.idx[t * 3 + 1], p.idx[t * 3 + 2]].map((i) => [p.pos[i * 3], p.pos[i * 3 + 1], p.pos[i * 3 + 2]] as Vec3);
        a[t] = Math.hypot(...cross(sub(y, x), sub(z, x))) / 2;
      }
      return a;
    });
    const total = area.reduce((s, a) => s + a.reduce((x, y) => x + y, 0), 0) || 1;
    const partShare = area.map((a) => a.reduce((x, y) => x + y, 0) / total);
    const main = partShare.map((s) => s >= 0.2);
    if (!main.some(Boolean)) main[partShare.indexOf(Math.max(...partShare))] = true;
    const { island, count } = uvIslands(src);
    const islArea = new Float64Array(count), islOver = new Float64Array(count);
    src.forEach((p, k) => {
      for (let t = 0; t < island[k].length; t++) {
        islArea[island[k][t]] += area[k][t];
        if (over[k][t]) islOver[island[k][t]] += area[k][t];
      }
    });
    const overlay = (i: number) => islArea[i] / total < 0.2 && islOver[i] >= 0.3 * islArea[i];
    const kept = src.map((p, k) => Uint8Array.from(island[k], (i) => (!main[k] || overlay(i) ? 1 : 0)));
    const skip = src.map((p, k) => Uint8Array.from(kept[k], (x, t) => x | hidden[k][t]));
    const lifted: Float64Array[] = [];
    const keptIdx = src.map((p, k) => {
      const out: number[] = [];
      for (let t = 0; t < kept[k].length; t++) if (kept[k][t]) out.push(p.idx[t * 3], p.idx[t * 3 + 1], p.idx[t * 3 + 2]);
      const l = Float64Array.from(bent[k]);
      if (p.nrm) for (let i = 0; i < l.length; i++) l[i] += p.nrm[i] * 0.0025;
      lifted[k] = l;
      return out;
    });
    // The new shape's own version of a kept part (Tripo's band) tucked under the game's, 4 mm down.
    const tucked = tuckUnder(merged, src.map((p, k) => ({ pos: lifted[k], nrm: p.nrm, idx: keptIdx[k] })), 0.004, 0.03);
    const carried = carryOnto(src, bent, merged, skip);
    const chunks = src.map((p, k) => {
      const keepTris = keptIdx[k];
      if (main[k] && !carried[k].idx.length && !keepTris.length) {
        notes.push(`${p.mesh}: no part of the new shape is nearest to it, so the game's part stays, bent onto the new shape`);
        for (let t = 0; t < p.idx.length; t++) keepTris.push(p.idx[t]);
      }
      return { node: p.node, part: joinChunks(carried[k], { ...p, pos: lifted[k], idx: keepTris }), keptTris: keepTris.length / 3 };
    });
    const covered = hidden.reduce((s, h) => s + h.reduce((a, b) => a + b, 0), 0);
    log(`The game's materials carried onto the new shape in ${((Date.now() - t0) / 1000).toFixed(1)} s (${covered} covered game triangles left out, ${tucked} points of the new shape tucked under the kept ones): ${chunks.map((c, k) => `${src[k].mesh} ${c.part.idx.length / 3} triangles, ${c.keptTris} of them the game's, bent`).join("; ")}`);
    glbBytes = gameGlbParts(orig, chunks, boneIndex);
    // The fitted picture in the look's own materials, when the library is at hand.
    let textures = new Map<string, Image>();
    if (opts.cacheDir) {
      const maps = await renderMaterials(bridge, opts.lib, opts.cacheDir, { mesh: target.mesh, appearance: target.appearance }, log).catch(() => ({}) as Awaited<ReturnType<typeof renderMaterials>>);
      textures = new Map(Object.entries(maps).filter(([, m]) => m.baseColor).map(([k, m]) => [k, readPng(Buffer.from(m.baseColor!))]));
    }
    const drawn: DrawPart[] = chunks.map((c, k) => {
      const chunk = Number(/submesh_(\d+)/i.exec(src[k].mesh)?.[1] ?? k);
      return { pos: c.part.pos, nrm: c.part.nrm, uv: c.part.uv, idx: Float64Array.from(c.part.idx), texture: textures.get(target.chunkMaterials[chunk]) };
    });
    fs.writeFileSync(sheet, writePng(grid(cams.map((c) => draw(drawn, c.cam, center, scale, size, Backgrounds[v.background ?? "white"])))));
  } else {
    glbBytes = gameGlb(orig, placed, boneIndex);
    fs.writeFileSync(sheet, writePng(grid(cams.map((c) => draw(placed, c.cam, center, scale, size, Backgrounds[v.background ?? "white"])))));
  }
  const meshFile = path.join(project.archive, target.mesh);
  if (!fs.existsSync(meshFile)) {
    fs.mkdirSync(path.dirname(meshFile), { recursive: true });
    await bridge.extract(target.mesh, meshFile);
  }
  const glbOut = path.join(project.raw, target.mesh.replace(/\.mesh$/i, ".glb"));
  fs.mkdirSync(path.dirname(glbOut), { recursive: true });
  fs.writeFileSync(glbOut, glbBytes);
  const imported = await bridge.importFile(glbOut, project.raw, project.archive, true);
  if (!imported.ok) throw new Error(`WolvenKit's import of the new ${path.basename(target.mesh)} failed`);
  const fitted = new Set(readFitted(v.work));
  fitted.add(target.mesh.toLowerCase());
  fs.writeFileSync(fittedFile(v.work), JSON.stringify([...fitted], null, 2));
  if (v.meshes.length > 1) notes.push(`${v.meshes.length - 1} other mesh(es) of the look left as they were`);
  if (wears === "game") {
    log(`Fitted on ${v.fit.bone}, imported over ${path.basename(target.mesh)}; it keeps the game's materials`);
    return { written: [target.mesh], mesh: target.mesh, wears, notes, sheet };
  }

  // Tripo's colors and roughness as a textured material, on the material the look puts on the first part.
  const stem = materialSlug(path.basename(target.mesh, ".mesh")).slice(0, 40);
  const color = res.find((p) => p.texture)?.texture;
  if (!color) throw new Error("Tripo's model has no color texture");
  const written = new Set<string>([target.mesh]);
  const d01 = `${opts.folder}\\${stem}_d01.xbm`, r01 = `${opts.folder}\\${stem}_r01.xbm`;
  for (const f of await writeTexture(bridge, project.archive, d01, writePng(color), "color")) written.add(f);
  const rough = res.find((p) => p.rough)?.rough;
  if (rough) {
    // glTF keeps roughness in green.
    const grey = new Uint8Array(rough.data.length);
    for (let k = 0; k < grey.length; k += 4) {
      grey[k] = grey[k + 1] = grey[k + 2] = rough.data[k + 1];
      grey[k + 3] = 255;
    }
    for (const f of await writeTexture(bridge, project.archive, r01, writePng({ ...rough, data: grey }), "rough")) written.add(f);
  }
  const mi = `${opts.folder}\\${stem}.mi`;
  for (const f of await writeTexturedMaterial(bridge, project.archive, mi, { baseColor: d01, ...(rough ? { roughness: r01, roughnessScale: 1, roughnessBias: 0 } : { roughnessScale: 0.3, roughnessBias: 0.5 }), layerTile: 1 })) written.add(f);
  const material = target.chunkMaterials[0];
  for (const f of await applyMaterial(bridge, project.archive, target.mesh, material, mi)) written.add(f);
  log(`Fitted on ${v.fit.bone}, imported over ${path.basename(target.mesh)}; ${material} wears Tripo's texture`);
  return { written: [...written], mesh: target.mesh, wears, material, notes, sheet };
}

/**
 * A submesh from the new shape's carried triangles and the game's own triangles kept (only the vertices
 * they use), as one.
 */
function joinChunks(a: ChunkData, b: ChunkData): ChunkData {
  const used = new Map<number, number>();
  const bIdx: number[] = [];
  const na = a.pos.length / 3;
  for (const v of Array.from(b.idx)) {
    if (!used.has(v)) used.set(v, na + used.size);
    bIdx.push(used.get(v)!);
  }
  const n = na + used.size;
  const pos = new Float64Array(n * 3), nrm = new Float64Array(n * 3), uv = new Float64Array(n * 2), uv1 = new Float64Array(n * 2), color = new Float64Array(n * 4);
  const copy = (dst: Float64Array, src: ArrayLike<number> | null | undefined, k: number, from: number, to: number) => {
    if (src) for (let q = 0; q < k; q++) dst[to * k + q] = src[from * k + q];
  };
  for (let v = 0; v < na; v++) {
    copy(pos, a.pos, 3, v, v);
    copy(nrm, a.nrm, 3, v, v);
    copy(uv, a.uv, 2, v, v);
    copy(uv1, a.uv1 ?? a.uv, 2, v, v);
    copy(color, a.color, 4, v, v);
  }
  for (const [v, w] of used) {
    copy(pos, b.pos, 3, v, w);
    copy(nrm, b.nrm, 3, v, w);
    copy(uv, b.uv, 2, v, w);
    copy(uv1, b.uv1 ?? b.uv, 2, v, w);
    copy(color, b.color, 4, v, w);
  }
  return { pos, nrm, uv, uv1, color, idx: [...Array.from(a.idx), ...bIdx] };
}

/** Parts merged into one surface, normals kept. */
function mergeParts(parts: DrawPart[]): { pos: Float64Array; nrm: Float64Array | null; idx: number[] } {
  const count = parts.reduce((s, p) => s + p.pos.length / 3, 0);
  const pos = new Float64Array(count * 3);
  const nrm = parts.every((p) => p.nrm) ? new Float64Array(count * 3) : null;
  const idx: number[] = [];
  let base = 0;
  for (const p of parts) {
    pos.set(p.pos, base * 3);
    if (nrm) nrm.set(p.nrm!, base * 3);
    for (const i of p.idx) idx.push(i + base);
    base += p.pos.length / 3;
  }
  return { pos, nrm, idx };
}
