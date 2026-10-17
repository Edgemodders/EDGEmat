// A surface (template) in plain words, as the surface page and the MCP tool mat_colors show it: every
// color with a plain name and a swatch, the roughness, metal and bump presets in words, raw values
// beside them. Level pairs are scale and bias, out = scale × in + bias (behavior spec, section 3).

import { colorDistance, isBright, plainColorName, swatchHex, toLch, type Rgb } from "./colors";
import { searchTemplates, type Library, type LevelPreset, type PresetKind, type ScalarPreset, type Template } from "./library";

export interface ColorInfo {
  /** The game's preset name, such as 3a2b1c_null. */
  name: string;
  plain: string;
  rgb: Rgb;
  /** The swatch, clipped to what a screen shows. */
  hex: string;
  /** Above 1 in a channel: brighter than the swatch can show. */
  bright: boolean;
  isDefault: boolean;
}

export interface PresetInfo {
  name: string;
  plain: string;
  /** The raw values, such as "scale 1.821, bias -0.429". */
  raw: string;
  isDefault: boolean;
}

export interface TextureInfo {
  kind: "color" | "normal" | "roughness" | "metalness";
  path?: string;
  /** One of the game's shared default textures: the surface has no map of its own. */
  isDefault: boolean;
}

export interface SurfaceInfo {
  title: string;
  name: string;
  path: string;
  category: string;
  group: string;
  tiling: number;
  /** Colors in swatch order: greys from dark to light, then by hue, each from dark to light. */
  colors: ColorInfo[];
  defaultColor?: ColorInfo;
  roughness: PresetInfo[];
  roughnessContrast: PresetInfo[];
  metal: PresetInfo[];
  metalContrast: PresetInfo[];
  bumps: PresetInfo[];
  textures: TextureInfo[];
  colorMaskLevels?: { in: number[]; out: number[] };
}

const n3 = (v: number) => String(Math.round(v * 1000) / 1000);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const near = (v: number, to: number) => Math.abs(v - to) < 0.005;
const identity = (p: LevelPreset) => near(p.scale, 1) && near(p.bias, 0);

function roughWord(v: number): string {
  return v < 0.15 ? "glossy" : v < 0.35 ? "shiny" : v < 0.55 ? "satin" : v < 0.75 ? "matte" : "rough";
}

/**
 * The value of a shared default texture that is one flat tone: black 0, white 1, gray about 0.5
 * (**unverified**: gray.xbm's exact value). Undefined for a texture with detail.
 */
