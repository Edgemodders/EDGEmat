# Dev setup

What a Windows PC needs to work on EDGEmat. The shared tools are the same as in [REDcode's setup guide](https://edgemodders.github.io/REDcode/dev-setup.html). The code starts in M1: the extension in `extensions/edgemat` and the MCP server in `packages/edgemat-mcp`, one npm workspace.

## 1. Base tools

| Tool | Version used | Why | Install |
|---|---|---|---|
| Git for Windows | as REDcode | Source control | `winget install --id Git.Git -e` |
| nvm for Windows and Node.js | as REDcode (Node 24) | The tool will be TypeScript, as the rest of the ecosystem | `winget install --id CoreyButler.NVMforWindows -e`, then `nvm install 24` and `nvm use 24` |
| Python | 3.10 or later | Brand tooling | |
| Chrome or Edge | any | Renders the brand images | Already present on Windows |
| REDbridge | 0.8.0 (0.7.0 or later works for M1) | Reads and writes game files | See [REDbridge's setup guide](https://edgemodders.github.io/REDbridge/dev-setup.html) |

## 2. Repository and GitHub

```powershell
git clone https://github.com/Edgemodders/EDGEmat.git
cd EDGEmat
git config user.name  "CyberbuildsAI"
git config user.email "340969962+CyberbuildsAI@users.noreply.github.com"
```

## 3. Game access for spec checks

M0 checks the [behavior spec](design/behavior.html) against the game through REDcode's MCP server, `redcode-mcp`, which runs REDbridge. Nothing is installed into EDGEmat itself. Set up on the dev PC on 2026-10-14:

| Tool | Version used | Notes |
|---|---|---|
| REDcode checkout | commit `31dd076` | `redcode-mcp` 0.1.0, already built at `packages\redcode-mcp\dist\server.cjs` |
| REDbridge | `bridge_info` reports 0.7.0, WolvenKit 9.1.0 | The built exe is older than its source (0.7.2). Nothing used here needs 0.7.1 or later |
| Claude Code | 2.1.299 | The MCP client |
| Node.js | 24.11.1 | Runs the server |
| Python | 3.13.9, with Pillow 11.3.0 and numpy 2.4.3 already present | Mask analysis in the scratchpad |

```powershell
# In the REDcode checkout, only if dist\server.cjs is missing:
npm install
npm run mcp:build

# Register it for Claude Code sessions in this repo (local scope, not committed):
claude mcp add redcode -- node "E:\Modding\Cyberpunk 2077\REDcode\packages\redcode-mcp\dist\server.cjs"
claude mcp list   # redcode: ... - Connected
```

The server finds REDbridge and the game from REDcode's VS Code settings (`redcode.bridgePath`, `redcode.gamePath`), so no arguments are needed on a PC with REDcode set up. A session already running when the server is added cannot see its tools; it can still drive the server as a plain MCP client over stdio.

In-game tests use a WolvenKit project outside the repo, `E:\Modding\Cyberpunk 2077\Projects\EDGEmat_M0`. Game files and anything extracted from them stay there or in the session scratchpad, never in this repo.

## 4. Build, test and package

Installed with `npm install` at the repository root on 2026-10-16 (Node 24.11.1, npm 11.14.1):

| Package | Version | Used by |
|---|---|---|
| `vscode-jsonrpc` | 9.0.3 | The bridge client (copied from REDcode), bundled into the extension and the MCP server |
| `pngjs` | 7.0.0 | Thumbnails, pure JavaScript, bundled |
| `@modelcontextprotocol/sdk` | 1.32.1 | The MCP server, bundled |
| `zod` | 3.25.76 | The MCP server's tool schemas, bundled |
| `esbuild` | 0.28.2 | Bundling |
| `typescript` | 5.9.3 | Type checks |
| `@types/vscode` | 1.70.0 | The extension's API level (VS Code 1.70 or later) |
| `@vscode/vsce` | 4.0.0 | Packaging the VSIX |

```powershell
npm install
npm run typecheck          # both packages
npm run build              # extensions/edgemat/dist and packages/edgemat-mcp/dist
npm run smoke              # M1's test: builds the library from the game and checks its counts
npm run edgemat:package    # dist\edgemat-0.1.0.vsix
code --install-extension dist\edgemat-0.1.0.vsix
```

The smoke test finds the game and REDbridge from the VS Code settings (`edgemat.*`, then `redcode.*`), as the extension does, and writes the library to `%LOCALAPPDATA%\EDGEmat`. F5 in VS Code, with the repository open, runs the extension in a development host (`.vscode/launch.json`, "Run EDGEmat"); build first.

Register the MCP server with Claude Code (no options needed on a PC with REDcode set up). `--scope user` makes it available in every folder, the development host's too; without it, only in the folder where the command ran:

```powershell
claude mcp add --scope user edgemat -- node "E:\Modding\Cyberpunk 2077\EDGEmat\packages\edgemat-mcp\dist\server.cjs"
```

For `mat_generate`, the server reads the image service's key from its environment (it cannot read VS Code's secret storage). Add `-e` with your own key, for one or both services; remove and add again to change it (`claude mcp remove --scope user edgemat`). `mat_from_image` and `mat_apply` need no key.

```powershell
claude mcp add --scope user edgemat -e GEMINI_API_KEY=<your key> -e OPENAI_API_KEY=<your key> -- node "E:\Modding\Cyberpunk 2077\EDGEmat\packages\edgemat-mcp\dist\server.cjs"
```

### Releasing

From 0.3.0, the first preview (0.2.0 was never released). `.github/workflows/release.yml` is the same workflow as REDnode's (from 2026-10-22; before that, `publish.yml` ran on a pushed `v*` tag). In the Actions tab, **Release** › **Run workflow** builds the files and keeps them as the run's artifact `EDGEmat-build`, to install and test before a release. With **Make a release** ticked, it also releases. It checks that both packages have one version (`tools/version.mjs --check`), stops when the run is not on `main` or the version's tag exists, takes the release notes from the version's section of [`docs/changelog.md`](changelog.html) (and stops when there is none), typechecks, builds, packages the VSIX for Windows x64, tags the commit `v<version>` and makes the GitHub release with the VSIX, the MCP server as `edgemat-mcp-<version>.cjs`, the Nexus Mods zip `EDGEmat-<version>-nexus.zip` ([`nexus/README.md`](https://github.com/Edgemodders/EDGEmat/blob/main/nexus/README.md)) and `THIRD-PARTY-NOTICES.txt`. Before the GitHub release it publishes the VSIX to the VS Code Marketplace and Open VSX, as REDcode's workflow does, with the Edgemodders organisation secrets `VSCE_PAT` and `OVSX_PAT`; each step runs even when another failed, and the run fails if any did. The extension's `"preview": true` gives it the Marketplace's Preview badge. The extension carries the MCP server (`dist/mcp/edgemat-mcp.cjs`, built by its `esbuild.mjs` from `packages/edgemat-mcp`). When all of that succeeded, the `npm` job publishes `@edgemodders/edgemat-mcp` with provenance (`NPM_TOKEN`, as REDcode's `redcode-mcp`), with the license and the notices copied beside it.

**The changelog** is `docs/changelog.md`, kept the same way as REDnode's: each change a modder would notice gets a line under **Unreleased** in its group (**New**, **Changed**, **Fixed**, **Other**), in the same commit as the change. `tools/release/notes.mjs` turns it into the GitHub notes, plain lines for Nexus (`--nexus`), and the extension's `CHANGELOG.md` (`--extension`, run by `vscode:prepublish` when the VSIX is packaged; that file is generated, not committed).

1. Make sure every test since the last release passed ([Tests](testing.html)). Untested or failed means no release.
2. In `docs/changelog.md`, rename **Unreleased** to `## <version> (<date>)` and start a new empty **Unreleased** above it. Check the notes with `npm run release:notes -- <version>`.
3. Raise the version: `node tools/version.mjs <version>` sets it in both packages and the lock file (`node tools/version.mjs` alone shows where each stands).
4. Update `nexus/description.bbcode` for what changed (`npm run nexus:status` first: if the live description changed on Nexus, `npm run nexus:pull` and merge). Commit and push to `main`.
5. On GitHub: **Actions** › **Release** (left) › **Run workflow** (right) › branch `main`, tick **Make a release** and **Update Nexus Mods**, press the green **Run workflow** (or `gh workflow run release.yml --ref main -f release=true -f nexus=true` from a terminal; `npm run release` leaves Nexus out). Watch the run. Without the ticks, the same button gives a test build: the run's page has the files under **Artifacts**. Then install the release in a normal VS Code (not the development host): from the Extensions view, which takes it from the Marketplace, or the release's VSIX with `code --install-extension`. Check that its version is the new one, and that the Nexus page shows it.
6. Update the user manual in EDGEweb (`docs/wiki/edgemat/`) for what changed.

**Nexus Mods** (page 35422) is kept through Nexus's v3 API, as REDnode's is: `tools/nexus/` (copied from REDnode; keep the copies the same), `nexus/nexus.json`, the organisation secret `NEXUS_KEY` in CI and a DPAPI key file on the dev PC. With **Update Nexus Mods** the workflow checks the page before building (it stops if the description changed on Nexus since the last pull) and, after the GitHub release, uploads the Nexus zip as the main file's new version with Mod Manager Download off (an extension, not a game mod), archives the old one, adds the changelog and pushes the description. Details in [`nexus/README.md`](https://github.com/Edgemodders/EDGEmat/blob/main/nexus/README.md).

**Licenses.** The extension and the MCP server bundle npm packages (MIT, ISC, BSD-3-Clause). `tools/release/notices.mjs` lists them from the builds' source maps with their license texts: into the VSIX (`vscode:prepublish`), and into `dist/THIRD-PARTY-NOTICES.txt` for the release and the Nexus zip. Generated, never committed.

```powershell
npm run release:notes                  # the GitHub notes of the extension's version
npm run release:notes -- 0.3.0 --nexus # plain lines for Nexus's changelog field
```

## 5. Docs site and brand images

The site at https://edgemodders.github.io/EDGEmat/ is built by `.github/workflows/pages.yml` on every push to `main`. **Settings > Pages > Source** must be **GitHub Actions**.

```powershell
.\tools\brand\render.ps1   # banner, social preview, icon, badges
```

| Output | Used by |
|---|---|
| `docs/assets/brand/banner.png` | README header |
| `docs/assets/brand/social.png` | Upload by hand in Settings > General > Social preview |
| `docs/assets/brand/nexus.png` | The Nexus page's primary image, 1280 x 640. Made by hand, not rendered |
| `docs/assets/brand/icon.png` | Site icon, and the extension's Marketplace icon later |
| `tools/brand/activity.svg` | The activity bar icon. Drawn by hand, not rendered: 24 × 24, stroke 2, `currentColor`, the family's HUD brackets as in REDcode and EDGEdeck. M1 copies it to `extensions/edgemat/images/activity.svg` |
| `docs/assets/brand/badges/*.svg` | README badges. Edit the list in `tools/brand/badges.py` |
