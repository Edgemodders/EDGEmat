// Release notes from docs/changelog.md, the one changelog (the same way as REDnode's
// tools/release/notes.mjs). The release workflow uses it, and stops when the version has no section.
//
//   node tools/release/notes.mjs [version]              markdown for the GitHub release, with the install lines
//   node tools/release/notes.mjs [version] --nexus      the section's short Nexus summary (see below), for
//                                                       Nexus's changelog field; stops when there is none
//   node tools/release/notes.mjs --extension            writes extensions/edgemat/CHANGELOG.md, the
//                                                       extension's Changelog tab (vscode:prepublish runs it)
//   node tools/release/notes.mjs [version] --wardrobe   Wardrobe Designer's, from apps/wardrobe-designer/changelog.md
//                                                       (with --nexus too); its release workflow uses it
//   --out <file>                                        writes the notes to a file (UTF-8)
//
// The version defaults to the extension's package.json version (Wardrobe Designer's rednode-app.json with --wardrobe).
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const args = process.argv.slice(2);
const nexus = args.includes("--nexus");
const extension = args.includes("--extension");
const wardrobe = args.includes("--wardrobe");
const outAt = args.indexOf("--out");
const out = outAt >= 0 ? args.splice(outAt, 2)[1] : null;
const versionFile = wardrobe ? "apps/wardrobe-designer/rednode-app.json" : "extensions/edgemat/package.json";
const version = args.find((a) => !a.startsWith("--")) ?? JSON.parse(readFileSync(root + versionFile, "utf8")).version;
const changelog = wardrobe ? "apps/wardrobe-designer/changelog.md" : "docs/changelog.md";
const lines = readFileSync(root + changelog, "utf8").split(/\r?\n/);
const Docs = "https://edgemodders.github.io/EDGEmat/";

// A section's Nexus summary (below) left out: it is for Nexus only.
const withoutSummary = (part) => {
  const kept = [];
  for (let i = 0, inBlock = false; i < part.length; i++) {
    if (!inBlock && part[i].trim() === "<!-- nexus") inBlock = true;
    else if (inBlock && part[i].trim() === "-->") inBlock = false;
    else if (!inBlock) kept.push(part[i]);
  }
  return kept;
};

