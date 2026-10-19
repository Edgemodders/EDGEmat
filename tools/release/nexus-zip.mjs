// Builds the Nexus Mods file: dist/EDGEmat-<version>-nexus.zip with the .vsix, the MCP server, how to
// install them, and the licenses. Run after the VSIX is packaged and the MCP server built (the release
// workflow's Package step, or npm run edgemat:package and npm run mcp:build). The workflow attaches the
// zip to the GitHub release; it is uploaded to Nexus by hand (nexus/README.md). The same way as REDcode's.
//   node tools/release/nexus-zip.mjs
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dist = path.join(root, "dist");
const { version } = JSON.parse(fs.readFileSync(path.join(root, "extensions", "edgemat", "package.json"), "utf8"));
const vsix = path.join(dist, `edgemat-${version}.vsix`);
const mcp = [path.join(dist, `edgemat-mcp-${version}.cjs`), path.join(root, "packages", "edgemat-mcp", "dist", "server.cjs")].find((p) => fs.existsSync(p));
const stage = path.join(dist, "nexus");
const zip = path.join(dist, `EDGEmat-${version}-nexus.zip`);

if (!fs.existsSync(vsix)) throw new Error(`${vsix} is missing: package the extension first (npm run edgemat:package)`);
if (!mcp) throw new Error("The MCP server is missing: build it first (npm run mcp:build)");
spawnSync(process.execPath, [path.join(root, "tools", "release", "notices.mjs")], { stdio: "inherit" });
fs.rmSync(stage, { recursive: true, force: true });
fs.rmSync(zip, { force: true });
fs.mkdirSync(stage, { recursive: true });

fs.copyFileSync(vsix, path.join(stage, path.basename(vsix)));
fs.copyFileSync(mcp, path.join(stage, `edgemat-mcp-${version}.cjs`));
fs.copyFileSync(path.join(root, "LICENSE"), path.join(stage, "LICENSE.txt"));
fs.copyFileSync(path.join(dist, "THIRD-PARTY-NOTICES.txt"), path.join(stage, "THIRD-PARTY-NOTICES.txt"));
fs.writeFileSync(
  path.join(stage, "README.txt"),
  [
    `EDGEmat ${version}: the EDGE material editor for Cyberpunk 2077, a VS Code extension.`,
    "A preview: it reads a garment's materials and shows them, in plain words and in 3D. It does not edit them yet.",
    "",
    "This is a VS Code extension, not a game mod. Do not install it with Vortex.",
    "",
    "Install:",
    "  1. In VS Code (or VSCodium, or EDGEkit), open the Extensions view (Ctrl+Shift+X).",
    "  2. Click ... at its top, choose Install from VSIX..., and pick",
    `     edgemat-${version}.vsix from this folder.`,
    "  3. Click the EDGEmat icon in the activity bar. EDGEmat builds its material library",
    "     from your game the first time, in under half a minute.",
    "",
    "Or from a terminal:",
    `  code --install-extension edgemat-${version}.vsix`,
    "",
    "Needs Windows 10 or 11, 64-bit, VS Code 1.70 or later, and REDbridge 0.8.0 or later.",
    "The easy way to get REDbridge is REDcode (https://github.com/Edgemodders/REDcode):",
    "its Install REDbridge fetches it, and EDGEmat then needs no setup at all.",
    "View in 3D needs REDcode.",
    "",
    `For AI assistants: edgemat-mcp-${version}.cjs is EDGEmat's MCP server (Node.js 20 or later).`,
    "Keep it somewhere stable, then for Claude Code run once:",
    `  claude mcp add edgemat -- node "<that folder>\\edgemat-mcp-${version}.cjs"`,
    "",
    "Manual: https://edgemodders.ai/wiki/edgemat/",
    "Docs: https://edgemodders.github.io/EDGEmat/",
    "Source and issues: https://github.com/Edgemodders/EDGEmat",
    "",
  ].join("\r\n"),
);

// Windows' own tar writes zip files (-a picks the format from the name); Git's tar does not.
const tar = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
const packed = spawnSync(tar, ["-a", "-c", "-f", zip, ...fs.readdirSync(stage)], { cwd: stage, stdio: "inherit" });
if (packed.status !== 0) throw new Error("Zipping failed");
fs.rmSync(stage, { recursive: true, force: true });
console.log(`${zip}: ${(fs.statSync(zip).size / 1048576).toFixed(1)} MB`);
