// Builds Wardrobe Designer's zip for Nexus Mods and GitHub from apps/wardrobe-designer, the same way
// as REDnode's tools/release/pack-zip.mjs builds its app packs. The app installs into an existing REDnode.
//
//   node tools/release/wardrobe-zip.mjs            needs a changelog section for the version
//   node tools/release/wardrobe-zip.mjs --draft    without the changelog checks, for a test build
//
// Build the app first (npm run wardrobe:build). Output: dist/Wardrobe-Designer-<version>.zip (with
// -draft for a draft), laid out like the game folder so Vortex or a player extracting it by hand puts
// it in the same place:
//   red4ext/plugins/REDnode/apps/wardrobe-designer/rednode-app.json   off until the player switches it on
//   red4ext/plugins/REDnode/apps/wardrobe-designer/dist/mod.mjs       the app, with EDGEmat's core inside
//   red4ext/plugins/REDnode/apps/wardrobe-designer/LICENSE.txt
//   red4ext/plugins/REDnode/apps/wardrobe-designer/THIRD-PARTY-NOTICES.txt
//
// The version is rednode-app.json's, which package.json must match. A release needs a section for it in
// apps/wardrobe-designer/changelog.md and nothing left under Unreleased.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const draft = process.argv.includes("--draft");
const app = join(root, "apps", "wardrobe-designer");
const manifest = JSON.parse(readFileSync(join(app, "rednode-app.json"), "utf8"));
const { version } = manifest;

const pkgVersion = JSON.parse(readFileSync(join(app, "package.json"), "utf8")).version;
if (pkgVersion !== version) throw new Error(`apps/wardrobe-designer: rednode-app.json is ${version} but package.json is ${pkgVersion}: raise both`);
if (!manifest.requires?.rednode) throw new Error('rednode-app.json must ask for a REDnode in "requires", so the Mod Manager says so when the player\'s is too old');
const bundle = join(app, manifest.main);
if (!existsSync(bundle)) throw new Error(`${manifest.main} is missing: build first (npm run wardrobe:build)`);

if (!draft) {
  const changelog = readFileSync(join(app, "changelog.md"), "utf8");
  if (!new RegExp(`^## ${version.replace(/\./g, "\\.")} \\(`, "m").test(changelog)) {
    throw new Error(`apps/wardrobe-designer/changelog.md has no "## ${version} (<date>)" section. Rename Unreleased first, or pass --draft for a test build`);
  }
  const unreleased = changelog.match(/^## Unreleased\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m);
  if (unreleased && unreleased[1].trim()) {
    throw new Error('apps/wardrobe-designer/changelog.md has changes under Unreleased. Raise the version and rename Unreleased to "## <version> (<date>)", or pass --draft for a test build');
  }
}

// The license notices for the npm packages the bundle carries.
const notices = spawnSync(process.execPath, [join(root, "tools", "release", "notices.mjs"), "--wardrobe"], { stdio: "inherit" });
if (notices.status !== 0) throw new Error("The notices failed");

const out = join(root, "dist");
const stage = join(out, "stage-wardrobe-designer");
const target = join(stage, "red4ext", "plugins", "REDnode", "apps", manifest.id);
const zip = join(out, `Wardrobe-Designer-${version}${draft ? "-draft" : ""}.zip`);
rmSync(stage, { recursive: true, force: true });
rmSync(zip, { force: true });
mkdirSync(join(target, dirname(manifest.main)), { recursive: true });

writeFileSync(join(target, "rednode-app.json"), JSON.stringify({ ...manifest, open: false }, null, 2) + "\n");
cpSync(bundle, join(target, manifest.main));
cpSync(join(root, "LICENSE"), join(target, "LICENSE.txt"));
cpSync(join(app, "dist", "THIRD-PARTY-NOTICES.txt"), join(target, "THIRD-PARTY-NOTICES.txt"));

// Windows' own tar writes zip files (-a picks the format from the name). Git's tar does not.
const tar = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
const packed = spawnSync(tar, ["-a", "-c", "-f", zip, "red4ext"], { cwd: stage, stdio: "inherit" });
if (packed.status !== 0) throw new Error("Zipping failed");
rmSync(stage, { recursive: true, force: true });

console.log(`${zip}: ${(statSync(zip).size / 1024).toFixed(0)} KB`);
console.log(`Wardrobe Designer ${version}${draft ? " (draft)" : ""}: needs REDnode ${manifest.requires.rednode}, REDbridge ${manifest.requires.redbridge ?? "any"}`);
