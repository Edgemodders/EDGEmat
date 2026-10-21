// EDGEmat as an MCP server over stdio: the material library built from the user's game, surfaces, setups
// and finding an item's materials, for AI assistants such as Claude Code and REDagent. It shares the
// library cache with the extension; every tool is the twin of a part of the extension's UI.
//
//   edgemat-mcp [--bridge <REDbridge.exe or its folder>] [--game <Cyberpunk 2077 folder>] [--cache <dir>]
//
// Without options (or with empty ones) it finds the game and REDbridge as the extension does, from the VS Code settings
// (edgemat.*, then redcode.*). Variables: EDGEMAT_GAME_PATH, REDBRIDGE_EXE, EDGEMAT_CACHE. The bridge starts only when a tool needs it.
// stdout is the MCP channel; logs go to stderr.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import {
  applyLayerEdit, BridgeClient, buildLibrary, defaultCacheDir, describeSurface, findSurface, gamePathInProject, isGameFile, itemMaterials, loadItems, meshesUsing, meshMaterials, newPathFor, openSetup, patchFromWords, projectAt,
  saveToProject, searchItems, isCurrent, isGameFolder, loadLibrary, nearestColors, parseColor, plainColorName, resolveBridge, resolveGame, searchMicroblends, searchTemplates, suffixFor, vscodeUserSettings, withSetup,
  applyMaterial, generateImage, imageAsPng, listModels, makeMaterial, materialSlug, texturePrompt, Services,
  type ColorInfo, type LayerInfo, type Library, type MaterialResult, type MaterialUse, type MeshLook, type MeshSearch, type ServiceId, type SettingsReader, type Template,
} from "../../../extensions/edgemat/src/core";

declare const __VERSION__: string;

// An empty option or variable counts as unset: a Claude Code plugin passes an unset optional setting
// as an empty string, which must not hide the VS Code settings behind it.
const set = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);
const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? set(process.argv[i + 1]) : undefined;
};
const env = (name: string) => set(process.env[name]);
const log = (line: string) => process.stderr.write(`[edgemat-mcp] ${line}\n`);

const fromVsCode = vscodeUserSettings();
const settings: SettingsReader = (key) =>
  key === "edgemat.gamePath" ? arg("--game") ?? env("EDGEMAT_GAME_PATH") ?? fromVsCode(key)
  : key === "edgemat.bridgePath" ? arg("--bridge") ?? env("REDBRIDGE_EXE") ?? fromVsCode(key)
  : fromVsCode(key);
const cacheDir = arg("--cache") ?? env("EDGEMAT_CACHE") ?? defaultCacheDir();

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
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const preset = (p?: { plain: string; name: string }) => (p ? `${p.plain} (${p.name})` : undefined);

/** One layer in plain words, as mat_describe and mat_edit give it. */
const layerOut = (l: LayerInfo) => ({
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
});

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
      return text({
        setup,
        layers: o.info.layers.length,
        shown: o.info.shownCount,
        ratio: o.info.ratio,
        warnings: o.info.warnings.length ? o.info.warnings : undefined,
        mask: o.masks ? { name: o.masks.name, from: o.maskFrom, count: o.masks.count } : { error: o.maskError },
        otherMasks: o.maskChoices.length > 1 ? o.maskChoices.slice(1) : undefined,
        colorMap: o.composite?.file,
        layerList: o.info.layers.filter((l) => !(hideUnused && (l.surface.unused || !l.surface.path))).map(layerOut),
      });
    } catch (e) {
      return failure(e);
    }
  },
);

