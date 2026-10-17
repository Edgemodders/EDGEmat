// EDGEmat as an MCP server over stdio (M1 skeleton): the material library, built from the user's game,
// for AI assistants such as Claude Code and REDagent. It shares the library cache with the extension.
//
//   edgemat-mcp [--bridge <REDbridge.exe or its folder>] [--game <Cyberpunk 2077 folder>] [--cache <dir>]
//
// Without options it finds the game and REDbridge as the extension does, from the VS Code settings
// (edgemat.*, then redcode.*). The bridge starts only when the library has to be built.
// stdout is the MCP channel; logs go to stderr.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  BridgeClient, buildLibrary, defaultCacheDir, describeSurface, findSurface, openSetup, isCurrent, isGameFolder, loadLibrary, nearestColors, parseColor, plainColorName, resolveBridge, resolveGame,
  searchMicroblends, searchTemplates, vscodeUserSettings, type ColorInfo, type Library, type SettingsReader, type Template,
} from "../../../extensions/edgemat/src/core";

declare const __VERSION__: string;

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const log = (line: string) => process.stderr.write(`[edgemat-mcp] ${line}\n`);

const fromVsCode = vscodeUserSettings();
const settings: SettingsReader = (key) =>
  key === "edgemat.gamePath" ? arg("--game") ?? process.env.EDGEMAT_GAME_PATH ?? fromVsCode(key)
  : key === "edgemat.bridgePath" ? arg("--bridge") ?? process.env.REDBRIDGE_EXE ?? fromVsCode(key)
  : fromVsCode(key);
const cacheDir = arg("--cache") ?? process.env.EDGEMAT_CACHE ?? defaultCacheDir();

let bridge: BridgeClient | undefined;

async function getBridge(): Promise<BridgeClient> {
  if (bridge?.running) return bridge;
  const game = await resolveGame(settings, {}, true);
  if (!game || !isGameFolder(game.path)) throw new Error("No Cyberpunk 2077 folder found. Pass --game, or set edgemat.gamePath or redcode.gamePath in VS Code.");
  const choice = resolveBridge(settings);
  if (!choice) throw new Error("REDbridge.exe not found. Pass --bridge, or set edgemat.bridgePath or redcode.bridgePath in VS Code.");
  log(`starting ${choice.exe} for ${game.path}`);
  const b = new BridgeClient({ exe: choice.exe, gamePath: game.path, dotnetRoot: choice.dotnetRoot });
  b.on("log", (line) => log(`bridge | ${line}`));
  b.on("exit", () => (bridge = undefined));
  b.start();
  const info = await b.info();
  if (!info.gameLoaded) await b.load(game.path);
  bridge = b;
  return b;
}

/** The cached library; built first when there is none. */
async function library(): Promise<Library> {
  const cached = loadLibrary(cacheDir);
  if (cached) return cached;
  log("no library yet: building it from the game");
  return buildLibrary(await getBridge(), cacheDir, (m, d, t) => t && d && d % 100 === 0 && log(`${m} ${d}/${t}`));
}

const text = (value: unknown): CallToolResult => ({ content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] });
const failure = (e: unknown): CallToolResult => ({ isError: true, content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }] });

/** A surface in plain words with its key numbers; the raw presets stay out unless asked for. */
function describe(t: Template) {
  const def = t.colors.find((c) => c.name === t.defaults.colorScale);
  return {
    title: t.title,
    category: t.category,
    group: t.group || undefined,
    path: t.path,
    colors: t.colors.length,
    defaultColor: def ? { name: def.name, plain: plainColorName(def.rgb), rgb: def.rgb.map((v) => Math.round(v * 1000) / 1000) } : t.defaults.colorScale,
    tiling: t.tiling,
    ownMetalMap: !!t.textures.metalness && !t.textures.metalness.includes("\\default\\"),
  };
}

const server = new McpServer({ name: "edgemat", version: __VERSION__ });

