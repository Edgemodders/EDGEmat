// EDGEmat's one version, shared by the extension and the MCP server (the same way as REDnode's
// tools/version.mjs). The extension's package.json holds it; this script copies it into the rest.
//
//   node tools/version.mjs            show the version and where each part stands
//   node tools/version.mjs 0.3.2      set it everywhere
//   node tools/version.mjs --check    fail if any part differs (the release workflow runs it)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = (p) => join(root, p);

// Each part: where its version lives, how to read it and how to write it.
const pattern = (path, re) => ({
  path,
  read: () => readFileSync(file(path), "utf8").match(re)?.[2],
  write: (v) => {
    const text = readFileSync(file(path), "utf8");
    writeFileSync(file(path), text.replace(re, (_m, a, _old, b) => `${a}${v}${b}`));
  },
});
const json = (path) => pattern(path, /^(\{[\s\S]*?\n {2}"version":\s*")([^"]*)(")/);
const locked = (workspace) => pattern("package-lock.json", new RegExp(`("${workspace}": \\{\\s*(?:"name": "[^"]*",\\s*)?"version": ")([^"]*)(")`));

const PARTS = [
  { name: "Extension", ...json("extensions/edgemat/package.json") },
  { name: "MCP server", ...json("packages/edgemat-mcp/package.json") },
  { name: "Lock file, extension", ...locked("extensions/edgemat") },
  { name: "Lock file, MCP server", ...locked("packages/edgemat-mcp") },
];

const arg = process.argv[2];
if (arg && arg !== "--check") {
  if (!/^\d+\.\d+\.\d+$/.test(arg)) {
    console.error(`A version is three numbers, such as 0.3.2, not "${arg}"`);
    process.exit(1);
  }
  for (const p of PARTS) p.write(arg);
  console.log(`EDGEmat is now ${arg}.`);
}

const want = PARTS[0].read();
let differ = 0;
for (const p of PARTS) {
  const have = p.read();
  const ok = have === want;
  if (!ok) differ++;
  console.log(`${ok ? "  " : "! "}${p.name.padEnd(24)} ${have ?? "(not found)"}  ${p.path}`);
}
if (differ) {
  console.error(`${differ} part(s) differ from ${want}. Set them all with: node tools/version.mjs <version>`);
  process.exit(1);
}
