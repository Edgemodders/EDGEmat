// A game mesh's UVs (and so its materials) carried onto a new shape of it (design, "Reshape", the game's
// material kept). 1. The game mesh is bent onto the new shape: each vertex pulled to the new surface and
// the new surface's points pulling back, the pulls smoothed over the mesh, so a part made twice as wide
// stretches the old part with it instead of piling it at the old edge. 2. Each triangle of the new shape
// takes the submesh and UV island of the nearest bent triangle facing the same way; each of its corners
// takes the UVs (both sets) and vertex color of the nearest point on that island. Corners are split per
// island, so the new shape has seams where the old one had them.

type Vec3 = [number, number, number];

/** A mesh in plain arrays: positions (xyz), triangles. */
export interface Surface {
  pos: Float64Array;
  idx: ArrayLike<number>;
}

/** One submesh of the game mesh: its triangles and what each vertex carries. */
export interface SourcePart extends Surface {
  uv: Float64Array | null;
  uv1?: Float64Array | null;
  color?: Float64Array | null;
}

/** One submesh of the result: the new shape's triangles that took this part's material. */
export interface TransferredPart {
  pos: Float64Array;
  nrm: Float64Array;
  uv: Float64Array;
  uv1: Float64Array;
  color: Float64Array;
  idx: number[];
}

// ---------- small vector helpers ----------

const at = (a: ArrayLike<number>, i: number): Vec3 => [a[i * 3], a[i * 3 + 1], a[i * 3 + 2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** The closest point of triangle abc to p, as barycentric weights (Ericson, Real-Time Collision Detection 5.1.5). */
function closestBary(p: Vec3, a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return [1, 0, 0];
  const bp = sub(p, b);
  const d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return [0, 1, 0];
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3 || 1);
    return [1 - v, v, 0];
  }
  const cp = sub(p, c);
  const d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return [0, 0, 1];
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6 || 1);
    return [1 - w, 0, w];
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6) || 1);
    return [0, 1 - w, w];
  }
  const denom = 1 / (va + vb + vc || 1);
  const v = vb * denom, w = vc * denom;
  return [1 - v - w, v, w];
}

// ---------- a grid for nearest searches ----------

/** Items (triangles or points) in a uniform grid, searched ring by ring around a point. */
class Grid {
  private cells = new Map<number, number[]>();
  private lo: Vec3;
  private n: Vec3;
  private stamp: Int32Array;
  private round = 0;