server.registerTool(
  "mat_library",
  {
    description:
      "EDGEmat's material library, built from the user's own Cyberpunk 2077 install: every surface template (.mltemplate) with its color, normal, roughness and metal presets, and every microblend. " +
      "action 'status' says whether it exists, when it was built and whether it still matches the game; 'build' builds or rebuilds it (about a minute or two, once per game version).",
    inputSchema: { action: z.enum(["status", "build"]).default("status") },
  },
  async ({ action }) => {
    try {
      if (action === "build") {
        const lib = await buildLibrary(await getBridge(), cacheDir, (m, d, t) => t && d && d % 100 === 0 && log(`${m} ${d}/${t}`));
        return text({ built: true, seconds: lib.seconds, counts: lib.counts, failed: lib.failed });
      }
      const lib = loadLibrary(cacheDir);
      if (!lib) return text({ exists: false, cache: cacheDir, hint: "Call mat_library with action 'build'." });
      const current = bridge?.running ? await isCurrent(lib, bridge) : undefined;
      return text({ exists: true, builtAt: lib.builtAt, counts: lib.counts, matchesGame: current ?? "not checked (the bridge is not running)", cache: cacheDir });
    } catch (e) {
      return failure(e);
    }
  },
);

server.registerTool(
  "mat_templates",
  {
    description:
      "Searches the surfaces (multilayered material templates) by plain words, such as 'leather', 'denim' or 'metal painted'. Every word must match the template's path or name. " +
      "Returns each surface's category, path, number of color presets, default color (RGB, values can go up to 2) and tiling. A layer's color must be one of its template's presets.",
    inputSchema: { query: z.string().default(""), limit: z.number().int().min(1).max(500).default(50) },
  },
  async ({ query, limit }) => {
    try {
      const found = searchTemplates(await library(), query);
      return text({ total: found.length, surfaces: found.slice(0, limit).map(describe) });
    } catch (e) {
      return failure(e);
    }
  },
);

server.registerTool(
  "mat_microblends",
  {
    description: "Searches the microblends (small detail textures that break up a layer's edges, or prints when tiled large) by plain words, such as 'dirt', 'scratches' or 'logos'.",
    inputSchema: { query: z.string().default(""), limit: z.number().int().min(1).max(500).default(50) },
  },
  async ({ query, limit }) => {
    try {
      const found = searchMicroblends(await library(), query);
      return text({ total: found.length, microblends: found.slice(0, limit).map((m) => ({ name: m.name, path: m.path })) });
    } catch (e) {
      return failure(e);
    }
  },
);

const color = (c: ColorInfo & { distance?: number }) => ({
  name: c.name, plain: c.plain, rgb: c.rgb.map((v) => Math.round(v * 1000) / 1000), swatch: c.hex,
  ...(c.bright ? { bright: true } : {}), ...(c.isDefault ? { default: true } : {}), ...(c.distance !== undefined ? { distance: c.distance } : {}),
});

server.registerTool(
  "mat_colors",
  {
    description:
      "One surface (template) in plain words, as EDGEmat's surface page shows it: its color presets with plain names ('dark muted blue'), and its roughness, metal and bump presets in words. " +
      "surface: a game path, a template name, or plain words that fit one surface (else the candidates are returned). " +
      "near: a color to find the closest presets to, as words ('dark red', 'pale muted blue'), #rrggbb, or 'r g b'; the closest come first with their distance (OKLab; under 0.02 looks the same, over 0.1 clearly differs). " +
      "Without near, colors come in swatch order (greys, then by hue). A layer can only use its surface's presets; preset names are what a .mlsetup stores. " +
      "Preset RGB runs 0 to 2; whether the game reads it as sRGB or linear is unverified.",
    inputSchema: { surface: z.string(), near: z.string().optional(), limit: z.number().int().min(1).max(1100).default(40) },
  },
  async ({ surface, near, limit }) => {
    try {
      const found = findSurface(await library(), surface);
      if (!found.template) {
        return text({ found: false, matches: found.candidates.length, candidates: found.candidates.slice(0, 20).map(describe), hint: found.candidates.length ? "Several surfaces fit: pass one path." : "No surface fits: try mat_templates." });
      }
      const info = describeSurface(found.template);
      const target = near ? parseColor(near) : undefined;
      if (near && !target) return failure(new Error(`"${near}" is not a color EDGEmat reads. Use words such as 'dark red', #rrggbb, or 'r g b'.`));
      const presets = (list: typeof info.roughness) => list.map((p) => ({ name: p.name, plain: p.plain, raw: p.raw, ...(p.isDefault ? { default: true } : {}) }));
      return text({
        title: info.title, path: info.path, category: info.category, group: info.group || undefined, tiling: info.tiling,
        defaultColor: info.defaultColor ? color(info.defaultColor) : undefined,
        totalColors: info.colors.length,
        colors: (target ? nearestColors(info, target, limit) : info.colors.slice(0, limit)).map(color),
        roughness: presets(info.roughness), roughnessContrast: presets(info.roughnessContrast), metal: presets(info.metal), bumps: presets(info.bumps),
        textures: info.textures.map((t) => ({ kind: t.kind, path: t.path, ownMap: !t.isDefault })),
      });
    } catch (e) {
      return failure(e);
    }
  },
);

