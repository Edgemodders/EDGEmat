// The reshape check (design, "Reshape: a garment's shape changed by words", "A reshape check first"):
// Reshape on one item, a step at a time. 1. Pictures of the garment from its own mesh and look, front,
// left, back and right. 2. Those pictures changed by words with Gemini, as one picture so the views change
// together. 3. A 3D model from the changed views with Tripo's multiview to model, then Tripo's retopology
// to a game's face count with the texture baked on. 4. The fit, for a garment on one bone (a hat): the
// model placed where the changed views show it, every vertex on that bone, imported over the game's mesh
// by WolvenKit with Tripo's texture as its material, and packed. Each step's files are kept in the
// project's raw folder and reused, so a step can be looked at before paying for the next.
// Run `npm run build` first. Steps and what to look for: docs/testing.md, "Reshape check".
//
//   node scripts/reshape-check.mjs <project folder> [--item Items.Hat_02_basic_01] [--body feminine]
//        [--words "make the brim twice as wide"] [--what "cowboy hat"] [--until views|edit|model|fit]
//        [--again] [--model <Gemini model>] [--task <Tripo task id>] [--faces 6000] [--front +z]
//        [--model-front +x] [--bone Head] [--flipv] [--size 768]
//
// --until stops after that step (default: views, so nothing is paid for until asked). --again asks Gemini
// once more for the same words. --task reuses a finished Tripo task. --faces is the retopology's face
// count (0: none). --front is the direction the garment faces in the exported .glb (-z; files made with
// +z before 2026-11-02 need --front +z to be read the same), --model-front the one Tripo's model faces.
// --anchor centres the top of the fitted garment (that share of its height, 0.3) on the game's: a
// hat's crown on the head. --flipv reads the textures upside down. Keys come from the shared key store
// (gemini, tripo), never printed. Gemini: a few US cents a round. Tripo: 30 credits a model, and the
// retopology's.

import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { getKey } from "../src/core/keys.mjs";
import { bbox, imageOf, primitives, readGlb, writeGlb } from "./glb.mjs";
import { makeTripo } from "./tripo.mjs";

const require = createRequire(import.meta.url);
const core = require("../dist/core.js");

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const projDir = args[0] && !args[0].startsWith("--") ? path.resolve(args[0]) : undefined;
if (!projDir) {
  console.error("Usage: node scripts/reshape-check.mjs <project folder> [--item <record>] [--body feminine|masculine] [--words <words>] [--what <noun>] [--until views|edit|model|fit] [--again] [--task <id>]");
  process.exit(1);
}
const itemId = opt("item", "Items.Hat_02_basic_01");
const body = opt("body", "feminine");
const words = opt("words", "make the brim twice as wide");
const until = opt("until", "views");
const again = args.includes("--again");
const reuse = opt("task");
const flipV = args.includes("--flipv");
const Size = Number(opt("size", "768"));
const ModelVersion = "v3.1-20260211";
const Steps = ["views", "edit", "model", "fit"];
if (!Steps.includes(until)) {
  console.error(`--until is one of ${Steps.join(", ")}`);
  process.exit(1);
}
const upTo = (step) => Steps.indexOf(step) <= Steps.indexOf(until);

const settings = core.vscodeUserSettings();
const game = await core.resolveGame(settings, {}, true);
const choice = core.resolveBridge(settings);
if (!game) fail("no game folder found");
if (!choice) fail("REDbridge.exe not found");

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

const name = path.basename(projDir);
const archive = path.join(projDir, "source", "archive");
const raw = path.join(projDir, "source", "raw");

// ---- drawing ----

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => {
  const l = Math.hypot(...a) || 1;
  return a.map((x) => x / l);
};
const Up = [0, 1, 0];

/** The axis a word like "+z" or "-x" names. */
const axis = (w) => {
  const m = /^([+-])?([xyz])$/i.exec(w ?? "");
  if (!m) fail(`--front takes +x, -x, +z or -z, not ${w}`);
  const v = [0, 0, 0];
  v["xyz".indexOf(m[2].toLowerCase())] = m[1] === "-" ? -1 : 1;
  return v;
};

/**
 * The four views: where the camera sits, from the garment's centre. Left is the garment's own left side
 * (the camera at its left, looking at it), as a tailor's side view; Tripo's naming is unverified.
 */
function views(front) {
  // Facing `front` with up Y, its right is front x up, so its left is up x front.
  const left = cross(Up, front);
  return [
    { view: "front", cam: front },
    { view: "left", cam: left },
    { view: "back", cam: front.map((x) => -x) },
    { view: "right", cam: left.map((x) => -x) },
  ];
}

/**
 * Draws parts orthographically from `cam` on white: each texel from the part's color map, lit softly from
 * above the camera. Drawn at twice the size and halved, for smooth edges. `scale` is pixels per metre.
 */
