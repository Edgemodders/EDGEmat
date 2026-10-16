// M1's test outside VS Code: builds the material library from the game with the bundled core
// (dist/core.js, so run `npm run build` first) and checks its counts against the game's own listing.
//
//   node scripts/smoke.mjs [--cache <dir>]
//
// Finds the game and REDbridge from the VS Code settings, as the extension does (edgemat.*, then
// redcode.*). The library goes to EDGEmat's normal cache folder unless --cache is given.

import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";

const require = createRequire(import.meta.url);
const core = require("../dist/core.js");

const i = process.argv.indexOf("--cache");
const cache = i >= 0 ? process.argv[i + 1] : core.defaultCacheDir();
const settings = core.vscodeUserSettings();

const game = await core.resolveGame(settings, {}, true);
const choice = core.resolveBridge(settings);
if (!game) { console.error("FAIL: no game folder found"); process.exit(1); }
if (!choice) { console.error("FAIL: REDbridge.exe not found"); process.exit(1); }
console.log(`game   ${game.path} (${game.from})`);
console.log(`bridge ${choice.exe} (${choice.from})`);
console.log(`cache  ${cache}`);

const bridge = new core.BridgeClient({ exe: choice.exe, gamePath: game.path, dotnetRoot: choice.dotnetRoot });
bridge.on("error", (e) => console.error(`bridge error: ${e.message}`));
bridge.start();
const checks = [];
const check = (ok, what) => { checks.push(ok); console.log(`${ok ? "ok  " : "FAIL"} ${what}`); };
try {
  const info = await bridge.info();
  console.log(`REDbridge ${info.version}, WolvenKit ${info.wolvenKit}, ${info.archives} archives, ${info.files} files`);
  let last = "";
  const lib = await core.buildLibrary(bridge, cache, (message, done, total) => {
    if (message !== last || (done && done % 100 === 0)) { last = message; console.log(`  ${message}${total ? ` ${done}/${total}` : ""}`); }
  });

  const templatesInGame = (await bridge.search(".mltemplate", 2000)).items.filter((x) => x.name.toLowerCase().endsWith(".mltemplate"));
  const microblendsInGame = (await bridge.search("\\microblends\\", 2000)).items.filter((x) => x.name.toLowerCase().endsWith(".xbm"));
  const thumbs = new Set([...lib.templates, ...lib.microblends].map((x) => x.thumbnail).filter(Boolean));
  const thumbsOnDisk = [...thumbs].filter((t) => fs.existsSync(core.thumbnailFile(cache, t))).length;

  console.log(`\nbuilt in ${lib.seconds} s`);
  check(lib.counts.templates === new Set(templatesInGame.map((x) => x.name)).size, `surfaces: ${lib.counts.templates} in the library, ${new Set(templatesInGame.map((x) => x.name)).size} in the game`);
  check(lib.counts.microblends === new Set(microblendsInGame.map((x) => x.name)).size, `microblends: ${lib.counts.microblends} in the library, ${new Set(microblendsInGame.map((x) => x.name)).size} in the game`);
  check(lib.counts.setups > 0 && lib.counts.masks > 0, `counted ${lib.counts.setups} setups and ${lib.counts.masks} mask sets`);
  check(thumbsOnDisk === thumbs.size && thumbs.size > 0, `thumbnails: ${thumbsOnDisk} of ${thumbs.size} on disk`);
  const colors = lib.templates.reduce((n, t) => n + t.colors.length, 0);
  check(colors > 0 && lib.templates.every((t) => t.defaults.colorScale), `presets: ${colors} colors; every surface has a default color`);
  check(lib.failed.length === 0, `failed files: ${lib.failed.length}${lib.failed.length ? "\n       " + lib.failed.slice(0, 10).join("\n       ") : ""}`);
  console.log(`     missing in the game itself: ${lib.missing.length}${lib.missing.length ? " (" + lib.missing.join(", ") + ")" : ""}`);
  check(await core.isCurrent(core.loadLibrary(cache), bridge), "the cached library reads back and matches the game's archives");
  const leather = core.searchTemplates(lib, "leather");
  check(leather.length > 0, `search "leather": ${leather.length} surfaces, such as ${leather.slice(0, 3).map((t) => t.name).join(", ")}`);
  console.log(`\nlibrary.json ${(fs.statSync(core.libraryFile(cache)).size / 1e6).toFixed(1)} MB, ${path.join(cache, "thumbs")}`);
} finally {
  bridge.stop();
}
const failed = checks.filter((c) => !c).length;
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
