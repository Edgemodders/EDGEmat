// The player's AI service keys, shared by every EDGE tool on this PC (REDnode #23): read and written
// through keys.mjs, REDnode's library copied unchanged beside this file. An environment variable wins
// when set (GEMINI_API_KEY, OPENAI_API_KEY), so an MCP client that passes a key still works.

// keys.mjs is an ES module and this package is CommonJS: esbuild bundles it either way, and TypeScript
// only objects to the module kind, not the types (keys.d.mts).
// @ts-expect-error TS1479
export { checkKey, envName, hasKey, keysDir, promises as sharedKeys } from "./keys.mjs";