function draw(parts, cam, center, scale, size) {
  const S = size * 2;
  const right = unit(cross(Up, cam));
  const light = unit([cam[0] * 0.8 + right[0] * -0.3, 0.6, cam[2] * 0.8 + right[2] * -0.3]);
  const depth = new Float64Array(S * S).fill(-Infinity);
  const color = new Float64Array(S * S * 3).fill(255);
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
      // The face's own normal, for parts without normals and to light both sides the same.
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
          let nn = face;
          if (p.nrm) nn = unit([0, 1, 2].map((q) => w0 * p.nrm[a * 3 + q] + w1 * p.nrm[b * 3 + q] + w2 * p.nrm[c * 3 + q]));
          if (dot(nn, cam) < 0) nn = nn.map((v) => -v);
          const shade = 0.45 + 0.6 * Math.max(0, dot(nn, light));
          let rgb = [150, 150, 150];
          if (tex && p.uv) {
            let u = w0 * p.uv[a * 2] + w1 * p.uv[b * 2] + w2 * p.uv[c * 2];
            let v = w0 * p.uv[a * 2 + 1] + w1 * p.uv[b * 2 + 1] + w2 * p.uv[c * 2 + 1];
            u -= Math.floor(u);
            v -= Math.floor(v);
            if (flipV) v = 1 - v;
            const tx = Math.min(tex.width - 1, Math.floor(u * tex.width)), ty = Math.min(tex.height - 1, Math.floor(v * tex.height));
            const o = (ty * tex.width + tx) * 4;
            rgb = [tex.data[o], tex.data[o + 1], tex.data[o + 2]];
          }
          for (let q = 0; q < 3; q++) color[i * 3 + q] = Math.min(255, rgb[q] * shade);
        }
      }
    }
  }
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
  return { width: size, height: size, data: out };
}

/** Four square pictures as one, two by two: front and left above, back and right below. */
function grid(images) {
  const s = images[0].width;
  const out = new Uint8Array(s * 2 * s * 2 * 4);
  images.forEach((img, i) => {
    const ox = (i % 2) * s, oy = Math.floor(i / 2) * s;
    for (let y = 0; y < s; y++) out.set(img.data.subarray(y * s * 4, (y + 1) * s * 4), ((oy + y) * s * 2 + ox) * 4);
  });
  return { width: s * 2, height: s * 2, data: out };
}

/** The four quarters of a picture, in the grid's order, each scaled to `size`. */
function cut(img, size) {
  const hw = Math.floor(img.width / 2), hh = Math.floor(img.height / 2);
  return [0, 1, 2, 3].map((i) => {
    const ox = (i % 2) * hw, oy = Math.floor(i / 2) * hh;
    const data = new Uint8Array(hw * hh * 4);
    for (let y = 0; y < hh; y++) data.set(img.data.subarray(((oy + y) * img.width + ox) * 4, ((oy + y) * img.width + ox + hw) * 4), y * hw * 4);
    const q = { width: hw, height: hh, data };
    return hw === size && hh === size ? q : core.resize(q, size, size, false);
  });
}

/** The box of a picture's non-white pixels, in pixels. */
function silhouette(img) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const o = (y * img.width + x) * 4;
      if (img.data[o] > 245 && img.data[o + 1] > 245 && img.data[o + 2] > 245) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return x1 < 0 ? undefined : { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * A part's triangles without its stray pieces: pieces joined by shared corners (by position, so UV seams
 * do not split them). A piece is dropped when it lies wholly outside the largest piece's box (a scrap
 * beside the model), or holds less than `share` of the triangles; a small piece on the garment, such as a
 * feather in a band, stays.
 */
function mainPieces(p, share) {
  const n = p.pos.length / 3;
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  const join = (a, b) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  const at = new Map();
  for (let v = 0; v < n; v++) {
    const key = `${Math.round(p.pos[v * 3] * 1e5)},${Math.round(p.pos[v * 3 + 1] * 1e5)},${Math.round(p.pos[v * 3 + 2] * 1e5)}`;
    if (at.has(key)) join(v, at.get(key));
    else at.set(key, v);
  }
  for (let t = 0; t < p.idx.length; t += 3) {
    join(p.idx[t], p.idx[t + 1]);
    join(p.idx[t], p.idx[t + 2]);
  }
  const pieces = new Map();
  for (let t = 0; t < p.idx.length; t += 3) {
    const r = find(p.idx[t]);
    if (!pieces.has(r)) pieces.set(r, { tris: 0, lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] });
    const c = pieces.get(r);
    c.tris++;
    for (let k = 0; k < 3; k++) for (let d = 0; d < 3; d++) {
      c.lo[d] = Math.min(c.lo[d], p.pos[p.idx[t + k] * 3 + d]);
      c.hi[d] = Math.max(c.hi[d], p.pos[p.idx[t + k] * 3 + d]);
    }
  }
  const main = [...pieces.values()].sort((a, b) => b.tris - a.tris)[0];
  const outside = (c) => [0, 1, 2].some((d) => c.lo[d] > main.hi[d] || c.hi[d] < main.lo[d]);
  const least = (share * p.idx.length) / 3;
  const out = [];
  for (let t = 0; t < p.idx.length; t += 3) {
    const c = pieces.get(find(p.idx[t]));
    if (c === main || (c.tris >= least && !outside(c))) out.push(p.idx[t], p.idx[t + 1], p.idx[t + 2]);
  }
  return Float64Array.from(out);
}

