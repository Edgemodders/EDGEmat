// Third-party notices for the npm packages EDGEmat's builds bundle, found from the builds' source maps:
// each package with its version, license and license text. MIT and similar licenses ask for the
// notice to travel with the code, so the VSIX, the MCP server and the Nexus zip carry this file.
//
//   node tools/release/notices.mjs               dist/THIRD-PARTY-NOTICES.txt: the extension and the MCP server
//   node tools/release/notices.mjs --extension   extensions/edgemat/THIRD-PARTY-NOTICES.txt: the extension's bundle
//                                                only (vscode:prepublish runs it, after the build)
//
// Build first: it reads dist/*.map. Generated, never committed.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const extension = process.argv.includes("--extension");
const maps = [join(root, "extensions/edgemat/dist/extension.js.map"), join(root, "extensions/edgemat/dist/webview/setup.js.map"), join(root, "extensions/edgemat/dist/webview/surface.js.map")];
if (!extension) maps.push(join(root, "packages/edgemat-mcp/dist/server.cjs.map"));
const out = extension ? join(root, "extensions/edgemat/THIRD-PARTY-NOTICES.txt") : join(root, "dist/THIRD-PARTY-NOTICES.txt");

// Each bundled package's folder: the source path up to node_modules/<name> or node_modules/@scope/<name>.
const packages = new Map();
for (const map of maps) {
  if (!existsSync(map)) throw new Error(`${map} is missing: build first (npm run build)`);
  for (const source of JSON.parse(readFileSync(map, "utf8")).sources) {
    const file = resolve(dirname(map), source);
    const parts = file.split(sep);
    const at = parts.lastIndexOf("node_modules");
    if (at < 0) continue;
    const dir = parts.slice(0, at + (parts[at + 1].startsWith("@") ? 3 : 2)).join(sep);
    packages.set(dir, true);
  }
}

const entries = [...packages.keys()]
  .map((dir) => {
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    const licenseFile = readdirSync(dir).find((f) => /^(licen[sc]e|copying)(\.(md|txt))?$/i.test(f));
    const license = pkg.license ?? pkg.licenses?.map((l) => l.type).join(" OR ") ?? "unknown";
    const text = licenseFile ? readFileSync(join(dir, licenseFile), "utf8").trim() : `(The package ships no license file; its package.json says ${license}.)`;
    return { name: pkg.name, version: pkg.version, license, url: typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url, text };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

const line = "-".repeat(78);
const body = [
  `EDGEmat${extension ? " (the VS Code extension)" : ", the VS Code extension and its MCP server,"} bundles these npm packages.`,
  "Their notices and licenses follow. EDGEmat itself is MIT (LICENSE).",
  "",
  ...entries.map((e) => `- ${e.name} ${e.version} (${e.license})`),
  "",
  ...entries.flatMap((e) => [line, `${e.name} ${e.version}`, `License: ${e.license}${e.url ? `\nSource: ${e.url.replace(/^git\+/, "")}` : ""}`, "", e.text, ""]),
].join("\n");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, body.replace(/\r\n/g, "\n"), "utf8");
console.log(`${out.slice(root.length + 1)}: ${entries.length} packages (${entries.map((e) => e.name).join(", ")})`);
