// The reshape check (design, "Reshape: a garment's shape changed by words", "A reshape check first"):
// steps 1 to 3 of Reshape on one item. 1. Pictures of the garment from its own mesh and look, front, left,
// back and right. 2. Those pictures changed by words with Gemini, as one picture so the views change
// together. 3. A 3D model from the changed views with Tripo's multiview to model. Each step's files are kept
// in the project's raw folder and reused, so a step can be looked at before paying for the next.
// Run `npm run build` first. Steps and what to look for: docs/testing.md, "Reshape check".
//
//   node scripts/reshape-check.mjs <project folder> [--item Items.Hat_02_basic_01] [--body feminine]
//        [--words "make the brim twice as wide"] [--what "cowboy hat"] [--until views|edit|model]
//        [--again] [--task <Tripo task id>] [--front +z] [--flipv] [--size 768]
//
// --until stops after that step (default: views, so nothing is paid for until asked). --again asks Gemini
// once more for the same words. --task reuses a finished Tripo task. --front is the direction the garment
// faces in the exported .glb; --flipv reads the textures upside down. Keys come from the shared key store
// (gemini, tripo), never printed. Gemini: a few US cents a round. Tripo: about 30 to 50 credits a model.

import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { getKey } from "../src/core/keys.mjs";
import { bbox, imageOf, primitives, readGlb } from "./glb.mjs";
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
  console.error("Usage: node scripts/reshape-check.mjs <project folder> [--item <record>] [--body feminine|masculine] [--words <words>] [--what <noun>] [--until views|edit|model] [--again] [--task <id>]");
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
const Steps = ["views", "edit", "model"];
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
  // Facing `front` with up Y, its right is front × up, so its left is up × front.
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
  for (const m of look.meshes) {
    const meshFile = path.join(archive, m.mesh);
    fs.mkdirSync(path.dirname(meshFile), { recursive: true });
    if (!fs.existsSync(meshFile)) await bridge.extract(m.mesh, meshFile);
    const meshJson = JSON.parse((await bridge.fileToJson(meshFile)).json).Data.RootChunk;
    const appearance = (meshJson.appearances ?? []).map((a) => a.Data ?? a).find((a) => (a.name?.$value ?? a.name) === m.appearance);
    const chunkMaterials = (appearance?.chunkMaterials ?? []).map((n) => n.$value ?? n);
    const glbFile = path.join(raw, m.mesh.replace(/\.mesh$/i, ".glb"));
    if (!fs.existsSync(glbFile)) {
      const exported = await bridge.exportFile(meshFile, archive, raw, { meshMaterials: false });
      if (!exported.ok || !exported.written.some((f) => /\.glb$/i.test(f))) throw new Error(`WolvenKit's export wrote no .glb: ${JSON.stringify(exported)}`);
    }
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
  console.log(`  size ${box.size.map((x) => x.toFixed(3)).join(" Ã— ")} m; drawn at ${scale.toFixed(0)} px a metre`);

  const front = axis(opt("front", "+z"));
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
    console.log(`  ${v.view}: ${m(a.w)} Ã— ${m(a.h)} m before, ${m(b.w)} Ã— ${m(b.h)} m after; centre moved ${(b.x0 + b.w / 2 - (a.x0 + a.w / 2)).toFixed(0)}, ${(b.y0 + b.h / 2 - (a.y0 + a.h / 2)).toFixed(0)} px`);
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
  const res = primitives(readGlb(fs.readFileSync(modelFile)));
  const rb = bbox(res);
  console.log(`Model: ${modelFile}: ${res.length} parts, ${res.reduce((s, p) => s + p.pos.length / 3, 0)} vertices, ${res.reduce((s, p) => s + p.idx.length / 3, 0)} triangles; size ${rb.size.map((x) => x.toFixed(3)).join(" Ã— ")}`);
  // Tripo's model, drawn as the game's was, to set beside the views (its own colors).
  const rc = rb.lo.map((l, c) => (l + rb.hi[c]) / 2);
  const glb = readGlb(fs.readFileSync(modelFile));
  const withTex = [];
  for (const p of res) {
    const ref = glb.json.materials?.[p.material ?? 0]?.pbrMetallicRoughness?.baseColorTexture;
    const img = ref ? imageOf(glb, ref.index) : undefined;
    withTex.push({ ...p, texture: img ? core.readPng(await core.imageAsPng(bridge, img.bytes, img.ext)) : undefined });
  }
  const tScale = (Size * 0.8) / Math.max(...rb.size);
  const tripoFront = axis(opt("model-front", "+z"));
  const modelViews = views(tripoFront).map((v) => draw(withTex, v.cam, rc, tScale, Size));
  const modelSheet = path.join(work, `model_${slug}_${task.task_id}_views.png`);
  fs.writeFileSync(modelSheet, core.writePng(grid(modelViews)));
  console.log(`Model views: ${modelSheet}`);
} catch (e) {
  if (e !== "stop") {
    failed = true;
    console.error(`FAIL: ${e instanceof Error ? e.stack ?? e.message : e}`);
  }
} finally {
  bridge.stop();
}
process.exit(failed ? 1 : 0);