/** A part with only the vertices its triangles use. */
function compact(p) {
  const map = new Map();
  const idx = new Float64Array(p.idx.length);
  p.idx.forEach((v, i) => {
    if (!map.has(v)) map.set(v, map.size);
    idx[i] = map.get(v);
  });
  const pick = (a, n) => {
    if (!a) return a;
    const out = new Float64Array(map.size * n);
    for (const [v, w] of map) for (let q = 0; q < n; q++) out[w * n + q] = a[v * n + q];
    return out;
  };
  return { ...p, idx, pos: pick(p.pos, 3), nrm: pick(p.nrm, 3), uv: pick(p.uv, 2) };
}

// ---- the game's .glb ----

/** Per-vertex tangents from the UVs (xyz and the handedness in w), for the game's normal mapping. */
function tangents(pos, nrm, uv, idx) {
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
    const N = [nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]];
    let T = [t[v * 3], t[v * 3 + 1], t[v * 3 + 2]];
    T = sub(T, N.map((x) => x * dot(N, T)));
    if (Math.hypot(...T) < 1e-9) T = cross(N, Math.abs(N[1]) < 0.9 ? Up : [1, 0, 0]);
    T = unit(T);
    out.set([...T, dot(cross(N, T), [b[v * 3], b[v * 3 + 1], b[v * 3 + 2]]) < 0 ? -1 : 1], v * 4);
  }
  return out;
}

/**
 * The exported .glb with its mesh parts replaced by one: the fitted parts merged, each vertex fully on
 * the skin's joint `boneIndex`. The armature, the skin and the first part's names and extras are kept,
 * so WolvenKit's import reads it as the game's mesh.
 */
function gameGlb(orig, parts, boneIndex) {
  const json = structuredClone(orig.json);
  const meshNodes = json.nodes.map((n, i) => (n.mesh != null ? i : -1)).filter((i) => i >= 0);
  const keepNode = meshNodes.find((i) => /submesh_0*0(_|$)/i.test(json.nodes[i].name ?? "")) ?? meshNodes[0];
  const drop = new Set(meshNodes.filter((i) => i !== keepNode));
  const remap = new Map();
  json.nodes.forEach((_, i) => {
    if (!drop.has(i)) remap.set(i, remap.size);
  });
  const fix = (list) => list?.filter((i) => remap.has(i)).map((i) => remap.get(i));
  json.nodes = json.nodes.filter((_, i) => !drop.has(i)).map((n) => (n.children ? { ...n, children: fix(n.children) } : n));
  for (const s of json.scenes ?? []) s.nodes = fix(s.nodes);
  for (const s of json.skins ?? []) {
    s.joints = fix(s.joints);
    if (s.skeleton != null) s.skeleton = remap.get(s.skeleton);
  }
  const mesh = json.meshes[orig.json.nodes[keepNode].mesh];
  json.meshes = [mesh];
  json.nodes[remap.get(keepNode)].mesh = 0;

  // The fitted parts as one: positions, normals, UVs and triangles.
  const count = parts.reduce((s, p) => s + p.pos.length / 3, 0);
  const pos = new Float64Array(count * 3), nrm = new Float64Array(count * 3), uv = new Float64Array(count * 2);
  const idx = [];
  let base = 0;
  for (const p of parts) {
    const n = p.pos.length / 3;
    pos.set(p.pos, base * 3);
    if (p.nrm) nrm.set(p.nrm, base * 3);
    if (p.uv) uv.set(p.uv, base * 2);
    for (const i of p.idx) idx.push(i + base);
    base += n;
  }
  // Parts without normals get their faces'.
  for (let i = 0; i < idx.length; i += 3) {
    const [a, b, c] = [idx[i], idx[i + 1], idx[i + 2]];
    if (nrm[a * 3] || nrm[a * 3 + 1] || nrm[a * 3 + 2]) continue;
    const pa = [pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2]];
    const f = unit(cross(sub([pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]], pa), sub([pos[c * 3], pos[c * 3 + 1], pos[c * 3 + 2]], pa)));
    for (const v of [a, b, c]) nrm.set(f, v * 3);
  }
  const chunks = [orig.bin];
  let offset = orig.bin.length;
  const put = (typed, type, componentType, extra = {}) => {
    const pad = (4 - (offset % 4)) % 4;
    if (pad) {
      chunks.push(Buffer.alloc(pad));
      offset += pad;
    }
    const bytes = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length });
    chunks.push(bytes);
    offset += bytes.length;
    const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[type];
    json.accessors.push({ bufferView: json.bufferViews.length - 1, componentType, count: typed.length / comps, type, ...extra });
    return json.accessors.length - 1;
  };
  const lo = [0, 1, 2].map((c) => Math.min(...Array.from({ length: count }, (_, v) => pos[v * 3 + c])));
  const hi = [0, 1, 2].map((c) => Math.max(...Array.from({ length: count }, (_, v) => pos[v * 3 + c])));
  const joints = new Uint16Array(count * 4), weights = new Float32Array(count * 4);
  for (let v = 0; v < count; v++) {
    joints[v * 4] = boneIndex;
    weights[v * 4] = 1;
  }
  const uv32 = Float32Array.from(uv);
  const prim = mesh.primitives[0];
  prim.attributes = {
    POSITION: put(Float32Array.from(pos), "VEC3", 5126, { min: lo, max: hi }),
    NORMAL: put(Float32Array.from(nrm), "VEC3", 5126),
    TANGENT: put(tangents(pos, nrm, uv, idx), "VEC4", 5126),
    COLOR_0: put(new Float32Array(count * 4), "VEC4", 5126),
    TEXCOORD_0: put(uv32, "VEC2", 5126),
    TEXCOORD_1: put(uv32.slice(), "VEC2", 5126),
    JOINTS_0: put(joints, "VEC4", 5123),
    WEIGHTS_0: put(weights, "VEC4", 5126),
  };
  prim.indices = put(Uint32Array.from(idx), "SCALAR", 5125);
  delete prim.targets;
  mesh.primitives = [prim];
  const bin = Buffer.concat(chunks);
  json.buffers = [{ byteLength: bin.length }];
  return writeGlb(json, bin);
}

