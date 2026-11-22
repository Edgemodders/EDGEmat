// Keys for the AI services: the environment variables and a typed key's check. Where the keys are kept is
// elsewhere: in VS Code, REDcode's shared key store through REDcode's API, or with an older REDcode VS Code's
// secret storage (src/keys.ts); the MCP server reads the store through a REDbridge of its own (keyStore.ts,
// EDGEmat #18). An environment variable wins everywhere. Wardrobe Designer's core use and the check scripts
// get their keys from the environment. Nothing here reads or decrypts a file.

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
