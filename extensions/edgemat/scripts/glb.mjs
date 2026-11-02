// GLB reading and writing for the checks (paint check, reshape check): the binary glTF that WolvenKit's
// export writes and Tripo returns. Positions, normals, UVs, triangles and node transforms; no animation.

const Comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

export function readGlb(bytes) {
  const jsonLen = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLen).toString("utf8"));
  const bin = bytes.length > 20 + jsonLen + 8 ? bytes.subarray(20 + jsonLen + 8, 20 + jsonLen + 8 + bytes.readUInt32LE(20 + jsonLen)) : Buffer.alloc(0);
  return { json, bin };
}

export function writeGlb(json, bin) {
  let text = Buffer.from(JSON.stringify(json), "utf8");
  text = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)]);
  const binPadded = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
  const head = Buffer.alloc(12);
  head.write("glTF", 0, "ascii");
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(12 + 8 + text.length + 8 + binPadded.length, 8);
  const chunk = (len, type) => {
    const b = Buffer.alloc(8);
    b.writeUInt32LE(len, 0);
    b.write(type, 4, "ascii");
    return b;
  };
  return Buffer.concat([head, chunk(text.length, "JSON"), text, chunk(binPadded.length, "BIN\0"), binPadded]);
}

export function accessor({ json, bin }, i) {
  const a = json.accessors[i];
  const n = Comps[a.type];
  const out = new Float64Array(a.count * n);
  if (a.bufferView == null) return out;
  const view = json.bufferViews[a.bufferView];
  const size = { 5126: 4, 5125: 4, 5123: 2, 5122: 2, 5121: 1, 5120: 1 }[a.componentType];
  const stride = view.byteStride ?? size * n;
  const off = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const norm = a.normalized ? { 5123: 65535, 5121: 255, 5122: 32767, 5120: 127 }[a.componentType] : 1;
  for (let k = 0; k < a.count; k++) {
    for (let c = 0; c < n; c++) {
      const p = off + k * stride + c * size;
      const value =
        a.componentType === 5126 ? bin.readFloatLE(p)
        : a.componentType === 5125 ? bin.readUInt32LE(p)
        : a.componentType === 5123 ? bin.readUInt16LE(p)
        : a.componentType === 5122 ? bin.readInt16LE(p)
        : a.componentType === 5121 ? bin[p]
        : bin.readInt8(p);
      out[k * n + c] = value / norm;
    }
  }
  return out;
}

const Identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** The world matrix of each node, column-major, from the scene's roots. */
export function worldMatrices(json) {
  const out = new Map();
  const mul = (a, b) => {
    const r = new Array(16).fill(0);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) r[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k];
    return r;
  };
  const local = (n) => {
    if (n.matrix) return n.matrix;
    const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1];
    const [sx, sy, sz] = n.scale ?? [1, 1, 1];
    const [tx, ty, tz] = n.translation ?? [0, 0, 0];
    return [
      (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
      2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
      2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
      tx, ty, tz, 1,
    ];
  };
  const walk = (i, parent) => {
    const m = mul(parent, local(json.nodes[i]));
    out.set(i, m);
    for (const c of json.nodes[i].children ?? []) walk(c, m);
  };
  const scene = json.scenes?.[json.scene ?? 0];
  for (const r of scene?.nodes ?? json.nodes.map((_, i) => i)) walk(r, Identity);
  return out;
}

/** Every primitive of a GLB: world positions and normals, UVs, triangles, and its material. A skinned node's mesh is taken as it is (its bind pose). */
export function primitives(glb) {
  const out = [];
  const world = worldMatrices(glb.json);
  glb.json.nodes.forEach((node, ni) => {
    if (node.mesh == null) return;
    const mesh = glb.json.meshes[node.mesh];
    const m = node.skin != null ? Identity : (world.get(ni) ?? Identity);
    mesh.primitives.forEach((p, pi) => {
      const local = accessor(glb, p.attributes.POSITION);
      const pos = new Float64Array(local.length);
      for (let k = 0; k < local.length; k += 3) {
        const [x, y, z] = [local[k], local[k + 1], local[k + 2]];
        pos[k] = m[0] * x + m[4] * y + m[8] * z + m[12];
        pos[k + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
        pos[k + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
      }
      let nrm = null;
      if (p.attributes.NORMAL != null) {
        const n = accessor(glb, p.attributes.NORMAL);
        nrm = new Float64Array(n.length);
        for (let k = 0; k < n.length; k += 3) {
          const [x, y, z] = [n[k], n[k + 1], n[k + 2]];
          const wx = m[0] * x + m[4] * y + m[8] * z, wy = m[1] * x + m[5] * y + m[9] * z, wz = m[2] * x + m[6] * y + m[10] * z;
          const l = Math.hypot(wx, wy, wz) || 1;
          nrm[k] = wx / l;
          nrm[k + 1] = wy / l;
          nrm[k + 2] = wz / l;
        }
      }
      const uv = p.attributes.TEXCOORD_0 != null ? accessor(glb, p.attributes.TEXCOORD_0) : null;
      const idx = p.indices != null ? accessor(glb, p.indices) : Float64Array.from({ length: pos.length / 3 }, (_, i) => i);
      out.push({ mesh: mesh.name ?? `mesh ${node.mesh}`, node: ni, meshIndex: node.mesh, primitive: pi, pos, nrm, uv, idx, material: p.material });
    });
  });
  return out;
}

export const bbox = (prims) => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of prims) for (let k = 0; k < p.pos.length; k += 3) for (let c = 0; c < 3; c++) {
    lo[c] = Math.min(lo[c], p.pos[k + c]);
    hi[c] = Math.max(hi[c], p.pos[k + c]);
  }
  return { lo, hi, size: hi.map((h, c) => h - lo[c]) };
};

/** The image a texture index points at, as bytes and a file extension. */
export function imageOf(glb, textureIndex) {
  const tex = glb.json.textures?.[textureIndex];
  const img = tex != null ? glb.json.images?.[tex.source ?? tex.extensions?.EXT_texture_webp?.source] : undefined;
  if (!img || img.bufferView == null) return undefined;
  const v = glb.json.bufferViews[img.bufferView];
  const bytes = glb.bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength);
  const ext = img.mimeType === "image/png" ? ".png" : img.mimeType === "image/webp" ? ".webp" : ".jpg";
  return { bytes: Buffer.from(bytes), ext };
}
