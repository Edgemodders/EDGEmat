// The paint check (design, "Open questions": paint a garment by words with Tripo). Exports an item's
// garment from your own game as .glb, sends its painted parts to Tripo's Texture task with your words,
// and checks what comes back: does Tripo keep the garment's own vertices and UVs? If it does, the
// painted color and roughness go on the garment as a textured material (the garment's own normal map
// kept), in a WolvenKit project, packed. Run `npm run build` first. Steps and what to look for:
// docs/testing.md, "Paint check".
//
//   node scripts/paint-check.mjs <project folder> [--item Items.Q001_Pants] [--body feminine]
//                                [--words "yellow with black polka dots"] [--quality standard]
//                                [--style <image>] [--task <Tripo task id>] [--flip] [--dry]
//
// --style sends a picture (png, jpg or webp) beside the words, as Tripo's style image: a swatch of the
// pattern wanted, for one the words alone do not bring.
// The Tripo key: TRIPO_API_KEY, else the dev PC's shared key store through REDnode's checkout (devKey.mjs), never printed.
// --task reuses a finished task instead of paying for a new one. --flip turns the painted image upside
// down, for when it shows mirrored top to bottom in the game. --dry stops before Tripo (no key needed). One Texture task is 10 credits (US$0.10),
// 20 at "detailed".

import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { devKey } from "./devKey.mjs";

const require = createRequire(import.meta.url);
const core = require("../dist/core.js");
const { bbox, imageOf, primitives, readGlb, writeGlb } = core;

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const projDir = args[0] && !args[0].startsWith("--") ? path.resolve(args[0]) : undefined;
if (!projDir) {
  console.error("Usage: node scripts/paint-check.mjs <project folder> [--item <record>] [--body feminine|masculine] [--words <words>] [--quality standard|detailed] [--style <image>] [--task <id>] [--flip]");
  process.exit(1);
}
const itemId = opt("item", "Items.Q001_Pants");
const body = opt("body", "feminine");
const words = opt("words", "yellow with black polka dots");
const quality = opt("quality", "standard");
const reuse = opt("task");
const style = opt("style") && path.resolve(opt("style"));
if (style && !fs.existsSync(style)) {
  console.error(`No style image at ${style}`);
  process.exit(1);
}
const flip = args.includes("--flip");
const dry = args.includes("--dry");

const TextureModel = "v3.5-20260815";

const settings = core.vscodeUserSettings();
const game = await core.resolveGame(settings, {}, true);
const choice = core.resolveBridge(settings);
if (!game) fail("no game folder found");
if (!choice) fail("REDbridge.exe not found");
const needKey = !dry && !opt("result");
const key = needKey ? await devKey("tripo") : undefined;
// Tripo through the core: its calls, uploads, waits (each change logged) and downloads.
const client = key ? new core.Tripo(key, { log: (l) => console.log(`  ${l}`) }) : undefined;
const tripo = (method, route, body) => client.call(method, route, body);
const upload = (file) => client.upload(file);
const waitFor = (id) => client.wait(id, (p, s) => console.log(`  ${id}: ${s} ${p}`));
const download = (url, file) => client.download(url, file);
if (!key && needKey) process.exit(1);

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

const name = path.basename(projDir);
const archive = path.join(projDir, "source", "archive");
const raw = path.join(projDir, "source", "raw");
const work = path.join(raw, "edgemat", "tripo");

const fmt = (v) => v.map((x) => x.toFixed(3)).join(", ");

/** How much of the UV square two or more triangles share (mirrored or stacked islands), at 512 px. */
function uvShared(prims) {
  const N = 512;
  const grid = new Uint16Array(N * N);
  for (const p of prims) {
    if (!p.uv) continue;
    for (let t = 0; t < p.idx.length; t += 3) {
      const P = [0, 1, 2].map((q) => [p.uv[p.idx[t + q] * 2] * N, p.uv[p.idx[t + q] * 2 + 1] * N]);
      const [a, b, c] = P;
      const area = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
      if (Math.abs(area) < 1e-9) continue;
      const xs = [a[0], b[0], c[0]], ys = [a[1], b[1], c[1]];
      for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(N - 1, Math.ceil(Math.max(...ys))); y++) {
        for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(N - 1, Math.ceil(Math.max(...xs))); x++) {
          const px = x + 0.5, py = y + 0.5;
          const w0 = ((b[0] - px) * (c[1] - py) - (c[0] - px) * (b[1] - py)) / area;
          const w1 = ((c[0] - px) * (a[1] - py) - (a[0] - px) * (c[1] - py)) / area;
          if (w0 >= 0 && w1 >= 0 && w0 + w1 <= 1) grid[y * N + x]++;
        }
      }
    }
  }
  let used = 0, shared = 0;
  for (const g of grid) {
    if (g) used++;
    if (g > 1) shared++;
  }
  return { used: used / grid.length, shared: shared / Math.max(1, used) };
}