  constructor(private boxes: { lo: Vec3; hi: Vec3 }[], private cell: number) {
    const lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const b of boxes) for (let c = 0; c < 3; c++) {
      lo[c] = Math.min(lo[c], b.lo[c]);
      hi[c] = Math.max(hi[c], b.hi[c]);
    }
    this.lo = lo;
    this.n = [0, 1, 2].map((c) => Math.max(1, Math.ceil((hi[c] - lo[c]) / cell) + 1)) as Vec3;
    boxes.forEach((b, i) => {
      const a = this.cellOf(b.lo), z = this.cellOf(b.hi);
      for (let x = a[0]; x <= z[0]; x++) for (let y = a[1]; y <= z[1]; y++) for (let w = a[2]; w <= z[2]; w++) {
        const k = this.key(x, y, w);
        const list = this.cells.get(k);
        if (list) list.push(i);
        else this.cells.set(k, [i]);
      }
    });
    this.stamp = new Int32Array(boxes.length);
  }

  private cellOf(p: Vec3): Vec3 {
    return [0, 1, 2].map((c) => Math.min(this.n[c] - 1, Math.max(0, Math.floor((p[c] - this.lo[c]) / this.cell)))) as Vec3;
  }

  private key(x: number, y: number, z: number) {
    return (x * this.n[1] + y) * this.n[2] + z;
  }

  /** Calls `visit` once for each item in a cell the box touches. */
  within(box: { lo: Vec3; hi: Vec3 }, visit: (item: number) => void): void {
    this.round++;
    const a = this.cellOf(box.lo), z = this.cellOf(box.hi);
    for (let x = a[0]; x <= z[0]; x++) for (let y = a[1]; y <= z[1]; y++) for (let w = a[2]; w <= z[2]; w++) {
      for (const i of this.cells.get(this.key(x, y, w)) ?? []) {
        if (this.stamp[i] === this.round) continue;
        this.stamp[i] = this.round;
        visit(i);
      }
    }
  }

  /**
   * The item nearest to p by `dist2` (its squared distance, or undefined to skip it), searching outward
   * until no closer item can be left.
   */
  nearest<T>(p: Vec3, dist2: (item: number) => { d2: number; hit: T } | undefined): { item: number; d2: number; hit: T } | undefined {
    this.round++;
    const c = this.cellOf(p);
    // How far p lies outside the grid: rings start counting from its nearest cell.
    const outside = Math.hypot(...[0, 1, 2].map((k) => Math.max(0, this.lo[k] - p[k], p[k] - (this.lo[k] + this.n[k] * this.cell))));
    const maxR = Math.max(...[0, 1, 2].map((k) => Math.max(c[k], this.n[k] - 1 - c[k])));
    let best: { item: number; d2: number; hit: T } | undefined;
    for (let r = 0; r <= maxR; r++) {
      for (let x = c[0] - r; x <= c[0] + r; x++) {
        if (x < 0 || x >= this.n[0]) continue;
        for (let y = c[1] - r; y <= c[1] + r; y++) {
          if (y < 0 || y >= this.n[1]) continue;
          const edgeXY = Math.abs(x - c[0]) === r || Math.abs(y - c[1]) === r;
          for (let z = c[2] - r; z <= c[2] + r; z++) {
            if (z < 0 || z >= this.n[2]) continue;
            if (!edgeXY && Math.abs(z - c[2]) !== r) continue;
            const list = this.cells.get(this.key(x, y, z));
            if (!list) continue;
            for (const i of list) {
              if (this.stamp[i] === this.round) continue;
              this.stamp[i] = this.round;
              const d = dist2(i);
              if (d && (!best || d.d2 < best.d2)) best = { item: i, d2: d.d2, hit: d.hit };
            }
          }
        }
      }
      // Anything in the next ring is at least r cells away (plus the way to the grid).
      if (best && Math.sqrt(best.d2) <= r * this.cell + outside) break;
    }
    return best;
  }
}

function triBoxes(pos: ArrayLike<number>, idx: ArrayLike<number>): { lo: Vec3; hi: Vec3 }[] {
  const out: { lo: Vec3; hi: Vec3 }[] = [];
  for (let t = 0; t < idx.length; t += 3) {
    const lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < 3; k++) for (let c = 0; c < 3; c++) {
      const v = pos[idx[t + k] * 3 + c];
      lo[c] = Math.min(lo[c], v);
      hi[c] = Math.max(hi[c], v);
    }
    out.push({ lo, hi });
  }
  return out;
}

/** A cell size giving a few items a cell: the items' typical size. */
function cellFor(boxes: { lo: Vec3; hi: Vec3 }[]): number {
  const sizes = boxes.map((b) => Math.max(b.hi[0] - b.lo[0], b.hi[1] - b.lo[1], b.hi[2] - b.lo[2])).sort((a, b) => a - b);
  const all = boxes.reduce((m, b) => Math.max(m, ...[0, 1, 2].map((c) => b.hi[c])), -Infinity) - boxes.reduce((m, b) => Math.min(m, ...[0, 1, 2].map((c) => b.lo[c])), Infinity);
  return Math.max(sizes[Math.floor(sizes.length / 2)] * 2 || 0.01, all / 96);
}

function faceNormals(pos: ArrayLike<number>, idx: ArrayLike<number>): Vec3[] {
  const out: Vec3[] = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = at(pos, idx[t]);
    out.push(unit(cross(sub(at(pos, idx[t + 1]), a), sub(at(pos, idx[t + 2]), a))));
  }
  return out;
}