const LayerEditSchema = z.object({
  layer: z.number().int().min(0).describe("The layer's index, as mat_describe lists it (0 is the base)"),
  surface: z.string().optional().describe("A new surface: a game path, a template name, or words that fit one surface. Its presets reset to the new surface's defaults unless given too"),
  color: z.string().optional().describe("A color preset name, or a color as words ('dark red'), #rrggbb or 'r g b': the surface's closest preset is used, and how close it is comes back in notes"),
  roughness: z.string().optional().describe("A roughness preset name, or words from its plain description ('glossy', 'matte')"),
  roughnessContrast: z.string().optional(),
  metal: z.string().optional().describe("A metal preset name, or words ('not metal', 'fully metal')"),
  metalContrast: z.string().optional(),
  bumps: z.string().optional().describe("A bumps preset name, or words ('faint bumps', 'flat')"),
  tile: z.number().optional().describe("The layer's own tiling (matTile, 0 to 1000); the surface multiplies it by its own factor"),
  offsetU: z.number().optional(),
  offsetV: z.number().optional(),
  opacity: z.number().optional().describe("0 hides the layer, 1 is full; the game uses up to 4"),
  microblend: z.string().optional().describe("A microblend's game path, name or words; 'plain' for the default"),
  microblendTile: z.number().optional(),
  microblendContrast: z.number().optional(),
  microblendNormalStrength: z.number().optional(),
});

server.registerTool(
  "mat_edit",
  {
    description:
      "Edits a multilayered setup (.mlsetup) and saves it into a WolvenKit project, as EDGEmat's setup editor does. A recolor: change layers' surfaces, colors (words such as 'dark red' pick the surface's closest preset), finish, tiling, opacity and microblend. " +
      "Use mat_find to find a garment's setup and mat_describe to see its layers first. Edits are checked: a layer can only use its surface's own presets. " +
      "save 'new' (the default) writes the setup beside the original under a new name and copies every mesh that uses it into the project, pointed at the new setup: it shows in the game with no other mod, once the project is packed and installed (REDcode: Pack and Try). " +
      "save 'inPlace' writes it at its own game path, which replaces the game's setup and shows in the game only with the Material Texture Override mod. " +
      "preview true describes the result without writing anything. project: the project folder, its .cpmodproj, or its source\\archive folder.",
    inputSchema: {
      setup: z.string().describe("A game path (base\\...\\x.mlsetup), or a file on disk"),
      edits: z.array(LayerEditSchema).min(1),
      project: z.string().optional(),
      save: z.enum(["new", "inPlace"]).default("new"),
      target: z.string().optional().describe("The game path for the new setup; default: beside the original, named with the project's name"),
      mask: z.string().optional(),
      preview: z.boolean().default(false),
    },
  },
  async ({ setup, edits, project, save, target, mask, preview }) => {
    try {
      const b = await getBridge();
      const lib = await library();
      const source = isFilePath(setup) ? { file: setup, gamePath: gamePathInProject(setup) } : { gamePath: setup };
      const o = await openSetup(b, lib, cacheDir, source, mask);
      let edited = o.setup;
      const notes: string[] = [];
      for (const e of edits) {
        const { layer, ...words } = e;
        const w = patchFromWords(edited, layer, words, lib);
        const r = applyLayerEdit(edited, layer, w.patch, lib);
        edited = r.setup;
        notes.push(...w.notes, ...r.notes.map((n) => `Layer ${layer}: ${n}`));
      }
      const after = withSetup(o, edited, lib, cacheDir);
      const changed = [...new Set(edits.map((e) => e.layer))].map((i) => layerOut(after.info.layers[i]));
      const result = { layers: changed, colorMap: after.composite?.file, warnings: after.info.warnings.length ? after.info.warnings : undefined };
      if (preview) return text({ preview: true, ...result, notes: notes.length ? notes : undefined });

      if (!project) return failure(new Error("Pass project: the WolvenKit project folder to save into (or preview: true to only see the result)."));
      const p = projectAt(project);
      if (!p) return failure(new Error(`${project} is not a WolvenKit project: it has no .cpmodproj and no source\\archive folder.`));
      const from = source.gamePath;
      const suffix = suffixFor(p.name);
      let saved;
      if (save === "inPlace") {
        const to = target ?? from;
        if (!to) return failure(new Error("This file has no game path to save in place: pass target, the game path to save it at."));
        saved = await saveToProject(b, { setup: edited, archive: p.archive, target: to });
        if (await isGameFile(b, to)) notes.push("Saved in place of the game's own setup: it shows in the game only with the Material Texture Override mod installed.");
      } else {
        const to = target ?? (from ? newPathFor(from, suffix) : undefined);
        if (!to) return failure(new Error("This file has no game path: pass target, the game path to save it at."));
        const search: MeshSearch = { folder: "", read: 0, skipped: [] };
        const meshes = from ? await meshesUsing(b, from, p.archive, 60, true, search, [to]) : [];
        if (from && !meshes.length) notes.push(`No mesh in ${search.folder} uses ${from} (${search.read} read), so nothing points at the new setup yet.`);
        for (const s of search.skipped) notes.push(`Could not read ${s.mesh}: ${s.reason}`);
        saved = await saveToProject(b, { setup: edited, archive: p.archive, target: to, from, meshes: meshes.map((m) => m.mesh), suffix });
      }
      notes.push(...saved.notes);
      return text({
        saved: { project: p.dir, setup: saved.written[0], meshes: saved.meshes, written: saved.written },
        next: "Pack the project and install it (REDcode: Pack and Try), then look at the garment in the game.",
        ...result,
        notes: notes.length ? notes : undefined,
      });
    } catch (e) {
      return failure(e);
    }
  },
);