/**
 * Matches the result's vertices to the original's by position, under a transform, and compares UVs.
 * Returns the share of result vertices found at an original vertex, of those whose UV is the same,
 * the same flipped (v to 1 - v), and for each result primitive the original part most of it sits on.
 */
function compare(orig, result, transform, eps) {
  const cell = eps * 4;
  const grid = new Map();
  const keyOf = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  orig.forEach((p, pi) => {
    for (let k = 0; k < p.pos.length / 3; k++) {
      const [x, y, z] = transform([p.pos[k * 3], p.pos[k * 3 + 1], p.pos[k * 3 + 2]]);
      const key = keyOf(x, y, z);
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push([x, y, z, pi, k]);
    }
  });
  let total = 0, found = 0, same = 0, flipped = 0;
  const owner = [];
  for (const r of result) {
    const votes = new Map();
    for (let k = 0; k < r.pos.length / 3; k++) {
      total++;
      const x = r.pos[k * 3], y = r.pos[k * 3 + 1], z = r.pos[k * 3 + 2];
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
      let best, bestD = eps * eps;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        for (const o of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) {
          const d = (o[0] - x) ** 2 + (o[1] - y) ** 2 + (o[2] - z) ** 2;
          if (d <= bestD) {
            // Seams have two vertices at one place: prefer the one whose UV matches.
            if (best && d === bestD && r.uv) {
              const ou = orig[o[3]].uv, bu = orig[best[3]].uv;
              const dist = (u) => Math.abs(u[o[4] * 2] - r.uv[k * 2]) + Math.abs(u[o[4] * 2 + 1] - r.uv[k * 2 + 1]);
              if (ou && bu && dist(ou) >= Math.abs(bu[best[4] * 2] - r.uv[k * 2]) + Math.abs(bu[best[4] * 2 + 1] - r.uv[k * 2 + 1])) continue;
            }
            best = o;
            bestD = d;
          }
        }
      }
      if (!best) continue;
      found++;
      votes.set(best[3], (votes.get(best[3]) ?? 0) + 1);
      const ou = orig[best[3]].uv;
      if (!ou || !r.uv) continue;
      const u = ou[best[4] * 2], v = ou[best[4] * 2 + 1], ru = r.uv[k * 2], rv = r.uv[k * 2 + 1];
      if (Math.abs(u - ru) < 2e-3 && Math.abs(v - rv) < 2e-3) same++;
      else if (Math.abs(u - ru) < 2e-3 && Math.abs(1 - v - rv) < 2e-3) flipped++;
    }
    owner.push([...votes].sort((a, b) => b[1] - a[1])[0]?.[0]);
  }
  return { total, found: found / Math.max(1, total), same: same / Math.max(1, found), flipped: flipped / Math.max(1, found), owner };
}

// ---- images ----

const flipImage = (img) => {
  const row = img.width * 4;
  const out = new Uint8Array(img.data.length);
  for (let y = 0; y < img.height; y++) out.set(img.data.subarray(y * row, (y + 1) * row), (img.height - 1 - y) * row);
  return { ...img, data: out };
};

/** glTF's metallicRoughness map keeps roughness in green: a grey roughness map from it. */
const roughFrom = (img) => {
  const out = new Uint8Array(img.data.length);
  for (let k = 0; k < img.data.length; k += 4) {
    out[k] = out[k + 1] = out[k + 2] = img.data[k + 1];
    out[k + 3] = 255;
  }
  return { ...img, data: out };
};

// ---- the check ----

