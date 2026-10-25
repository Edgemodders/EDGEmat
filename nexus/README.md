# EDGEmat on Nexus Mods

The source of EDGEmat's Nexus Mods page lives here, so updates are edits in the repo, not in Nexus's text box. The same way as REDnode's and REDcode's.

**Live:** https://www.nexusmods.com/cyberpunk2077/mods/35422 (posted by the owner at 0.3.0). Since 2026-10-25 the page is kept through Nexus's v3 API, as REDnode's and REDagent's are: `tools/nexus/` (copied from REDnode; keep the copies the same) and `nexus.json` (the page, the main file, and how a release uploads: Mod Manager Download off, the old version archived). The release workflow's **Update Nexus Mods** box uploads the Nexus zip, adds the changelog and pushes `description.bbcode`.

| File | What it is |
|---|---|
| `description.bbcode` | The page's description, in Nexus's BBCode. Paste the whole file into the description field (the editor's source mode, or switch to BBCode) |
| `README.md` | This page: the other fields of the Nexus form, the download, the screenshots, and how to update |
| `nexus.json` | The page (35422), its internal mod id and main file, how a release uploads, and the hash of the description last pulled |
| `images/` | The screenshots the description shows, once they exist |

## The Nexus form

| Field | Value |
|---|---|
| Mod name | EDGEmat |
| Version | EDGEmat's version, from `extensions/edgemat/package.json` (for example 0.3.0) |
| Category | Modders Resources and Tutorials (check the list for Cyberpunk 2077 when creating the page) |
| Brief overview | A material editor for Cyberpunk 2077 clothing, in VS Code: recolor a garment's layers, or make a new material from your words, and save it into your mod. Or ask Claude. A preview, and a VS Code extension, not a game mod. (255 characters at most; this is 220) |
| Author | Edgemodders |
| Language | English |
| Primary image | `docs/assets/brand/nexus.png` (1280 x 640, made by the owner). The banner (`docs/assets/brand/banner.png`) is already at the top of the description |
| Requirements | None on Nexus. Off-site: VS Code 1.70 or later (or VSCodium, or EDGEkit); REDbridge 0.8.0 or later and the .NET 10 runtime, easiest through REDcode (linked to GitHub until REDcode has its new Nexus page). REDcode to pack the project, and for View in 3D. Optional: a Google Gemini or OpenAI key, for materials from words |
| Permissions | MIT: open source, free to modify and redistribute with the license notice. Bundled packages keep their licenses (`THIRD-PARTY-NOTICES.txt`). REDbridge, a separate download, is GPL-3.0 |
| Tags | Modders resource, utility, tools |

## Screenshots

The description has eight placeholders, cyan italic lines starting `» Screenshot N:` that say what each picture should show. For each:

1. Save the picture as WebP or PNG in `images/`, named by number and subject (for example `01-overview.webp`), and push.
2. Replace its placeholder line with `[img]https://raw.githubusercontent.com/Edgemodders/EDGEmat/main/nexus/images/<name>[/img]` and a one-line caption under it.
3. Optionally upload it to the page's Images tab too, so it shows in the gallery.

Linking from this repo's `main` branch, as REDcode does, keeps the page independent of any one Nexus page. Before publishing a picture, check it for personal data: Windows user names in paths, account names, keys.

| # | Shows |
|---|---|
| 1 | EDGEmat in VS Code: the Library and Find in the sidebar, the setup editor on a garment |
| 2 | Find after "sunny ammo", with the record id, open down to the mesh and its materials |
| 3 | The setup editor recoloring a layer: swatches filtered by "blue", the layer blue on the map, Save to Project |
| 4 | The New Material page: the words, two takes, the chosen one tiled 3 x 3 |
| 5 | In the game: V in the worn leather slim-fits (the leather tutorial's front shot) |
| 6 | REDcode's 3D view of the sneakers with their colors |
| 7 | Claude Code making the snakeskin material through EDGEmat |
| 8 | In the game: V in the snakeskin slim-fits (the snakeskin tutorial's front shot) |

## The download

One main file: `EDGEmat-<version>-nexus.zip`, with:

| File | What it is |
|---|---|
| `edgemat-<version>.vsix` | The extension, the same file as on the GitHub release |
| `edgemat-mcp-<version>.cjs` | The MCP server for AI assistants, one file for Node.js 20 or later |
| `README.txt` | How to install both: Install from VSIX in VS Code, or `code --install-extension`; `claude mcp add` for the server |
| `LICENSE.txt`, `THIRD-PARTY-NOTICES.txt` | EDGEmat's license, and the bundled packages' (made by `tools/release/notices.mjs` from the builds' source maps) |

**When uploading, turn off the Mod Manager Download button** for this file (Nexus's file form has the option). It is a VS Code extension: Vortex would deploy it into the game folder, where it does nothing.

File description on Nexus:

> EDGEmat &lt;version&gt;, the VS Code extension and its MCP server. A preview: recolors and makes materials. Extract, then in VS Code: Extensions view, ..., Install from VSIX. Not a game mod: no Vortex.

### Building it

The release workflow (`.github/workflows/release.yml`) builds it with every release and attaches it to the GitHub release, beside the `.vsix`, the MCP server and the notices. A release stays as in `docs/dev-setup.md`, "Releasing". Download the zip from the release and upload it to Nexus.

By hand, after `npm run edgemat:package` and `npm run mcp:build`: `npm run release:nexus` writes `dist/EDGEmat-<version>-nexus.zip`.

## Updating the page

1. Edit `description.bbcode` here, check it with `node tools/check-bbcode.mjs nexus/description.bbcode`, commit, push.
2. With a release: tick **Update Nexus Mods** beside **Make a release**. After the GitHub release the workflow uploads `EDGEmat-<version>-nexus.zip` as the main file's new version (the old one archived, Mod Manager Download off), adds the version's changelog (`npm run release:notes -- --nexus`) and pushes `description.bbcode` when it differs from the live one.
3. The push never overwrites an edit made on Nexus: if the live description is neither the one last pulled nor the one the previous release pushed, the run stops before it builds. Then `npm run nexus:pull`, merge with `git diff`, commit, and run again. `npm run nexus:status` shows the page's version, files and whether its description matches.
4. Screenshots uploaded on Nexus show in the description as `staticdelivery.nexusmods.com` links; keep them when editing.

The key: in CI the organisation secret `NEXUS_KEY`; on the dev PC the DPAPI file `%APPDATA%\Edgemodders\nexus-key.txt` (`tools/nexus/api.mjs`). Never print it or pass it on a command line.

Keep these in step with the extension (its README and `docs/changelog.md`):

| Where in the description | Update when |
|---|---|
| The STATUS box near the top | The version, or the preview flag goes (M7) |
| "Highlights" | A release adds something a modder would notice |
| "Requirements" | The VS Code minimum (`engines.vscode`) or the REDbridge minimum changes |
| The roadmap list | Each phase; the next one is marked in cyan (`[color=#19f3ff]Next:[/color]`) |
| "Can I recolor clothes with it now?" | Free colors arrive (M6) |

## BBCode used

Nexus's BBCode has no tables or Markdown, so the page uses only: `[b]`, `[i]`, `[size=2..5]`, `[color=#hex]`, `[center]`, `[quote]`, `[line]`, `[list]` with `[*]`, `[url=...]` and `[img]`. Version numbers are written `x.y.z`, since Nexus may drop text in angle brackets. The banner and the screenshots are linked from this repo's `main` branch on GitHub, so they must stay at their paths. The colours are the house palette: yellow `#fcee0a` for headings, cyan `#19f3ff` for highlights.