const materialOut = (m: MaterialUse) =>
  m.multilayered
    ? { name: m.name, multilayered: true, setup: m.setup, mask: m.mask, chunks: m.chunks, ...(m.instances.length ? { via: m.instances } : {}) }
    : { name: m.name, base: m.base, chunks: m.chunks, ...(m.instances.length ? { via: m.instances } : {}) };
const meshOut = (l: MeshLook) => ({ mesh: l.mesh, appearance: l.appearance, ...(l.component ? { component: l.component } : {}), materials: l.materials.map(materialOut) });

server.registerTool(
  "mat_find",
  {
    description:
      "Finds what to recolor. query: words that match clothing items by in-game name or record id ('punk jeans', 'Sunny Ammo', 'CasualShoes_01') and meshes by path ('s1_055'); returns both lists. " +
      "item: a clothing record id (Items.Pants_03_basic_01), or words matching one item: walks item > clothing.csv > root entity > .app appearance (one per body type: masculine, feminine) > mesh and mesh appearance > materials, " +
      "and for each multilayered material its setup (.mlsetup) and the mask set (.mlmask) it names. The two bodies can use different meshes. " +
      "mesh (with optional appearance): a mesh's materials, in one appearance or all. Pass a found setup and its mask to mat_describe. Items from mods (ArchiveXL) are not followed yet.",
    inputSchema: { query: z.string().optional(), item: z.string().optional(), mesh: z.string().optional(), appearance: z.string().optional(), limit: z.number().int().min(1).max(500).default(30) },
  },
  async ({ query, item, mesh, appearance, limit }) => {
    try {
      const b = await getBridge();
      if (mesh) return text({ mesh, appearances: (await meshMaterials(b, mesh, appearance)).map(meshOut) });
      const items = await loadItems(b, cacheDir);
      if (item) {
        const exact = items.find((i) => i.id.toLowerCase() === item.toLowerCase());
        const found = exact ? [exact] : searchItems(items, item);
        // Records that share an entity and appearance (an item and its crafting or test copies) are one garment.
        const sameLook = found.length > 0 && found.every((i) => i.entityName === found[0].entityName && i.appearanceName === found[0].appearanceName);
        if (!sameLook) {
          return text({ found: false, matches: found.length, candidates: found.slice(0, limit).map((i) => ({ id: i.id, name: i.name, slot: i.slot })), hint: found.length ? "Several items fit: pass one id." : "No item fits: try mat_find with query." });
        }
        const m = await itemMaterials(b, found[0]);
        return text({
          item: { id: m.item.id, name: m.item.name, slot: m.item.slot },
          root: m.root,
          looks: m.looks.map((l) => ({ body: l.body, app: l.app, appearance: l.appAppearance, meshes: l.meshes.map(meshOut) })),
          warnings: m.warnings.length ? m.warnings : undefined,
        });
      }
      if (!query) return failure(new Error("Pass query, item or mesh."));
      const foundItems = searchItems(items, query);
      const words = query.toLowerCase().replace(/[.]/g, " ").split(/\s+/).filter(Boolean);
      const longest = [...words].sort((a, c) => c.length - a.length)[0];
      const meshes = (await b.search(longest, 20000)).items
        .map((i) => i.name)
        .filter((n) => n.toLowerCase().endsWith(".mesh") && !/\\shadow_meshes\\|_shadow\.mesh$/i.test(n) && words.every((w) => n.toLowerCase().includes(w)));
      return text({
        items: { total: foundItems.length, list: foundItems.slice(0, limit).map((i) => ({ id: i.id, name: i.name, slot: i.slot })) },
        meshes: { total: meshes.length, list: meshes.slice(0, limit) },
      });
    } catch (e) {
      return failure(e);
    }
  },
);