if (extension) {
  // Every section from Unreleased down, without the page's own notes on keeping it; an empty Unreleased is left out.
  const first = lines.findIndex((line) => line.startsWith("## "));
  const sections = [];
  for (let i = first; i >= 0 && i < lines.length; ) {
    let end = lines.findIndex((line, j) => j > i && line.startsWith("## "));
    if (end < 0) end = lines.length;
    const body = withoutSummary(lines.slice(i + 1, end));
    if (!(/^## Unreleased/.test(lines[i]) && !body.some((line) => line.trim()))) sections.push(lines[i], ...body);
    i = end < lines.length ? end : -1;
  }
  const text = `# Changelog\n\nWhat changed in each EDGEmat release. Also on the docs site: ${Docs}changelog.html\n\n${sections.join("\n").trim()}\n`;
  writeFileSync(root + "extensions/edgemat/CHANGELOG.md", text, "utf8");
  console.log("extensions/edgemat/CHANGELOG.md written from docs/changelog.md");
  process.exit(0);
}

// "## 0.2.0" or "## 0.2.0 (2026-10-20)" or "## 0.1.0 (2026-10-16), M1 Library"
const heading = new RegExp(`^## ${version.replace(/\./g, "\\.")}(\\s|,|$)`);
const start = lines.findIndex((line) => heading.test(line));
if (start < 0) {
  console.error(`${changelog} has no section for ${version}: rename Unreleased to "## ${version} (date)" first`);
  process.exit(1);
}
let end = lines.findIndex((line, i) => i > start && line.startsWith("## "));
if (end < 0) end = lines.length;
const section = lines.slice(start + 1, end);
if (!section.some((line) => line.trim())) {
  console.error(`${changelog}: the section for ${version} is empty`);
  process.exit(1);
}

const github = withoutSummary(section);

if (nexus) {
  // Nexus shows each line of a version's changelog as one entry, as plain text in a small field, and
  // cannot edit it once posted, so its lines are a short summary written by hand in the section, not
  // the section itself (EDGEmat #14; EDGErepo's Nexus tool stops a release otherwise):
  //
  //   <!-- nexus
  //   New: The Desk: meshes and setups you work on, kept across restarts
  //   Fixed: Edits in the setup editor vanished from view after switching tabs
  //   -->
  //
  // An HTML comment, so GitHub and the docs site show none of it. Each line starts with New:,
  // Changed:, Fixed:, Removed:, Other: or Needs:, has no markdown and at most NexusLine characters;
  // at most NexusLines lines. A "Full changelog" line with the link is added at the end (13 in all).
  // Check the result with: node ../EDGErepo/tools/nexus/nexus.mjs notes --notes <file>
  const NexusLine = 120;
  const NexusLines = 12;
  const open = section.findIndex((line) => line.trim() === "<!-- nexus");
  const close = open < 0 ? -1 : section.findIndex((line, i) => i > open && line.trim() === "-->");
  if (open < 0 || close < 0) {
    console.error(`${changelog}: the section for ${version} has no Nexus summary. Add one under its heading:

<!-- nexus
New: one short line per change, at most ${NexusLine} characters
-->`);
    process.exit(1);
  }
  const summary = section.slice(open + 1, close).map((line) => line.trim()).filter(Boolean);
  const wrong = [];
  if (!summary.length) wrong.push("it is empty");
  if (summary.length > NexusLines) wrong.push(`${summary.length} lines, at most ${NexusLines}`);
  for (const line of summary) {
    if (!/^(New|Changed|Fixed|Removed|Other|Needs): \S/.test(line)) wrong.push(`"${line}" does not start with New:, Changed:, Fixed:, Removed:, Other: or Needs:`);
    if (line.length > NexusLine) wrong.push(`"${line.slice(0, 50)}..." is ${line.length} characters, at most ${NexusLine}`);
    if (/`|\*\*|\]\(|^#|^- /.test(line)) wrong.push(`"${line.slice(0, 50)}..." has markdown`);
  }
  if (wrong.length) {
    console.error(`${changelog}: the Nexus summary for ${version}:\n- ${wrong.join("\n- ")}`);
    process.exit(1);
  }
  const full = wardrobe ? "https://github.com/Edgemodders/EDGEmat/blob/main/apps/wardrobe-designer/changelog.md" : `${Docs}changelog.html`;
  write([...summary, `Full changelog: ${full}`].join("\n"));
} else if (wardrobe) {
  write(`${github.join("\n").trim()}

**Install:** with Vortex, or extract \`Wardrobe-Designer-${version}.zip\` below into the Cyberpunk 2077 folder, so the app lands in \`red4ext/plugins/REDnode/apps/wardrobe-designer/\`. In the game: **F10**, the **Mod Manager**, select **Wardrobe Designer**, allow its permissions (REDbridge, REDagent, swapping archives) and switch it on. Needs [REDnode](https://www.nexusmods.com/cyberpunk2077/mods/35419) 0.48.1 or later, with REDbridge and REDagent (your Anthropic key), on game 2.5. On [Nexus Mods](https://www.nexusmods.com/cyberpunk2077/mods/36636) too.

Guide: ${Docs}wardrobe-designer.html (changelog: https://github.com/Edgemodders/EDGEmat/blob/main/apps/wardrobe-designer/changelog.md)`);
} else {
  write(`${github.join("\n").trim()}

**Install:** in VS Code's Extensions view, search for **EDGEmat** and press **Install** ([VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=edgemodders.edgemat), [Open VSX](https://open-vsx.org/extension/edgemodders/edgemat)). Or download \`edgemat-${version}.vsix\` below and run \`code --install-extension edgemat-${version}.vsix\`. Windows only. Needs Cyberpunk 2077 and REDbridge 0.8.0 or later; with [REDcode](https://github.com/Edgemodders/REDcode) set up, EDGEmat needs no configuration.

**For AI assistants:** the extension carries EDGEmat's MCP server. In VS Code, run **EDGEmat: Connect an Assistant (MCP)...** to connect Claude Code; agents inside VS Code 1.101 or later see the tools with no setup. Without VS Code: [\`@edgemodders/edgemat-mcp\`](https://www.npmjs.com/package/@edgemodders/edgemat-mcp) on npm, or \`edgemat-mcp-${version}.cjs\` below, one file for Node.js 20 or later.

Docs: ${Docs} (changelog: ${Docs}changelog.html)`);
}

function write(text) {
  if (out) writeFileSync(out, text + "\n", "utf8");
  else console.log(text);
}