const bridge = new core.BridgeClient({ exe: choice.exe, gamePath: game.path, dotnetRoot: choice.dotnetRoot });
bridge.on("error", (e) => console.error(`bridge error: ${e.message}`));
bridge.start();
let failed = false;
try {
  for (const d of ["archive", "raw", "resources"]) fs.mkdirSync(path.join(projDir, "source", d), { recursive: true });
  fs.mkdirSync(work, { recursive: true });
  const proj = path.join(projDir, `${name}.cpmodproj`);
  if (!fs.existsSync(proj)) {
    fs.writeFileSync(proj, `<?xml version="1.0" encoding="utf-8"?>\r\n<CP77Mod xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">\r\n  <Name>${name}</Name>\r\n  <ModName>${name}</ModName>\r\n  <Author></Author>\r\n  <Email />\r\n  <Description />\r\n  <Version>1.0.0</Version>\r\n</CP77Mod>\r\n`);
  }

  // 1. The item's garment for the body, and its painted parts: the chunks whose material is layered.
  const items = await core.loadItems(bridge, core.defaultCacheDir());
  const item = items.find((i) => i.id === itemId);
  if (!item) throw new Error(`No clothing item ${itemId}`);
  const look = (await core.itemMaterials(bridge, item)).looks.find((l) => l.body === body);
  if (!look) throw new Error(`${itemId} has no ${body} look`);
  const meshLook = look.meshes.find((m) => m.materials.some((x) => x.multilayered)) ?? look.meshes[0];
  const meshPath = meshLook.mesh;
  console.log(`${item.name} (${item.id}), ${body}: ${meshPath}, look ${meshLook.appearance}`);
  const meshFile = path.join(archive, meshPath);
  fs.mkdirSync(path.dirname(meshFile), { recursive: true });
  await bridge.extract(meshPath, meshFile);
  const meshJson = JSON.parse((await bridge.fileToJson(meshFile)).json).Data.RootChunk;
  const appearance = (meshJson.appearances ?? []).map((a) => a.Data ?? a).find((a) => (a.name?.$value ?? a.name) === meshLook.appearance);
  const chunkMaterials = (appearance?.chunkMaterials ?? []).map((n) => n.$value ?? n);
  const paint = meshLook.materials.filter((m) => m.multilayered);
  if (!paint.length) throw new Error("The look has no layered material to paint");
  const paintNames = new Set(paint.map((m) => m.name));
  console.log(`  painted: ${paint.map((m) => m.name).join(", ")}; kept: ${meshLook.materials.filter((m) => !m.multilayered).map((m) => m.name).join(", ") || "none"}`);

  // 2. As .glb, then only the painted parts, with positions, normals and UVs (no bones, shape keys or game data).
  const exported = await bridge.exportFile(meshFile, archive, raw, { meshMaterials: false });
  const glbRel = exported.written.find((f) => /\.glb$/i.test(f));
  if (!exported.ok || !glbRel) throw new Error(`WolvenKit's export wrote no .glb: ${JSON.stringify(exported)}`);
  const source = readGlb(fs.readFileSync(path.join(raw, glbRel)));
  const plain = structuredClone(source.json);
  const keepAttr = ["POSITION", "NORMAL", "TEXCOORD_0"];
  const chunkOf = (meshName) => Number(/submesh_(\d+)/i.exec(meshName ?? "")?.[1] ?? -1);
  for (const node of plain.nodes) {
    delete node.skin;
    if (node.mesh == null) continue;
    if (!paintNames.has(chunkMaterials[chunkOf(plain.meshes[node.mesh].name)])) delete node.mesh;
  }
  for (const m of plain.meshes) {
    delete m.extras;
    delete m.weights;
    for (const p of m.primitives) {
      for (const a of Object.keys(p.attributes)) if (!keepAttr.includes(a)) delete p.attributes[a];
      delete p.targets;
      delete p.material;
    }
  }
  delete plain.skins;
  delete plain.materials;
  delete plain.animations;
  const uploadFile = path.join(work, `${path.basename(glbRel, ".glb")}_paint.glb`);
  fs.writeFileSync(uploadFile, writeGlb(plain, source.bin));
  const orig = primitives({ json: plain, bin: source.bin });
  const ob = bbox(orig);
  const shared = uvShared(orig);
  console.log(`  sent: ${orig.length} parts, ${orig.reduce((s, p) => s + p.pos.length / 3, 0)} vertices, ${orig.reduce((s, p) => s + p.idx.length / 3, 0)} triangles; size ${fmt(ob.size)} m`);
  console.log(`  its UVs use ${(100 * shared.used).toFixed(1)}% of the square; ${(100 * shared.shared).toFixed(1)}% of that twice or more (mirrored or stacked: those spots get one paint)`);

  // 3. Tripo's Texture task.
  if (dry && !opt("result")) {
    const self = compare(orig, primitives(readGlb(fs.readFileSync(uploadFile))), (p) => p, Math.hypot(...ob.size) * 1e-4);
    console.log(`  the matching, on the file itself: ${(100 * self.found).toFixed(1)}% found, ${(100 * self.same).toFixed(1)}% same UV (expect 100 and 100)`);
    console.log(`Dry run: ${uploadFile} is what would go to Tripo.`);
    process.exitCode = 0;
    throw "stop";
  }
  let task;
  const local = opt("result");
  if (local) {
    // A result on disk instead of Tripo's, to test the steps after it.
    task = { task_id: path.basename(local, ".glb"), output: {} };
  } else if (reuse) {
    console.log(`Tripo: reusing ${reuse}`);
    task = await waitFor(reuse);
  } else {
    console.log(`Tripo: upload, then Texture "${words}"${style ? ` with the style image ${path.basename(style)}` : ""} (${TextureModel}, ${quality})`);
    const token = await upload(uploadFile);
    const prompt = { text: words };
    if (style) prompt.style_image = { file_token: await upload(style) };
    const { task_id } = await tripo("POST", "/models/texture", { input: token, model: TextureModel, texture_prompt: prompt, pbr: true, texture_quality: quality });
    task = await waitFor(task_id);
  }
  if (!local) {
    fs.writeFileSync(path.join(work, `${task.task_id}.json`), JSON.stringify(task, null, 2));
    console.log(`  done: ${task.credits_consumed ?? "?"} credits`);
  }
  const out = task.output ?? {};
  const resultBytes = local ? fs.readFileSync(local) : await download(out.model_url ?? out.pbr_model ?? out.model, path.join(work, `${task.task_id}.glb`));
  if (out.rendered_image_url) {
    const preview = path.join(work, `${task.task_id}_preview${path.extname(new URL(out.rendered_image_url).pathname) || ".png"}`);
    await download(out.rendered_image_url, preview);
    console.log(`  Tripo's preview: ${preview}`);
  }

  // 4. Did Tripo keep the garment's vertices and UVs?
  const result = readGlb(resultBytes);
  const res = primitives(result);
  const rb = bbox(res);
  console.log(`Result: ${res.length} parts, ${res.reduce((s, p) => s + p.pos.length / 3, 0)} vertices, ${res.reduce((s, p) => s + p.idx.length / 3, 0)} triangles; size ${fmt(rb.size)}; ${result.json.materials?.length ?? 0} materials, ${result.json.images?.length ?? 0} images`);
  const s = out.normalize_scale, t = out.normalize_translation;
  const diag = Math.hypot(...rb.size) || 1;
  const fit = Math.hypot(...rb.size) / (Math.hypot(...ob.size) || 1);
  const center = (b) => b.lo.map((l, c) => (l + b.hi[c]) / 2);
  const oc = center(ob), rc = center(rb);
  const transforms = [
    ["as sent", (p) => p],
    ...(s ? [["Tripo's normalize", (p) => p.map((x, c) => x * s + (t?.[c] ?? 0))]] : []),
    ["fitted to the result's box", (p) => p.map((x, c) => (x - oc[c]) * fit + rc[c])],
  ];
  let best;
  for (const [label, f] of transforms) {
    const c = compare(orig, res, f, diag * 1e-4);
    console.log(`  ${label}: ${(100 * c.found).toFixed(1)}% of its vertices sit on the garment's; of those, ${(100 * c.same).toFixed(1)}% keep their UV${c.flipped > 0.01 ? `, ${(100 * c.flipped).toFixed(1)}% flipped` : ""}`);
    if (!best || c.found > best.found) best = { ...c, label };
  }
  const kept = best.found > 0.9 && best.same + best.flipped > 0.9;
  console.log(kept ? `KEPT: Tripo kept the garment's vertices and UVs (${best.label}).` : `NOT KEPT: Tripo changed the garment's vertices or UVs; its paint needs a bake onto the game's UVs. Nothing applied.`);
  if (!kept) {
    failed = true;
  } else {
    // 5. The paint on the garment: color and roughness from Tripo, the garment's own normal map.
    const slug = core.materialSlug(`tripo ${words}`);
    const folder = `edgemat\\materials\\${slug}`;
    const flipV = flip !== best.flipped > best.same;
    const written = [];

    /** Calls fn for each texel (x, y) whose centre a part's triangles cover in the UV square, at W × H. */
    const rasterize = (p, W, H, fn) => {
      for (let t = 0; t < p.idx.length; t += 3) {
        const [a, b, c] = [0, 1, 2].map((q) => [p.uv[p.idx[t + q] * 2] * W, p.uv[p.idx[t + q] * 2 + 1] * H]);
        const area = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
        if (Math.abs(area) < 1e-12) continue;
        const xs = [a[0], b[0], c[0]], ys = [a[1], b[1], c[1]];
        for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(H - 1, Math.ceil(Math.max(...ys))); y++) {
          for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(W - 1, Math.ceil(Math.max(...xs))); x++) {
            const px = x + 0.5, py = y + 0.5;
            const w0 = ((b[0] - px) * (c[1] - py) - (c[0] - px) * (b[1] - py)) / area;
            const w1 = ((c[0] - px) * (a[1] - py) - (a[0] - px) * (c[1] - py)) / area;
            if (w0 >= 0 && w1 >= 0 && w0 + w1 <= 1) fn(x, y);
          }
        }
      }
    };

    /**
     * One map from the materials of a game material's parts: each texel from the material whose part
     * covers it in the UV square, then the islands' edge colors pushed 16 texels out into the empty
     * texture (Tripo leaves it black), so the game's smaller mip levels show no dark or glossy seams.
     * Each material's own map is saved in the work folder as well.
     */
    const composite = async (groups, pick, label) => {
      const layers = [];
      for (const [mi, prims] of groups) {
        const pbr = result.json.materials?.[mi]?.pbrMetallicRoughness ?? {};
        const ref = pick(pbr);
        const img = ref ? imageOf(result, ref.index) : undefined;
        if (!img) continue;
        const png = core.readPng(await core.imageAsPng(bridge, img.bytes, img.ext));
        fs.writeFileSync(path.join(work, `${label}_tripo_material${mi}.png`), core.writePng(png));
        layers.push({ mi, prims, img: png });
      }
      if (!layers.length) return undefined;
      // Tripo sizes each part's maps to the part: the smaller ones are scaled to the largest.
      const W = Math.max(...layers.map((l) => l.img.width)), H = Math.max(...layers.map((l) => l.img.height));
      for (const l of layers) {
        if (l.img.width === W && l.img.height === H) continue;
        console.log(`  ${label}: material ${l.mi}'s ${l.img.width} px map scaled to ${W} px`);
        l.img = core.resize(l.img, W, H, false);
      }
      const owner = new Int16Array(W * H).fill(-1);
      layers.forEach((l, li) => {
        for (const p of l.prims) rasterize(p, W, H, (x, y) => (owner[y * W + x] = li));
      });
      let data = new Uint8Array(W * H * 4);
      let filled = new Uint8Array(W * H);
      const counts = layers.map(() => 0);
      for (let i = 0; i < W * H; i++) {
        if (owner[i] < 0) continue;
        counts[owner[i]]++;
        filled[i] = 1;
        data.set(layers[owner[i]].img.data.subarray(i * 4, i * 4 + 4), i * 4);
      }
      // Push the edges out: an empty texel takes the average of its filled neighbours, 16 times.
      const edge = [-1, 1, -W, W];
      for (let pass = 0; pass < 16; pass++) {
        const nextData = data.slice(), nextFilled = filled.slice();
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const i = y * W + x;
            if (filled[i]) continue;
            let n = 0, r = 0, g = 0, b = 0;
            for (const d of edge) {
              const j = i + d;
              if ((d === -1 && x === 0) || (d === 1 && x === W - 1) || j < 0 || j >= W * H || !filled[j]) continue;
              r += data[j * 4];
              g += data[j * 4 + 1];
              b += data[j * 4 + 2];
              n++;
            }
            if (!n) continue;
            nextData.set([Math.round(r / n), Math.round(g / n), Math.round(b / n), 255], i * 4);
            nextFilled[i] = 1;
          }
        }
        data = nextData;
        filled = nextFilled;
      }
      // Whatever is still empty is far from every island: the islands' average color.
      const avg = [0, 0, 0];
      let n = 0;
      for (let i = 0; i < W * H; i++) if (owner[i] >= 0) for (let c = 0; c < 3; c++) avg[c] += data[i * 4 + c];
      for (let i = 0; i < W * H; i++) if (owner[i] >= 0) n++;
      for (let i = 0; i < W * H; i++) if (!filled[i]) data.set([...avg.map((v) => Math.round(v / Math.max(1, n))), 255], i * 4);
      console.log(`  ${label}: ${counts.map((c, li) => `material ${layers[li].mi} ${((100 * c) / (W * H)).toFixed(1)}%`).join(", ")} of the texture; edges padded`);
      return { width: W, height: H, data };
    };
    for (const m of paint) {
      // The result's material on the part that sits on this material's chunks.
      const parts = res.map((r, i) => ({ r, i })).filter(({ i }) => paintNames.has(m.name) && orig[best.owner[i]] && chunkMaterials[chunkOf(orig[best.owner[i]].mesh)] === m.name);
      // Tripo gives each part its own material and textures; one game material over several parts
      // gets one texture, each texel from the part that covers it in the UV square.
      const groups = new Map();
      for (const { r } of parts) {
        const k = r.material ?? 0;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(r);
      }
      // The folder names the words; the files only the material, so paths stay under Windows' 260 characters.
      const stem = core.materialSlug(m.name);
      const d01 = `${folder}\\${stem}_d01.xbm`, r01 = `${folder}\\${stem}_r01.xbm`;
      if (groups.size > 1) console.log(`  ${m.name}: ${groups.size} Tripo materials on its ${parts.length} parts, put together by UV`);
      const color = await composite(groups, (pbr) => pbr.baseColorTexture, `${stem}_color`);
      if (!color) throw new Error(`The result has no color texture for ${m.name}`);
      const colorImg = flipV ? flipImage(color) : color;
      written.push(...(await core.writeTexture(bridge, archive, d01, core.writePng(colorImg), "color")));
      fs.writeFileSync(path.join(work, `${stem}_color.png`), core.writePng(colorImg));
      let rough;
      const mr = await composite(groups, (pbr) => pbr.metallicRoughnessTexture, `${stem}_mr`);
      if (mr) {
        written.push(...(await core.writeTexture(bridge, archive, r01, core.writePng(roughFrom(flipV ? flipImage(mr) : mr)), "rough")));
        rough = r01;
      }
      const folds = m.globalNormal ?? m.normal;
      const mi = `${folder}\\${stem}.mi`;
      written.push(...(await core.writeTexturedMaterial(bridge, archive, mi, { baseColor: d01, ...(folds ? { normal: folds } : {}), ...(rough ? { roughness: rough, roughnessScale: 1, roughnessBias: 0 } : { roughnessScale: 0.3, roughnessBias: 0.4 }), layerTile: 1 })));
      written.push(...(await core.applyMaterial(bridge, archive, meshPath, m.name, mi)));
      console.log(`  ${m.name}: ${mi}${folds ? `, its own normal ${folds.split("\\").pop()}` : ", no normal map"}${rough ? ", Tripo's roughness" : ""}${flipV ? ", flipped" : ""} (${colorImg.width} px)`);
    }
    fs.writeFileSync(path.join(work, `${slug}.edgemat.json`), JSON.stringify({ made: new Date().toISOString(), tool: "EDGEmat paint check", service: "Tripo", model: TextureModel, task: task.task_id, words, quality, item: item.id, body, mesh: meshPath, files: [...new Set(written)] }, null, 2));
    const packed = path.join(projDir, "packed", "archive", "pc", "mod");
    fs.mkdirSync(packed, { recursive: true });
    const p = await bridge.pack(archive, packed, name);
    console.log(`packed ${p.files} files into ${p.archive}`);
    console.log(`In the game, REDnode's Console (F10): addItem("${item.id}")`);
  }
} catch (e) {
  if (e !== "stop") {
    failed = true;
    console.error(`FAIL: ${e instanceof Error ? e.message : e}`);
  }
} finally {
  bridge.stop();
}
process.exit(failed ? 1 : 0);
