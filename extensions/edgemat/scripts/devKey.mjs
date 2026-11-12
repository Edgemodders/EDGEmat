// A service's key for the check scripts (paint-check, reshape-check): never printed, never shipped. The
// environment variable first (GEMINI_API_KEY, OPENAI_API_KEY, TRIPO_API_KEY). Else, on a PC with REDnode's
// checkout beside this repo, REDnode's own keys.mjs reads the EDGE tools' shared key store, where the dev
// PC's keys still are. EDGEmat no longer has a copy of it (EDGEmat #10, 2026-11-11): the extension and the
// MCP server never read the store.
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const Env = { gemini: "GEMINI_API_KEY", openai: "OPENAI_API_KEY", tripo: "TRIPO_API_KEY" };
const redNodeKeys = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../REDnode/tools/keys/keys.mjs");

/** The key, or undefined with a line on stderr saying where to put one. */
export async function devKey(service) {
  const env = process.env[Env[service]]?.trim();
  if (env) return env;
  if (fs.existsSync(redNodeKeys)) {
    const { getKey } = await import(pathToFileURL(redNodeKeys).href);
    const k = getKey(service, { tool: "EDGEmat" });
    if (k) return k;
  }
  console.error(`No ${service} key: set ${Env[service]} in this terminal's environment.`);
  return undefined;
}
