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

Register the MCP server with Claude Code (no options needed on a PC with REDcode set up):

```powershell
claude mcp add edgemat -- node "E:\Modding\Cyberpunk 2077\EDGEmat\packages\edgemat-mcp\dist\server.cjs"
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
| `docs/assets/brand/icon.png` | Site icon, and the extension's Marketplace icon later |
| `tools/brand/activity.svg` | The activity bar icon. Drawn by hand, not rendered: 24 × 24, stroke 2, `currentColor`, the family's HUD brackets as in REDcode and REDdeck. M1 copies it to `extensions/edgemat/images/activity.svg` |
| `docs/assets/brand/badges/*.svg` | README badges. Edit the list in `tools/brand/badges.py` |