// ---- Generate a material (design, "Generate a material"; the New Material page's twin) ------------------

const TargetSchema = z.object({
  mesh: z.string().describe("A mesh's game path, as mat_find lists it"),
  material: z.string().describe("The material entry's name in that mesh, as mat_find lists it"),
});
const MaterialOptions = {
  name: z.string().optional().describe("The material's name, made into file names ('brown leather' > brown_leather); default from the words or the file"),
  repeat: z.number().int().min(1).max(32).default(4).describe("How many times it repeats across the garment or object; more is finer"),
  bumps: z.number().min(0).max(2).default(1).describe("0 flat, 0.5 light, 1 moderate, 2 strong; made from the image's light and dark"),
  shine: z.enum(["matte", "satin", "glossy"]).default("satin"),
  metal: z.boolean().default(false),
  targets: z.array(TargetSchema).optional().describe("Mesh materials to put it on. For a garment, list the same material on each body's mesh (mat_find's looks). On a garment the repeat is baked into the texture and the garment keeps its own folds"),
};

function projectFor(project: string | undefined) {
  if (!project) throw new Error("Pass project: the WolvenKit project folder to write into.");
  const p = projectAt(project);
  if (!p) throw new Error(`${project} is not a WolvenKit project: it has no .cpmodproj and no source\\archive folder.`);
  return p;
}

const materialOutResult = (r: MaterialResult, project: string) => ({
  saved: { project, material: r.mi, folder: r.folder, applied: r.applied, files: r.written, image: r.raw[0], record: r.raw[1] },
  next: r.applied.length
    ? "Pack the project and install it (REDcode: Pack and Try, or Pack and Install with the game closed), then look at the garment in the game."
    : "Not put on any mesh: pass targets (mat_find lists meshes and material names), or mat_apply the .mi later.",
});

