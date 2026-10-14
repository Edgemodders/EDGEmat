# Dev setup

What a Windows PC needs to work on EDGEmat. The shared tools are the same as in [REDcode's setup guide](https://edgemodders.github.io/REDcode/dev-setup.html). There is no code yet: M0 decides the form of the tool, and this page then gains its build steps with exact versions.

## 1. Base tools

| Tool | Version used | Why | Install |
|---|---|---|---|
| Git for Windows | as REDcode | Source control | `winget install --id Git.Git -e` |
| nvm for Windows and Node.js | as REDcode (Node 24) | The tool will be TypeScript, as the rest of the ecosystem | `winget install --id CoreyButler.NVMforWindows -e`, then `nvm install 24` and `nvm use 24` |
| Python | 3.10 or later | Brand tooling | |
| Chrome or Edge | any | Renders the brand images | Already present on Windows |
| REDbridge | 0.7.0 or later | Reads and writes game files | See [REDbridge's setup guide](https://edgemodders.github.io/REDbridge/dev-setup.html) |

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

## 4. Docs site and brand images

The site at https://edgemodders.github.io/EDGEmat/ is built by `.github/workflows/pages.yml` on every push to `main`. **Settings > Pages > Source** must be **GitHub Actions**.

```powershell
.\tools\brand\render.ps1   # banner, social preview, icon, badges
```

| Output | Used by |
|---|---|
| `docs/assets/brand/banner.png` | README header |
| `docs/assets/brand/social.png` | Upload by hand in Settings > General > Social preview |
| `docs/assets/brand/icon.png` | Site icon, and the tool's icon later |
| `docs/assets/brand/badges/*.svg` | README badges. Edit the list in `tools/brand/badges.py` |
