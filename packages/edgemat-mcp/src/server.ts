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
  BridgeClient, buildLibrary, defaultCacheDir, isCurrent, isGameFolder, loadLibrary, resolveBridge, resolveGame, searchMicroblends, searchTemplates, vscodeUserSettings,
  type Library, type SettingsReader, type Template,
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
    defaultColor: def ? { name: def.name, rgb: def.rgb.map((v) => Math.round(v * 1000) / 1000) } : t.defaults.colorScale,
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

process.on("exit", () => bridge?.stop());
server.connect(new StdioServerTransport()).then(
  () => log(`ready; library cache ${cacheDir}`),
  (e) => {
    log(`could not start: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  },
);