server.registerTool(
  "mat_generate",
  {
    description:
      "Makes a new material from words through an AI image service, as EDGEmat's New Material page does: the image is made seamless, bumps and shine are derived, and it is written into a WolvenKit project " +
      "as textures and a textured .mi (metal_base), and put on the target mesh materials. Spends the user's credits with their own key, from the environment: GEMINI_API_KEY (service gemini) or OPENAI_API_KEY (service openai). " +
      "words: the material, such as 'worn brown leather with fine creases'; EDGEmat adds a prefix asking for a seamless texture in flat light with no text. " +
      "imageOnly true makes only the image and returns its file, to look at before using it with mat_from_image. A generated material replaces a whole material: on a garment it covers every part that material paints.",
    inputSchema: {
      words: z.string(),
      detail: z.enum(["fine", "medium", "coarse"]).default("medium"),
      service: z.enum(["gemini", "openai"]).optional().describe("Default: the first with a key in the environment"),
      model: z.string().optional().describe("Default: the newest image model the key can use"),
      quality: z.enum(["low", "medium", "high"]).default("medium").describe("OpenAI only"),
      prompt: z.string().optional().describe("The whole prompt, instead of the prefix plus words"),
      imageOnly: z.boolean().default(false),
      project: z.string().optional(),
      ...MaterialOptions,
    },
  },
  async ({ words, detail, service, model, quality, prompt, imageOnly, project, name, repeat, bumps, shine, metal, targets }) => {
    try {
      const s: ServiceId | undefined = service ?? (env(Services.gemini.env) ? "gemini" : env(Services.openai.env) ? "openai" : undefined);
      if (!s) return failure(new Error("No image service key: set GEMINI_API_KEY or OPENAI_API_KEY in the MCP server's environment (for Claude Code: claude mcp add ... -e GEMINI_API_KEY=...)."));
      const key = env(Services[s].env);
      if (!key) return failure(new Error(`No ${Services[s].name} key: set ${Services[s].env} in the MCP server's environment.`));
      const p = imageOnly ? undefined : projectFor(project);
      const chosen = model ?? (await listModels(s, { key, timeoutMs: 30_000 }))[0]?.id;
      if (!chosen) return failure(new Error(`${Services[s].name} lists no image models for this key.`));
      const fullPrompt = prompt ?? texturePrompt(words, detail);
      const started = Date.now();
      const img = await generateImage(s, chosen, fullPrompt, { key, quality });
      log(`${Services[s].name} ${chosen} made an image in ${((Date.now() - started) / 1000).toFixed(1)} s`);
      const b = await getBridge();
      const png = await imageAsPng(b, img.bytes, img.mime.includes("jpeg") ? ".jpg" : ".png");
      const made = { service: Services[s].name, model: chosen, prompt: fullPrompt, words };
      if (!p) {
        const dir = path.join(cacheDir, "generated");
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, `${materialSlug(name ?? words)}-${new Date().toISOString().replace(/[:.]/g, "-")}.png`);
        fs.writeFileSync(file, png);
        fs.writeFileSync(file.replace(/\.png$/, ".json"), JSON.stringify({ made: new Date().toISOString(), ...made }, null, 2));
        return text({ image: file, ...made, next: "Look at the image; then mat_from_image with this file, a project and targets." });
      }
      const r = await makeMaterial(b, p.archive, { name: name ?? words, image: png, repeat, bumps, shine, metal, made }, targets ?? []);
      return text({ ...made, ...materialOutResult(r, p.dir) });
    } catch (e) {
      return failure(e);
    }
  },
);

server.registerTool(
  "mat_from_image",
  {
    description:
      "Makes a new material from an image file (a photo or texture: PNG, JPG, TGA, DDS, BMP or TIFF), with no AI service: made square and seamless, bumps and shine derived, written into a WolvenKit project " +
      "as textures and a textured .mi (metal_base), and put on the target mesh materials. Also the second step after mat_generate with imageOnly.",
    inputSchema: { file: z.string(), project: z.string(), ...MaterialOptions },
  },
  async ({ file, project, name, repeat, bumps, shine, metal, targets }) => {
    try {
      if (!fs.existsSync(file)) return failure(new Error(`No file at ${file}.`));
      const p = projectFor(project);
      const b = await getBridge();
      const png = await imageAsPng(b, fs.readFileSync(file), path.extname(file));
      // An image from mat_generate keeps its record.
      const record = file.replace(/\.[^.]+$/, ".json");
      const made = fs.existsSync(record) ? { ...JSON.parse(fs.readFileSync(record, "utf8")), file } : { file };
      const r = await makeMaterial(b, p.archive, { name: name ?? path.basename(file, path.extname(file)).replace(/-\d{4}-\d\d-\d\dT.*$/, "").replace(/[_-]+/g, " "), image: png, repeat, bumps, shine, metal, made }, targets ?? []);
      return text(materialOutResult(r, p.dir));
    } catch (e) {
      return failure(e);
    }
  },
);

server.registerTool(
  "mat_apply",
  {
    description:
      "Puts an existing material (.mi, a game path, such as one mat_from_image wrote) on mesh materials: each mesh is copied into the project (or its copy there changed) and the named material entry takes the .mi as it is. " +
      "Unlike mat_generate and mat_from_image it does not bake a repeat for a garment; to put a new material on a garment, make it with targets instead.",
    inputSchema: { project: z.string(), mi: z.string(), targets: z.array(TargetSchema).min(1) },
  },
  async ({ project, mi, targets }) => {
    try {
      const p = projectFor(project);
      const b = await getBridge();
      const written: string[] = [];
      for (const t of targets) for (const f of await applyMaterial(b, p.archive, t.mesh, t.material, mi)) if (!written.includes(f)) written.push(f);
      return text({ saved: { project: p.dir, mi, targets, files: written }, next: "Pack the project and install it (REDcode: Pack and Try), then look in the game." });
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