// ---- the check ----

const bridge = new core.BridgeClient({ exe: choice.exe, gamePath: game.path, dotnetRoot: choice.dotnetRoot });
bridge.on("error", (e) => console.error(`bridge error: ${e.message}`));
bridge.start();
let failed = false;
try {
  for (const d of ["archive", "raw", "resources"]) fs.mkdirSync(path.join(projDir, "source", d), { recursive: true });
  const proj = path.join(projDir, `${name}.cpmodproj`);
  if (!fs.existsSync(proj)) {
    fs.writeFileSync(proj, `<?xml version="1.0" encoding="utf-8"?>\r\n<CP77Mod xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">\r\n  <Name>${name}</Name>\r\n  <ModName>${name}</ModName>\r\n  <Author></Author>\r\n  <Email />\r\n  <Description />\r\n  <Version>1.0.0</Version>\r\n</CP77Mod>\r\n`);
  }

  // 1. The item's meshes for the body, each exported as .glb, with each part's color map.
  const items = await core.loadItems(bridge, core.defaultCacheDir());
  const item = items.find((i) => i.id === itemId);
  if (!item) throw new Error(`No clothing item ${itemId}`);
  const what = opt("what", item.name ?? "garment");
  const look = (await core.itemMaterials(bridge, item)).looks.find((l) => l.body === body) ?? (await core.itemMaterials(bridge, item)).looks[0];
  if (!look) throw new Error(`${itemId} has no look`);
  const work = path.join(raw, "edgemat", "reshape", core.materialSlug(`${item.id} ${look.body ?? body}`));
  fs.mkdirSync(work, { recursive: true });
  console.log(`${item.name} (${item.id}), ${look.body ?? body}: ${look.meshes.length} mesh(es)`);
  const lib = core.loadLibrary(core.defaultCacheDir());
  const parts = [];
  const meshes = [];
  // A mesh this check fitted carries a mark file beside it, so step 1 never draws the fitted one as the game's.
  const fitted = (meshFile) => fs.existsSync(`${meshFile}.reshaped.json`);
  for (const m of look.meshes) {
    const meshFile = path.join(archive, m.mesh);
    fs.mkdirSync(path.dirname(meshFile), { recursive: true });
    if (!fs.existsSync(meshFile)) await bridge.extract(m.mesh, meshFile);
    const meshJson = JSON.parse((await bridge.fileToJson(meshFile)).json).Data.RootChunk;
    const appearance = (meshJson.appearances ?? []).map((a) => a.Data ?? a).find((a) => (a.name?.$value ?? a.name) === m.appearance);
    const chunkMaterials = (appearance?.chunkMaterials ?? []).map((n) => n.$value ?? n);
    // The game's mesh as exported, kept in the work folder: the fit writes its own .glb at the raw path.
    const glbFile = path.join(work, path.basename(m.mesh).replace(/\.mesh$/i, ".original.glb"));
    if (!fs.existsSync(glbFile)) {
      if (fitted(meshFile)) throw new Error(`${meshFile} is a fitted mesh already, and the game's export is gone: delete it and run again`);
      const exported = await bridge.exportFile(meshFile, archive, raw, { meshMaterials: false });
      const rel = exported.written.find((f) => /\.glb$/i.test(f));
      if (!exported.ok || !rel) throw new Error(`WolvenKit's export wrote no .glb: ${JSON.stringify(exported)}`);
      fs.copyFileSync(path.join(raw, rel), glbFile);
    }
    meshes.push({ ...m, file: meshFile, glb: glbFile, chunkMaterials });
    const maps = await core.renderMaterials(bridge, lib, core.defaultCacheDir(), { mesh: m.mesh, appearance: m.appearance }, (l) => console.log(`  ${l}`));
    const textures = new Map(Object.entries(maps).map(([k, v]) => [k, core.readPng(Buffer.from(v.baseColor))]));
    const prims = primitives(readGlb(fs.readFileSync(glbFile)));
    for (const p of prims) {
      const chunk = Number(/submesh_(\d+)/i.exec(p.mesh ?? "")?.[1] ?? -1);
      const material = chunkMaterials[chunk];
      parts.push({ ...p, file: m.mesh, material, texture: textures.get(material) });
    }
    const tris = prims.reduce((s, p) => s + p.idx.length / 3, 0);
    console.log(`  ${m.mesh}, look ${m.appearance}: ${prims.length} parts, ${tris} triangles; colors for ${[...textures.keys()].join(", ") || "none"}`);
  }
  // Only the most detailed level: WolvenKit names the parts submesh_NN_LOD_N, LOD_1 the most detailed.
  const lodOf = (p) => Number(/lod_?(\d+)/i.exec(p.mesh ?? "")?.[1] ?? 0);
  const best = Math.min(...parts.map(lodOf));
  const lod0 = parts.filter((p) => lodOf(p) === best);
  const box = bbox(lod0);
  const center = box.lo.map((l, c) => (l + box.hi[c]) / 2);
  // Half the square, so the changed garment has room to grow.
  const scale = (Size * 0.5) / Math.max(...box.size);
  console.log(`  size ${box.size.map((x) => x.toFixed(3)).join(" x ")} m; drawn at ${scale.toFixed(0)} px a metre`);

  // WolvenKit's export turns the game's forward (+Y) into glTF's -Z.
  const front = axis(opt("front", "-z"));
  const vs = views(front);
  const drawn = vs.map((v) => draw(lod0, v.cam, center, scale, Size));
  vs.forEach((v, i) => fs.writeFileSync(path.join(work, `view_${v.view}.png`), core.writePng(drawn[i])));
  const sheet = path.join(work, "views.png");
  fs.writeFileSync(sheet, core.writePng(grid(drawn)));
  fs.writeFileSync(path.join(work, "views.json"), JSON.stringify({ item: item.id, body: look.body ?? body, meshes: look.meshes.map((m) => ({ mesh: m.mesh, appearance: m.appearance })), front, center, scale, size: Size, box }, null, 2));
  console.log(`Views: ${sheet}`);
  if (!upTo("edit")) throw "stop";

  // 2. The views changed by words, as one picture.
  const slug = core.materialSlug(words);
  const editFile = path.join(work, `edit_${slug}.png`);
  if (again || !fs.existsSync(editFile)) {
    const key = getKey("gemini", { tool: "EDGEmat" });
    if (!key) throw new Error("No Gemini key in the shared key store (service gemini)");
    const model = opt("model") ?? (await core.listModels("gemini", { key, timeoutMs: 30_000 }))[0]?.id;
    const prompt = [
      `The picture shows one ${what} from four sides, on a plain white background, as a 2 by 2 grid of orthographic views: top left from the front, top right from its left side, bottom left from the back, bottom right from its right side.`,
      `Change it: ${words}.`,
      `Show the changed ${what} in the same four views and the same grid, with the same straight-on camera at the same distance and scale (the parts the words do not change stay the same size and place), soft light and plain white background. It may grow past where it was.`,
      "Change only what the words ask, the same way in every view, so the four views show one object. Each view keeps its own details where they are: what shows only from the back stays only in the back view. Keep its colors and materials unless the words change them. No text, labels, shadows on the ground or borders.",
    ].join(" ");
    const start = Date.now();
    const img = await core.editImage("gemini", model, prompt, [{ bytes: fs.readFileSync(sheet), mime: "image/png" }], { key, aspect: "1:1" });
    const png = await core.imageAsPng(bridge, img.bytes, img.mime === "image/png" ? ".png" : ".jpg");
    fs.writeFileSync(editFile, png);
    fs.writeFileSync(editFile.replace(/\.png$/, ".json"), JSON.stringify({ made: new Date().toISOString(), service: "gemini", model, words, prompt: img.prompt }, null, 2));
    console.log(`Gemini (${model}) changed the views in ${((Date.now() - start) / 1000).toFixed(1)} s`);
  } else {
    console.log(`Gemini: the same words as before, the picture kept (--again for a new one)`);
  }
  const edited = core.readPng(fs.readFileSync(editFile));
  const quarters = cut(edited, Size);
  vs.forEach((v, i) => fs.writeFileSync(path.join(work, `edit_${slug}_${v.view}.png`), core.writePng(quarters[i])));
  // How the outline changed, view by view: a first measure of whether the views stayed in step.
  vs.forEach((v, i) => {
    const a = silhouette(drawn[i]), b = silhouette(quarters[i]);
    if (!a || !b) return console.log(`  ${v.view}: ${b ? "" : "nothing drawn in the changed view"}`);
    const m = (px) => (px / scale).toFixed(3);
    console.log(`  ${v.view}: ${m(a.w)} x${m(a.h)} m before, ${m(b.w)} x${m(b.h)} m after; centre moved ${(b.x0 + b.w / 2 - (a.x0 + a.w / 2)).toFixed(0)}, ${(b.y0 + b.h / 2 - (a.y0 + a.h / 2)).toFixed(0)} px`);
  });
  console.log(`Changed: ${editFile}`);
  if (!upTo("model")) throw "stop";

  // 3. A model from the changed views.
  const key = getKey("tripo", { tool: "EDGEmat" });
  if (!key) throw new Error("No Tripo key in the shared key store (service tripo)");
  const { tripo, upload, waitFor, download } = makeTripo(key);
  let task;
  if (reuse) {
    console.log(`Tripo: reusing ${reuse}`);
    task = await waitFor(reuse);
  } else {
    const balance = await tripo("GET", "/account/balance").catch(() => undefined);
    if (balance) console.log(`Tripo: ${JSON.stringify(balance)}`);
    console.log(`Tripo: multiview to model (${ModelVersion}), four views`);
    const inputs = [];
    for (const v of vs) inputs.push({ [v.view]: await upload(path.join(work, `edit_${slug}_${v.view}.png`)) });
    const { task_id } = await tripo("POST", "/generation/multiview-to-model", { inputs, model: ModelVersion, texture: true, pbr: true });
    task = await waitFor(task_id);
  }
  fs.writeFileSync(path.join(work, `${task.task_id}.json`), JSON.stringify(task, null, 2));
  console.log(`  done: ${task.credits_consumed ?? "?"} credits`);
  const out = task.output ?? {};
  const modelFile = path.join(work, `model_${slug}_${task.task_id}.glb`);
  await download(out.model_url ?? out.pbr_model ?? out.model, modelFile);
  if (out.rendered_image_url) {
    const preview = path.join(work, `model_${slug}_${task.task_id}_preview${path.extname(new URL(out.rendered_image_url).pathname) || ".png"}`);
    await download(out.rendered_image_url, preview);
    console.log(`  Tripo's preview: ${preview}`);
  }
  const tris = (ps) => ps.reduce((s, p) => s + p.idx.length / 3, 0);
  console.log(`Model: ${modelFile}: ${tris(primitives(readGlb(fs.readFileSync(modelFile))))} triangles`);

  // 3b. Fewer faces: Tripo's retopology of that model, with its texture baked on.
  const faces = Number(opt("faces", "6000"));
  let lowFile = modelFile;
  if (faces > 0) {
    lowFile = path.join(work, `model_${slug}_${task.task_id}_${faces}.glb`);
    if (!fs.existsSync(lowFile)) {
      console.log(`Tripo: retopology to ${faces} faces, the texture baked on`);
      const { task_id } = await tripo("POST", "/mesh/decimate", { input: task.task_id, model: "v2.0", face_limit: faces, bake: true });
      const low = await waitFor(task_id);
      fs.writeFileSync(path.join(work, `${low.task_id}.json`), JSON.stringify(low, null, 2));
      console.log(`  done: ${low.credits_consumed ?? "?"} credits`);
      await download(low.output?.model_url ?? low.output?.pbr_model ?? low.output?.model, lowFile);
    }
  }
  const model = readGlb(fs.readFileSync(lowFile));
  // Tripo's models face +X; turned about the vertical to face the garment's front.
  const tripoFront = axis(opt("model-front", "+x"));
  const turn = Math.atan2(cross(tripoFront, front)[1], dot(tripoFront, front));
  const [cosT, sinT] = [Math.cos(turn), Math.sin(turn)];
  const rotY = (v) => {
    const out = new Float64Array(v.length);
    for (let k = 0; k < v.length; k += 3) {
      out[k] = v[k] * cosT + v[k + 2] * sinT;
      out[k + 1] = v[k + 1];
      out[k + 2] = -v[k] * sinT + v[k + 2] * cosT;
    }
    return out;
  };
  const res = [];
  for (const p of primitives(model)) {
    const pbr = model.json.materials?.[p.material ?? 0]?.pbrMetallicRoughness ?? {};
    const tex = async (ref) => {
      const img = ref ? imageOf(model, ref.index) : undefined;
      return img ? core.readPng(await core.imageAsPng(bridge, img.bytes, img.ext)) : undefined;
    };
    res.push({ ...p, pos: rotY(p.pos), nrm: p.nrm && rotY(p.nrm), texture: await tex(pbr.baseColorTexture), rough: await tex(pbr.metallicRoughnessTexture) });
  }
  // Tripo leaves small loose pieces beside a model at times: dropped, so they neither show nor widen the fit.
  let dropped = 0;
  res.forEach((p, i) => {
    const kept = mainPieces(p, 0.005);
    dropped += (p.idx.length - kept.length) / 3;
    res[i] = compact({ ...p, idx: kept });
  });
  if (dropped) console.log(`  ${dropped} triangles in small loose pieces dropped`);
  const rb = bbox(res);
  console.log(`  used: ${lowFile}: ${res.length} parts, ${res.reduce((s, p) => s + p.pos.length / 3, 0)} vertices, ${tris(res)} triangles; ${res.filter((p) => p.texture).length} with a color map, ${res.filter((p) => p.rough).length} with roughness`);
  const modelViews = vs.map((v) => draw(res, v.cam, rb.lo.map((l, c) => (l + rb.hi[c]) / 2), (Size * 0.5) / Math.max(...rb.size), Size));
  const modelSheet = path.join(work, `model_${slug}_${task.task_id}_views.png`);
  fs.writeFileSync(modelSheet, core.writePng(grid(modelViews)));
  console.log(`Model views: ${modelSheet}`);
  if (!upTo("fit")) throw "stop";

  // 4. The fit, for a garment that moves with one bone (a hat). Placed where the changed views show it:
  // each view's outline gives the garment's extent across it and up it, in metres, by the views' own scale.
  const want = { lo: [0, 0, 0], hi: [0, 0, 0], n: [0, 0, 0] };
  const add = (k, a, b) => {
    want.lo[k] += Math.min(a, b);
    want.hi[k] += Math.max(a, b);
    want.n[k]++;
  };
  vs.forEach((v, i) => {
    const s = silhouette(quarters[i]);
    if (!s) return;
    const right = unit(cross(Up, v.cam));
    const k = right.map(Math.abs).indexOf(Math.max(...right.map(Math.abs)));
    add(k, center[k] + ((s.x0 - Size / 2) / scale) * right[k], center[k] + ((s.x1 + 1 - Size / 2) / scale) * right[k]);
    add(1, center[1] - (s.y0 - Size / 2) / scale, center[1] - (s.y1 + 1 - Size / 2) / scale);
  });
  if (want.n.some((n) => !n)) throw new Error("The changed views do not show the garment from every side");
  const lo = want.lo.map((x, k) => x / want.n[k]), hi = want.hi.map((x, k) => x / want.n[k]);
  const stretch = [0, 1, 2].map((k) => (hi[k] - lo[k]) / (rb.size[k] || 1));
  console.log(`Fit: ${[0, 1, 2].map((k) => (hi[k] - lo[k]).toFixed(3)).join(" x ")} m from the changed views (the game's: ${box.size.map((x) => x.toFixed(3)).join(" x ")}); Tripo's model stretched ${stretch.map((x) => x.toFixed(3)).join(", ")} (alike when its proportions match the views)`);
  const place = (p) => {
    const pos = new Float64Array(p.pos.length), nrm = p.nrm ? new Float64Array(p.nrm.length) : null;
    for (let k = 0; k < p.pos.length; k += 3) {
      for (let c = 0; c < 3; c++) pos[k + c] = (p.pos[k + c] - rb.lo[c]) * stretch[c] + lo[c];
      // A stretch turns normals by its inverse.
      if (nrm) nrm.set(unit([0, 1, 2].map((c) => p.nrm[k + c] / stretch[c])), k);
    }
    return { ...p, pos, nrm };
  };
  const placed = res.map(place);
  // The box comes from the whole outline, so a brim reaching further one way than the pictures show moves
  // the crown off the head. The part that sits on the body decides where it goes across and front to back:
  // for a hat, its top (the crown, above `--anchor` of its height), centred where the game's crown is.
  const anchor = Number(opt("anchor", "0.3"));
  if (anchor > 0) {
    const topCentre = (ps) => {
      const b = bbox(ps);
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (const p of ps) for (let k = 0; k < p.pos.length; k += 3) {
        if (p.pos[k + 1] < b.hi[1] - anchor * b.size[1]) continue;
        for (let c = 0; c < 3; c++) {
          lo[c] = Math.min(lo[c], p.pos[k + c]);
          hi[c] = Math.max(hi[c], p.pos[k + c]);
        }
      }
      return { centre: lo.map((l, c) => (l + hi[c]) / 2), size: hi.map((h, c) => h - lo[c]) };
    };
    const was = topCentre(lod0), now = topCentre(placed);
    const shift = [was.centre[0] - now.centre[0], 0, was.centre[2] - now.centre[2]];
    for (const p of placed) for (let k = 0; k < p.pos.length; k += 3) for (const c of [0, 2]) p.pos[k + c] += shift[c];
    console.log(`  the top ${Math.round(anchor * 100)}% centred on the game's: moved ${(shift[0] * 100).toFixed(1)} cm across, ${(shift[2] * 100).toFixed(1)} cm front to back; its size there ${(now.size[0] * 100).toFixed(1)} x ${(now.size[2] * 100).toFixed(1)} cm, the game's ${(was.size[0] * 100).toFixed(1)} x ${(was.size[2] * 100).toFixed(1)} cm`);
  }
  const fitSheet = path.join(work, `fit_${slug}_views.png`);
  fs.writeFileSync(fitSheet, core.writePng(grid(vs.map((v) => draw(placed, v.cam, center, scale, Size)))));
  console.log(`Fitted, drawn as the changed views: ${fitSheet}`);

  // The look's first mesh, rebuilt from the fitted model: one part, on the game's skeleton.
  const target = meshes[0];
  const orig = readGlb(fs.readFileSync(target.glb));
  const joints = orig.json.skins?.[0]?.joints ?? [];
  const bone = opt("bone") ?? (joints.length === 1 ? orig.json.nodes[joints[0]].name : undefined);
  if (!bone) throw new Error(`${path.basename(target.mesh)} moves with ${joints.length} bones; the check fits garments on one bone only (--bone <name> to choose)`);
  const boneIndex = joints.findIndex((j) => orig.json.nodes[j].name === bone);
  if (boneIndex < 0) throw new Error(`No bone ${bone} in ${path.basename(target.mesh)}`);
  const glbOut = path.join(raw, target.mesh.replace(/\.mesh$/i, ".glb"));
  fs.mkdirSync(path.dirname(glbOut), { recursive: true });
  fs.writeFileSync(glbOut, gameGlb(orig, placed, boneIndex));
  console.log(`  ${glbOut}: ${placed.reduce((s, p) => s + p.pos.length / 3, 0)} vertices, ${tris(placed)} triangles, on ${bone}`);
  const imported = await bridge.importFile(glbOut, raw, archive, true);
  if (!imported.ok) throw new Error(`WolvenKit's import failed: ${JSON.stringify(imported)}`);
  fs.writeFileSync(`${target.file}.reshaped.json`, JSON.stringify({ made: new Date().toISOString(), words, task: task.task_id, model: path.basename(lowFile) }, null, 2));
  console.log(`  imported over ${target.mesh}: ${imported.written.join(", ")}`);

  // Tripo's colors and roughness as a textured material, on the material the look puts on the first part.
  const folder = `edgemat\\reshape\\${slug}`;
  const stem = core.materialSlug(path.basename(target.mesh, ".mesh")).slice(0, 40);
  const color = res.find((p) => p.texture)?.texture;
  if (!color) throw new Error("Tripo's model has no color texture");
  const d01 = `${folder}\\${stem}_d01.xbm`, r01 = `${folder}\\${stem}_r01.xbm`;
  await core.writeTexture(bridge, archive, d01, core.writePng(color), "color");
  const rough = res.find((p) => p.rough)?.rough;
  if (rough) {
    // glTF keeps roughness in green.
    const grey = new Uint8Array(rough.data.length);
    for (let k = 0; k < grey.length; k += 4) {
      grey[k] = grey[k + 1] = grey[k + 2] = rough.data[k + 1];
      grey[k + 3] = 255;
    }
    await core.writeTexture(bridge, archive, r01, core.writePng({ ...rough, data: grey }), "rough");
  }
  const mi = `${folder}\\${stem}.mi`;
  await core.writeTexturedMaterial(bridge, archive, mi, { baseColor: d01, ...(rough ? { roughness: r01, roughnessScale: 1, roughnessBias: 0 } : { roughnessScale: 0.3, roughnessBias: 0.5 }), layerTile: 1 });
  const material = target.chunkMaterials[0];
  await core.applyMaterial(bridge, archive, target.mesh, material, mi);
  console.log(`  ${material}: ${mi} (${color.width} px${rough ? ", Tripo's roughness" : ""})`);
  const packed = path.join(projDir, "packed", "archive", "pc", "mod");
  fs.mkdirSync(packed, { recursive: true });
  const p = await bridge.pack(archive, packed, name);
  console.log(`packed ${p.files} files into ${p.archive}`);
  console.log(`In the game, REDnode's Console (F10): addItem("${item.id}")`);
} catch (e) {
  if (e !== "stop") {
    failed = true;
    console.error(`FAIL: ${e instanceof Error ? e.stack ?? e.message : e}`);
  }
} finally {
  bridge.stop();
}
process.exit(failed ? 1 : 0);