/** Per-vertex normals: the faces around each vertex, weighted by area. */
function vertexNormals(pos: ArrayLike<number>, idx: ArrayLike<number>, n: number): Float64Array {
  const out = new Float64Array(n * 3);
  for (let t = 0; t < idx.length; t += 3) {
    const a = at(pos, idx[t]);
    const f = cross(sub(at(pos, idx[t + 1]), a), sub(at(pos, idx[t + 2]), a));
    for (let k = 0; k < 3; k++) for (let c = 0; c < 3; c++) out[idx[t + k] * 3 + c] += f[c];
  }
  for (let v = 0; v < n; v++) out.set(unit(at(out, v)), v * 3);
  return out;
}

/** Normals facing the same way, or near enough: a brim's top keeps to the top, its underside to the underside. */
const Facing = 0.2;

/** Whether the segment from o along d (length 1) crosses triangle abc within `len` (Moller-Trumbore). */
function rayHits(o: Vec3, d: Vec3, a: Vec3, b: Vec3, c: Vec3, len: number): boolean {
  const e1 = sub(b, a), e2 = sub(c, a);
  const p = cross(d, e2);
  const det = dot(e1, p);
  if (Math.abs(det) < 1e-12) return false;
  const inv = 1 / det;
  const s = sub(o, a);
  const u = dot(s, p) * inv;
  if (u < 0 || u > 1) return false;
  const q = cross(s, e1);
  const v = dot(d, q) * inv;
  if (v < 0 || u + v > 1) return false;
  const t = dot(e2, q) * inv;
  return t > 1e-5 && t < len;
}

/**
 * The game mesh's covered triangles, per part (`hidden`): those with another of its surfaces just in front
 * of them, within `near` along their normal (the crown under a hat's band). They are hidden in the game,
 * so the new shape takes no material from them. Inside surfaces further apart (a hat's inside) are not
 * covered. `over` marks the triangles that cover them (the band).
 */
export function coveredTriangles(parts: Surface[], near: number): { hidden: Uint8Array[]; over: Uint8Array[] } {
  const all: { part: number; tri: number }[] = [];
  const boxes: { lo: Vec3; hi: Vec3 }[] = [];
  parts.forEach((p, k) => {
    const bx = triBoxes(p.pos, p.idx);
    for (let t = 0; t < p.idx.length / 3; t++) {
      all.push({ part: k, tri: t });
      boxes.push(bx[t]);
    }
  });
  const grid = new Grid(boxes, cellFor(boxes));
  const corner = (o: { part: number; tri: number }, k: number) => at(parts[o.part].pos, parts[o.part].idx[o.tri * 3 + k]);
  const over = parts.map((p) => new Uint8Array(p.idx.length / 3));
  const hidden = parts.map((p, k) => {
    const out = new Uint8Array(p.idx.length / 3);
    for (let t = 0; t < out.length; t++) {
      const a = at(p.pos, p.idx[t * 3]), b = at(p.pos, p.idx[t * 3 + 1]), c = at(p.pos, p.idx[t * 3 + 2]);
      const n = unit(cross(sub(b, a), sub(c, a)));
      if (!Number.isFinite(n[0]) || (!n[0] && !n[1] && !n[2])) continue;
      // Checked from the centre and towards each corner, so a triangle half under the band counts once most of it is.
      let hidden = 0;
      const by: number[] = [];
      for (const w of [[1 / 3, 1 / 3, 1 / 3], [0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6]]) {
        const o: Vec3 = [0, 1, 2].map((q) => w[0] * a[q] + w[1] * b[q] + w[2] * c[q]) as Vec3;
        const end: Vec3 = [o[0] + n[0] * near, o[1] + n[1] * near, o[2] + n[2] * near];
        const box = { lo: [0, 1, 2].map((q) => Math.min(o[q], end[q])) as Vec3, hi: [0, 1, 2].map((q) => Math.max(o[q], end[q])) as Vec3 };
        let hit = -1;
        grid.within(box, (i) => {
          const other = all[i];
          if (hit >= 0 || (other.part === k && other.tri === t)) return;
          if (rayHits(o, n, corner(other, 0), corner(other, 1), corner(other, 2), near)) hit = i;
        });
        if (hit >= 0) {
          hidden++;
          by.push(hit);
        }
      }
      out[t] = hidden >= 3 ? 1 : 0;
      if (out[t]) for (const i of by) over[all[i].part][all[i].tri] = 1;
    }
    return out;
  });
  return { hidden, over };
}

