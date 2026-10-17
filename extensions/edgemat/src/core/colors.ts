// Colors for people: a plain name for any preset ("dark muted blue"), a swatch color, the distance
// between two colors, and reading a color someone typed ("dark red", "#a03030"). Pure functions with no
// Node or VS Code imports, so the surface page's script bundles this file too.
//
// Preset values run from 0 to 2 (behavior spec, section 3). They are treated here as display (sRGB)
// values, with anything above 1 shown clipped and marked "bright". **Unverified:** whether the game
// reads them as sRGB or linear; M4 checks this against in-game screenshots.

export type Rgb = [number, number, number];
/** OKLab: L lightness (0 black, 1 white), a green to red, b blue to yellow. */
export type Lab = [number, number, number];

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.sign(v) * Math.pow((Math.abs(v) + 0.055) / 1.055, 2.4));
const fromLinear = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

/** OKLab from a display color. Values above 1 give a lightness above 1. */
export function toLab([r0, g0, b0]: Rgb): Lab {
  const r = toLinear(r0), g = toLinear(g0), b = toLinear(b0);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720426 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** A display color from OKLab, clipped to 0..1. */
export function fromLab([L, A, B]: Lab): Rgb {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const c = (v: number) => Math.max(0, Math.min(1, fromLinear(v)));
  return [
    c(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    c(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    c(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** Lightness, chroma (colorfulness) and hue in degrees. */
export function toLch(rgb: Rgb): { L: number; C: number; h: number } {
  const [L, a, b] = toLab(rgb);
  const h = (Math.atan2(b, a) * 180) / Math.PI;
  return { L, C: Math.hypot(a, b), h: h < 0 ? h + 360 : h };
}

/** How different two colors look: distance in OKLab. Under about 0.02 most people see no difference. */
export function colorDistance(a: Rgb, b: Rgb): number {
  const p = toLab(a), q = toLab(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/** True when a preset goes above 1: brighter than any screen color. */
export const isBright = (rgb: Rgb) => Math.max(...rgb) > 1.02;

/** The swatch color as #rrggbb, clipped to what a screen shows. */
export function swatchHex(rgb: Rgb): string {
  return "#" + rgb.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("");
}

function hueName(h: number, L: number, C: number): string {
  if (h >= 350 || h < 40) return L > 0.75 ? "pink" : L < 0.55 && C < 0.13 && h >= 15 ? "brown" : "red";
  if (h < 80) return L < 0.6 ? "brown" : "orange";
  if (h < 120) return L < 0.6 ? "olive" : "yellow";
  if (h < 165) return "green";
  if (h < 215) return L < 0.7 ? "teal" : "cyan";
  if (h < 275) return "blue";
  if (h < 310) return "purple";
  return L > 0.72 ? "pink" : "magenta";
}

/** A plain name for a color, such as "dark muted blue", "warm light grey" or "bright red". */
export function plainColorName(rgb: Rgb): string {
  const top = Math.max(...rgb);
  const bright = top > 1.02;
  const { L, C, h } = toLch(bright ? (rgb.map((v) => v / top) as Rgb) : rgb);
  const words: string[] = bright ? ["bright"] : [];
  if (C < 0.03) {
    if (C > 0.012) words.push(h >= 30 && h < 120 ? "warm" : h >= 180 && h < 290 ? "cool" : "");
    words.push(L < 0.25 ? "black" : L < 0.5 ? "dark grey" : L < 0.7 ? "grey" : L < 0.88 ? "light grey" : "white");
    return words.filter(Boolean).join(" ");
  }
  const hue = hueName(h, L, C);
  const impliesLight = hue === "pink";
  const impliesDark = hue === "brown" || hue === "olive";
  if (L < 0.3) words.push("very dark");
  else if (L < 0.45 && !impliesDark) words.push("dark");
  else if (L > 0.85) words.push("pale");
  else if (L > 0.72 && !impliesLight) words.push("light");
  if (C < 0.05) words.push("greyish");
  else if (C < 0.09) words.push("muted");
  else if (C > 0.22) words.push("vivid");
  words.push(hue);
  return words.join(" ");
}

const named: Record<string, string> = {
  red: "#d42020", crimson: "#b81830", maroon: "#6a1a20", burgundy: "#6a1830", orange: "#e8801a", coral: "#f07858", salmon: "#f09080",
  yellow: "#e8d020", gold: "#d4a830", olive: "#6a6a20", khaki: "#b8b070", lime: "#8cd23a", green: "#2a9a3a", teal: "#1a8a8a",
  turquoise: "#30c0b0", cyan: "#20c8d8", blue: "#2050c8", navy: "#1a2a6a", purple: "#7a3ab0", violet: "#8a4ad8", magenta: "#c830a8",
  pink: "#f08cb4", brown: "#7a4a28", tan: "#c8a070", beige: "#d8c8a0", cream: "#f0e8d0", black: "#101010", white: "#f0f0f0",
  grey: "#808080", gray: "#808080", silver: "#c0c0c8", charcoal: "#36383a",
};

const hexRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as Rgb;

/**
 * Reads a color someone typed: "#a03030", "#a33", "0.6 0.1 0.1" (0 to 2, as presets are), "160 40 40"
 * (0 to 255), or plain words such as "red", "dark red", "pale muted blue". Undefined when it is none of these.
 */
export function parseColor(text: string): Rgb | undefined {
  const t = text.trim().toLowerCase();
  if (/^#?[0-9a-f]{6}$/.test(t)) return hexRgb(t.startsWith("#") ? t : "#" + t);
  if (/^#?[0-9a-f]{3}$/.test(t)) return hexRgb("#" + [...t.replace("#", "")].map((c) => c + c).join(""));
  const nums = t.split(/[\s,;]+/).map(Number);
  if (nums.length === 3 && nums.every((n) => Number.isFinite(n) && n >= 0)) return (nums.some((n) => n > 2) ? nums.map((n) => n / 255) : nums) as Rgb;

  const words = t.replace(/-/g, " ").split(/\s+/).filter(Boolean);
  const base = [...words].reverse().find((w) => named[w]);
  if (!base) return undefined;
  let [L, a, b] = toLab(hexRgb(named[base]));
  let chroma = 1;
  let bright = false;
  for (const w of words.filter((x) => x !== base)) {
    if (w === "very") continue;
    else if (w === "dark") L *= words.includes("very") ? 0.55 : 0.75;
    else if (w === "light") L += (1 - L) * 0.4;
    else if (w === "pale") { L += (1 - L) * 0.6; chroma *= 0.6; }
    else if (w === "vivid") chroma *= 1.3;
    else if (w === "muted") chroma *= 0.6;
    else if (w === "greyish" || w === "grayish") chroma *= 0.35;
    else if (w === "warm") { a += 0.01; b += 0.03; }
    else if (w === "cool") b -= 0.03;
    else if (w === "bright") bright = true;
    else if (!named[w]) return undefined;
  }
  const rgb = fromLab([L, a * chroma, b * chroma]);
  return bright ? (rgb.map((v) => Math.min(2, v * 1.4)) as Rgb) : rgb;
}
