// Keys for the AI services, without storing them (EDGEmat #10, the owner's decision of 2026-11-11). The
// extension keeps them in VS Code's secret storage (materialPage.ts). The MCP server, Wardrobe Designer's
// core use and the check scripts get them from their environment; an environment variable wins in the
// extension too. Nothing here reads or decrypts a file: the EDGE tools' shared key store is shelved, since
// the VS Code Marketplace refused EDGEhack 0.1.0 as "suspicious content" with its PowerShell decryption inside.

/** The services EDGEmat uses a key for, and the environment variable that holds each. */
export const KeyEnv = { gemini: "GEMINI_API_KEY", openai: "OPENAI_API_KEY", tripo: "TRIPO_API_KEY" } as const;
export type KeyService = keyof typeof KeyEnv;

const Names: Record<KeyService, string> = { gemini: "Google Gemini", openai: "OpenAI", tripo: "Tripo" };
const Prefix: Partial<Record<KeyService, string>> = { openai: "sk-" };
const Shape = /^[\x21-\x7e]{1,4096}$/; // printable ASCII, no spaces or line breaks

/** The service's key from the environment, or undefined. */
export function envKey(service: KeyService): string | undefined {
  return process.env[KeyEnv[service]]?.trim() || undefined;
}

/** What is wrong with a typed key, in words, or null. */
export function checkKey(service: KeyService, key: string): string | null {
  const k = key.trim();
  if (!Shape.test(k)) return "A key is one line of letters, digits and signs, with no spaces";
  const prefix = Prefix[service];
  if (prefix && !k.startsWith(prefix)) return `${Names[service]} keys start with ${prefix}`;
  return null;
}