/**
 * UV islands per part: triangles joined at corners with the same place and UVs. Each triangle's island,
 * numbered across all parts.
 */
export function uvIslands(parts: SourcePart[]): { island: Int32Array[]; count: number } {
  const island: Int32Array[] = [];
  let islands = 0;
  for (const p of parts) {
    const n = p.pos.length / 3;
    const parent = Int32Array.from({ length: n }, (_, i) => i);
    const find = (i: number) => {
      while (parent[i] !== i) i = parent[i] = parent[parent[i]];
      return i;
    };
    const seen = new Map<string, number>();
    for (let v = 0; v < n; v++) {
      const key = `${Math.round(p.pos[v * 3] * 1e5)},${Math.round(p.pos[v * 3 + 1] * 1e5)},${Math.round(p.pos[v * 3 + 2] * 1e5)},${p.uv ? `${Math.round(p.uv[v * 2] * 1e4)},${Math.round(p.uv[v * 2 + 1] * 1e4)}` : ""}`;
      const s = seen.get(key);
      if (s === undefined) seen.set(key, v);
      else parent[find(v)] = find(s);
    }
    for (let t = 0; t < p.idx.length; t += 3) {
      parent[find(p.idx[t + 1])] = find(p.idx[t]);
      parent[find(p.idx[t + 2])] = find(p.idx[t]);
    }
    const ids = new Map<number, number>();
    const isl = new Int32Array(p.idx.length / 3);
    for (let t = 0; t < isl.length; t++) {
      const r = find(p.idx[t * 3]);
      if (!ids.has(r)) ids.set(r, islands++);
      isl[t] = ids.get(r)!;
    }
    island.push(isl);
  }
  return { island, count: islands };
}

// ---------- 1. bend ----------

/**
 * The game mesh's vertices bent onto the new surface (`to`, in the same place and frame), as new positions
 * in the parts' own vertex order. Vertices at one place are moved together, so UV seams do not open.
 * `hidden` (from `coveredTriangles`): the new surface pulls only on vertices of triangles that show.
 */