export function flatTextureValue(texture?: string): number | undefined {
  const m = texture?.toLowerCase().match(/\\surfaces\\materials\\default\\(black|white|gray|grey)\.xbm$/);
  return m ? { black: 0, white: 1, gray: 0.5, grey: 0.5 }[m[1] as "black"] : undefined;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** An Out preset for roughness: a fixed finish, or the range the texture is mapped into. `flat`: the map's value when it is one tone. */
export function plainRoughness(p: LevelPreset, flat?: number): string {
  if (flat !== undefined) return `always ${roughWord(clamp01(p.scale * flat + p.bias))}`;
  if (identity(p)) return "as the texture";
  if (near(p.scale, 0)) return `always ${roughWord(p.bias)}`;
  const lo = Math.min(p.bias, p.scale + p.bias), hi = Math.max(p.bias, p.scale + p.bias);
  const range = roughWord(lo) === roughWord(hi) ? `mostly ${roughWord((lo + hi) / 2)}` : `${roughWord(lo)} to ${roughWord(hi)}`;
  return p.scale < 0 ? `${range}, inverted` : range;
}

/** An Out preset for metal: a fixed amount, or a range. `flat`: the map's value when it is one tone. */
export function plainMetal(p: LevelPreset, flat?: number): string {
  const fixed = flat !== undefined ? clamp01(p.scale * flat + p.bias) : near(p.scale, 0) ? p.bias : undefined;
  if (fixed !== undefined) return fixed < 0.01 ? "not metal" : fixed > 0.99 ? "fully metal" : `${pct(fixed)} metal`;
  if (identity(p)) return "as the texture";
  const lo = Math.min(p.bias, p.scale + p.bias), hi = Math.max(p.bias, p.scale + p.bias);
  return `metal ${pct(lo)} to ${pct(hi)}`;
}

/** An In preset: how much of the texture's contrast is used before the Out preset applies. `flat`: the map is one tone. */
export function plainContrast(p: LevelPreset, flat?: number): string {
  if (flat !== undefined) return "no effect: the map is one flat tone";
  if (identity(p)) return "as the texture";
  if (near(p.scale, 0)) return `flat, at ${n3(p.bias)}`;
  if (p.scale < 0) return "inverted";
  const lo = Math.max(0, -p.bias / p.scale), hi = Math.min(1, (1 - p.bias) / p.scale);
  return p.scale > 1 ? `more contrast (uses ${pct(lo)} to ${pct(hi)} of the texture)` : "less contrast";
}

/** A normal strength: how strong the surface's bumps are. */
export function plainBumps(p: ScalarPreset): string {
  const v = p.value;
  return v <= 0.01 ? "flat, no bumps" : v < 0.4 ? "faint bumps" : v < 0.8 ? "soft bumps" : v < 1.2 ? "normal bumps" : v < 1.5 ? "strong bumps" : "very strong bumps";
}

/** Swatch order: greys from dark to light first, then hues in 30° bands from red round to pink, dark to light in each. */
function swatchOrder(a: ColorInfo, b: ColorInfo): number {
  const p = toLch(a.rgb), q = toLch(b.rgb);
  const greyA = p.C < 0.03, greyB = q.C < 0.03;
  if (greyA !== greyB) return greyA ? -1 : 1;
  if (!greyA) {
    const band = (h: number) => Math.floor(((h + 345) % 360) / 30);
    const d = band(p.h) - band(q.h);
    if (d) return d;
  }
  return p.L - q.L;
}

function levelInfo(t: Template, kind: PresetKind, list: LevelPreset[], plain: (p: LevelPreset, flat?: number) => string, flat?: number): PresetInfo[] {
  return list.map((p) => ({ name: p.name, plain: plain(p, flat), raw: `scale ${n3(p.scale)}, bias ${n3(p.bias)}`, isDefault: t.defaults[kind] === p.name }));
}

const isDefaultTexture = (p?: string) => !p || /\\surfaces\\materials\\default\\/i.test(p);

export function describeSurface(t: Template): SurfaceInfo {
  const colors = t.colors
    .map((c): ColorInfo => ({ name: c.name, plain: plainColorName(c.rgb), rgb: c.rgb, hex: swatchHex(c.rgb), bright: isBright(c.rgb), isDefault: c.name === t.defaults.colorScale }))
    .sort(swatchOrder);
  return {
    title: t.title,
    name: t.name,
    path: t.path,
    category: t.category,
    group: t.group,
    tiling: t.tiling,
    colors,
    defaultColor: colors.find((c) => c.isDefault),
    roughness: levelInfo(t, "roughLevelsOut", t.roughLevelsOut, plainRoughness, flatTextureValue(t.textures.roughness)),
    roughnessContrast: levelInfo(t, "roughLevelsIn", t.roughLevelsIn, plainContrast, flatTextureValue(t.textures.roughness)),
    metal: levelInfo(t, "metalLevelsOut", t.metalLevelsOut, plainMetal, flatTextureValue(t.textures.metalness)),
    metalContrast: levelInfo(t, "metalLevelsIn", t.metalLevelsIn, plainContrast, flatTextureValue(t.textures.metalness)),
    bumps: t.normalStrength.map((p) => ({ name: p.name, plain: plainBumps(p), raw: n3(p.value), isDefault: t.defaults.normalStrength === p.name })),
    textures: (["color", "normal", "roughness", "metalness"] as const).map((kind) => ({ kind, path: t.textures[kind], isDefault: isDefaultTexture(t.textures[kind]) })),
    colorMaskLevels: t.colorMaskLevels,
  };
}

/** The surface's colors nearest to `target`, closest first, with their distance. */
export function nearestColors(info: SurfaceInfo, target: Rgb, limit = 10): (ColorInfo & { distance: number })[] {
  return info.colors
    .map((c) => ({ ...c, distance: Math.round(colorDistance(c.rgb, target) * 1000) / 1000 }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}

/** One surface from a game path, a file name, or plain words; the candidates when the words fit several. */
export function findSurface(lib: Library, query: string): { template?: Template; candidates: Template[] } {
  const q = query.trim().toLowerCase().replace(/\//g, "\\");
  const exact = lib.templates.find((t) => t.path.toLowerCase() === q || t.name.toLowerCase() === q || t.title.toLowerCase() === q);
  if (exact) return { template: exact, candidates: [exact] };
  const found = searchTemplates(lib, query);
  return { template: found.length === 1 ? found[0] : undefined, candidates: found };
}