const isFilePath = (p: string) => /^[a-z]:[\\/]|^\\\\|^\//i.test(p);

server.registerTool(
  "mat_describe",
  {
    description:
      "Describes a multilayered setup (.mlsetup) in plain words, layer by layer, as EDGEmat's setup editor shows it: each layer's surface, color (preset name and a plain name), " +
      "roughness, metal and bumps, tiling, opacity and microblend; whether it shows, and why not; its share of the texture (from the mask set); and anything that looks wrong, " +
      "such as a color name the surface lacks (the game draws that white). Layer 0 is the base; mask i belongs to layer i. " +
      "setup: a game path (base\\...\\x.mlsetup) or a file on disk (.mlsetup or WolvenKit .mlsetup.json). " +
      "mask: the .mlmask to use, a game path or a file; without it the best match beside the setup is used, and the others are listed. " +
      "colorMap is a PNG of the setup's flat colors in texture space (where each layer goes, not the in-game look).",
    inputSchema: { setup: z.string(), mask: z.string().optional(), hideUnused: z.boolean().default(true) },
  },
  async ({ setup, mask, hideUnused }) => {
    try {
      const b = await getBridge();
      const o = await openSetup(b, await library(), cacheDir, isFilePath(setup) ? { file: setup } : { gamePath: setup }, mask);
      const r3 = (v: number) => Math.round(v * 1000) / 1000;
      const preset = (p?: { plain: string; name: string }) => (p ? `${p.plain} (${p.name})` : undefined);
      return text({
        setup,
        layers: o.info.layers.length,
        shown: o.info.shownCount,
        ratio: o.info.ratio,
        warnings: o.info.warnings.length ? o.info.warnings : undefined,
        mask: o.masks ? { name: o.masks.name, from: o.maskFrom, count: o.masks.count } : { error: o.maskError },
        otherMasks: o.maskChoices.length > 1 ? o.maskChoices.slice(1) : undefined,
        colorMap: o.composite?.file,
        layerList: o.info.layers
          .filter((l) => !(hideUnused && (l.surface.unused || !l.surface.path)))
          .map((l) => ({
            index: l.index,
            ...(l.shown ? {} : { hidden: l.hidden }),
            surface: l.surface.title,
            surfacePath: l.surface.path,
            color: l.color ? { name: l.color.name, plain: l.color.plain, rgb: l.color.rgb.map(r3) } : undefined,
            roughness: preset(l.roughness),
            metal: preset(l.metal),
            bumps: preset(l.bumps),
            tiling: l.tiling,
            opacity: l.opacity,
            microblend: l.microblend.plain ? "plain (default)" : { name: l.microblend.name, path: l.microblend.path, tile: r3(l.microblend.tile), contrast: r3(l.microblend.contrast) },
            share: l.share !== undefined ? `${(l.share * 100).toFixed(1)}%` : undefined,
            warnings: l.warnings.length ? l.warnings : undefined,
          })),
      });
    } catch (e) {
      return failure(e);
    }
  },
);

process.on("exit", () => bridge?.stop());
server.connect(new StdioServerTransport()).then(
  () => log(`ready; library cache ${cacheDir}`),
  (e) => {
    log(`could not start: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  },
);