export function bendOnto(parts: Surface[], to: Surface & { nrm?: Float64Array | null }, opts: { iterations?: number; hidden?: Uint8Array[] } = {}): Float64Array[] {
  const iterations = opts.iterations ?? 40;
  // Welded: one point for every vertex at the same place, over all parts.
  const weld: Int32Array[] = [];
  const keys = new Map<string, number>();
  const pts: number[] = [];
  for (const p of parts) {
    const w = new Int32Array(p.pos.length / 3);
    for (let v = 0; v < w.length; v++) {
      const key = `${Math.round(p.pos[v * 3] * 1e5)},${Math.round(p.pos[v * 3 + 1] * 1e5)},${Math.round(p.pos[v * 3 + 2] * 1e5)}`;
      let i = keys.get(key);
      if (i === undefined) {
        i = pts.length / 3;
        keys.set(key, i);
        pts.push(p.pos[v * 3], p.pos[v * 3 + 1], p.pos[v * 3 + 2]);
      }
      w[v] = i;
    }
    weld.push(w);
  }
  const m = pts.length / 3;
  const P = Float64Array.from(pts);
  const tris: number[] = [];
  parts.forEach((p, k) => {
    for (let t = 0; t < p.idx.length; t++) tris.push(weld[k][p.idx[t]]);
  });
  const nbr: Set<number>[] = Array.from({ length: m }, () => new Set<number>());
  for (let t = 0; t < tris.length; t += 3) for (let k = 0; k < 3; k++) {
    nbr[tris[t + k]].add(tris[t + ((k + 1) % 3)]);
    nbr[tris[t + k]].add(tris[t + ((k + 2) % 3)]);
  }
  const nbrs = nbr.map((s) => [...s]);
  const shows = new Uint8Array(m);
  parts.forEach((p, k) => {
    for (let t = 0; t < p.idx.length / 3; t++) {
      if (opts.hidden?.[k]?.[t]) continue;
      for (let q = 0; q < 3; q++) shows[weld[k][p.idx[t * 3 + q]]] = 1;
    }
  });

  const dstN = to.pos.length / 3;
  const dstTriN = faceNormals(to.pos, to.idx);
  const dstGrid = new Grid(triBoxes(to.pos, to.idx), cellFor(triBoxes(to.pos, to.idx)));
  const dstVN = to.nrm && to.nrm.length === to.pos.length ? to.nrm : vertexNormals(to.pos, to.idx, dstN);
  const closestOnDst = (p: Vec3, n: Vec3, facing: boolean) =>
    dstGrid.nearest(p, (t) => {
      if (facing && dot(dstTriN[t], n) < Facing) return undefined;
      const a = at(to.pos, to.idx[t * 3]), b = at(to.pos, to.idx[t * 3 + 1]), c = at(to.pos, to.idx[t * 3 + 2]);
      const w = closestBary(p, a, b, c);
      const q: Vec3 = [0, 1, 2].map((k) => w[0] * a[k] + w[1] * b[k] + w[2] * c[k]) as Vec3;
      const d = sub(q, p);
      return { d2: dot(d, d), hit: q };
    });

  const d = new Float64Array(m * 3), acc = new Float64Array(m * 3), cnt = new Float64Array(m), tmp = new Float64Array(m * 3);
  for (let it = 0; it < iterations; it++) {
    const N = vertexNormals(P, tris, m);
    // The new surface's points pulling back on the nearest game vertex facing their way: this is what
    // stretches the game mesh over a part that grew.
    acc.fill(0);
    cnt.fill(0);
    const boxes = Array.from({ length: m }, (_, i) => ({ lo: at(P, i), hi: at(P, i) }));
    const ptGrid = new Grid(boxes, cellFor(triBoxes(P, tris)));
    for (let j = 0; j < dstN; j++) {
      const q = at(to.pos, j), nq = at(dstVN, j);
      const hit = ptGrid.nearest(q, (i) => {
        if (!shows[i] || dot(at(N, i), nq) < Facing) return undefined;
        const e = sub(at(P, i), q);
        return { d2: dot(e, e), hit: i };
      });
      if (!hit) continue;
      for (let c = 0; c < 3; c++) acc[hit.item * 3 + c] += q[c] - P[hit.item * 3 + c];
      cnt[hit.item]++;
    }
    // Each game vertex pulled to the nearest point of the new surface facing its way.
    for (let i = 0; i < m; i++) {
      const p = at(P, i);
      const hit = closestOnDst(p, at(N, i), true) ?? closestOnDst(p, at(N, i), false);
      for (let c = 0; c < 3; c++) {
        const f = hit ? hit.hit[c] - p[c] : 0;
        d[i * 3 + c] = cnt[i] ? (f + acc[i * 3 + c] / cnt[i]) / 2 : f;
      }
    }
    // The pulls smoothed over the mesh: stiff at first, looser as it settles.
    const rounds = Math.round(30 - (27 * it) / Math.max(1, iterations - 1));
    for (let r = 0; r < rounds; r++) {
      for (let i = 0; i < m; i++) {
        const ns = nbrs[i];
        if (!ns.length) {
          for (let c = 0; c < 3; c++) tmp[i * 3 + c] = d[i * 3 + c];
          continue;
        }
        for (let c = 0; c < 3; c++) {
          let s = 0;
          for (const j of ns) s += d[j * 3 + c];
          tmp[i * 3 + c] = 0.5 * d[i * 3 + c] + (0.5 * s) / ns.length;
        }
      }
      d.set(tmp);
    }
    for (let k = 0; k < P.length; k++) P[k] += 0.5 * d[k];
  }
  return parts.map((p, k) => {
    const out = new Float64Array(p.pos.length);
    for (let v = 0; v < p.pos.length / 3; v++) out.set(at(P, weld[k][v]), v * 3);
    return out;
  });
}

// ---------- 2. carry ----------

/**
 * The new shape split into the game mesh's parts, with the game's UVs and vertex colors on it. `bent` is
 * each part's positions after `bendOnto`. `skip` marks the game triangles the new shape's triangles may
 * not go to (the covered ones, from `coveredTriangles`, and the ones kept as the game's own). A part no new
 * triangle took comes back empty.
 */
export function carryOnto(parts: SourcePart[], bent: Float64Array[], to: Surface & { nrm?: Float64Array | null }, skip?: Uint8Array[]): TransferredPart[] {
  const { island } = uvIslands(parts);

  // Every game triangle, bent, in one grid.
  const owner: { part: number; tri: number; island: number; n: Vec3 }[] = [];
  const boxes: { lo: Vec3; hi: Vec3 }[] = [];
  parts.forEach((p, k) => {
    const fn = faceNormals(bent[k], p.idx);
    const bx = triBoxes(bent[k], p.idx);
    for (let t = 0; t < p.idx.length / 3; t++) {
      if (skip?.[k]?.[t]) continue;
      owner.push({ part: k, tri: t, island: island[k][t], n: fn[t] });
      boxes.push(bx[t]);
    }
  });
  const grid = new Grid(boxes, cellFor(boxes));
  const corners = (o: { part: number; tri: number }) => {
    const p = parts[o.part];
    return [p.idx[o.tri * 3], p.idx[o.tri * 3 + 1], p.idx[o.tri * 3 + 2]];
  };
  const nearest = (q: Vec3, accept: (o: (typeof owner)[number]) => boolean) =>
    grid.nearest(q, (i) => {
      const o = owner[i];
      if (!accept(o)) return undefined;
      const [a, b, c] = corners(o).map((v) => at(bent[o.part], v));
      const w = closestBary(q, a, b, c);
      const e = sub([0, 1, 2].map((k) => w[0] * a[k] + w[1] * b[k] + w[2] * c[k]) as Vec3, q);
      return { d2: dot(e, e), hit: w };
    });

  const nNew = to.pos.length / 3;
  const vn = to.nrm && to.nrm.length === to.pos.length ? to.nrm : vertexNormals(to.pos, to.idx, nNew);
  const out: TransferredPart[] = parts.map(() => ({ pos: new Float64Array(0), nrm: new Float64Array(0), uv: new Float64Array(0), uv1: new Float64Array(0), color: new Float64Array(0), idx: [] }));
  const build = parts.map(() => ({ pos: [] as number[], nrm: [] as number[], uv: [] as number[], uv1: [] as number[], color: [] as number[], idx: [] as number[] }));
  const made = new Map<string, number>();
  for (let t = 0; t < to.idx.length; t += 3) {
    const vs = [to.idx[t], to.idx[t + 1], to.idx[t + 2]];
    const centre = [0, 1, 2].map((c) => (to.pos[vs[0] * 3 + c] + to.pos[vs[1] * 3 + c] + to.pos[vs[2] * 3 + c]) / 3) as Vec3;
    // Facing: the corners' normals, so a triangle's winding does not matter.
    const n = unit([0, 1, 2].map((c) => vn[vs[0] * 3 + c] + vn[vs[1] * 3 + c] + vn[vs[2] * 3 + c]) as Vec3);
    const home = nearest(centre, (o) => dot(o.n, n) >= Facing) ?? nearest(centre, () => true);
    if (!home) continue;
    const { part, island: isl } = owner[home.item];
    const b = build[part];
    const src = parts[part];
    for (const v of vs) {
      const key = `${v}|${isl}`;
      let i = made.get(key);
      if (i === undefined) {
        const hit = nearest(at(to.pos, v), (o) => o.island === isl)!;
        const cs = corners(owner[hit.item]);
        const w = hit.hit;
        const mix = (a: ArrayLike<number> | null | undefined, k: number, fill: number) => {
          const r: number[] = [];
          for (let q = 0; q < k; q++) r.push(a ? w[0] * a[cs[0] * k + q] + w[1] * a[cs[1] * k + q] + w[2] * a[cs[2] * k + q] : fill);
          return r;
        };
        i = b.pos.length / 3;
        made.set(key, i);
        b.pos.push(...at(to.pos, v));
        b.nrm.push(...at(vn, v));
        b.uv.push(...mix(src.uv, 2, 0));
        b.uv1.push(...mix(src.uv1 ?? src.uv, 2, 0));
        b.color.push(...mix(src.color, 4, 0));
      }
      b.idx.push(i);
    }
  }
  build.forEach((b, k) => {
    out[k] = { pos: Float64Array.from(b.pos), nrm: Float64Array.from(b.nrm), uv: Float64Array.from(b.uv), uv1: Float64Array.from(b.uv1), color: Float64Array.from(b.color), idx: b.idx };
  });
  return out;
}

// ---------- 3. tuck ----------

/**
 * The new surface's points that lie under a kept part of the game mesh (its band, its buckle) moved to
 * `depth` beneath it, so the kept part shows on top instead of the new shape's own version of it. A point
 * is under a kept triangle when it lies within `reach` of it and straight below or above its inside, not
 * past its edge. Returns how many points moved.
 */
export function tuckUnder(to: { pos: Float64Array }, kept: { pos: Float64Array; nrm: Float64Array | null; idx: ArrayLike<number> }[], depth: number, reach: number): number {
  const tris: { part: number; tri: number }[] = [];
  const boxes: { lo: Vec3; hi: Vec3 }[] = [];
  kept.forEach((p, k) => {
    const bx = triBoxes(p.pos, p.idx);
    for (let t = 0; t < p.idx.length / 3; t++) {
      tris.push({ part: k, tri: t });
      boxes.push(bx[t]);
    }
  });
  if (!tris.length) return 0;
  const grid = new Grid(boxes, cellFor(boxes));
  let moved = 0;
  for (let v = 0; v < to.pos.length / 3; v++) {
    const q = at(to.pos, v);
    const hit = grid.nearest(q, (i) => {
      const { part, tri } = tris[i];
      const p = kept[part];
      const cs = [p.idx[tri * 3], p.idx[tri * 3 + 1], p.idx[tri * 3 + 2]];
      const [a, b, c] = cs.map((x) => at(p.pos, x));
      const w = closestBary(q, a, b, c);
      const point = [0, 1, 2].map((k) => w[0] * a[k] + w[1] * b[k] + w[2] * c[k]) as Vec3;
      const e = sub(point, q);
      return { d2: dot(e, e), hit: { w, point, cs, part } };
    });
    if (!hit || hit.d2 > reach * reach) continue;
    const { w, point, cs, part } = hit.hit;
    // Past the triangle's edge: the closest point is on its rim, not above or below the point.
    if (w.some((x) => x < 1e-4)) continue;
    const p = kept[part];
    let n: Vec3;
    if (p.nrm) n = unit([0, 1, 2].map((k) => w[0] * p.nrm![cs[0] * 3 + k] + w[1] * p.nrm![cs[1] * 3 + k] + w[2] * p.nrm![cs[2] * 3 + k]) as Vec3);
    else n = unit(cross(sub(at(p.pos, cs[1]), at(p.pos, cs[0])), sub(at(p.pos, cs[2]), at(p.pos, cs[0]))));
    for (let k = 0; k < 3; k++) to.pos[v * 3 + k] = point[k] - n[k] * depth;
    moved++;
  }
  return moved;
}
