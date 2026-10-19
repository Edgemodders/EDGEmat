# Progress <span class="y">log</span>

What has been done on EDGEmat, what was decided and why, and what is open. Newest first within each section. Read this to catch up without asking. The [design](design.html) and the [behavior spec](design/behavior.html) hold the full detail.

Last updated 2026-10-19.

## At a glance

| | |
|---|---|
| Phase | **M2 Read**: every hand test passed (Library, surface page, setup editor, Find); M2's own test and the CLI install test remain |
| Extension | 0.1.0 plus M2 so far: the EDGEmat icon in the activity bar; a Library of every surface and microblend in your game, with thumbnails and search; a page for each surface with its colors as named swatches |
| MCP server | `mat_library`, `mat_templates`, `mat_microblends`, `mat_colors`, `mat_describe`, `mat_find` |
| Spec | Behavior spec draft 0.2, checked against the game and in-game tests, agreed 2026-10-16 |
| Next up | Your hand test of Find; then M2's own test, the 0.2.0 preview release on GitHub, and M3 Edit |
| Roadmap | M3 Edit, **M4 Make** (materials for new meshes: from a model's textures, **Generate** from words or a photo, game materials on new meshes, the Looks editor), M5 Preview, M6 Beyond mlsetup, M7 Ship. Revised 2026-10-19 so EDGEfab gets materials sooner |

## Your to-dos

| To-do | Why | Since |
|---|---|---|
| Report back when the other sessions finish the requests below | EDGEmat's design and EDGEfab's brief get updated to the shapes that shipped; then the EDGEfab session starts | 2026-10-16 |
| Test the packaged VSIX from the CLI: `code --install-extension dist\edgemat-<version>.vsix` ([Tests](testing.html#cli-install-of-the-vsix)) | F5 runs the source; only the CLI install tests what a user gets. Planned for your next session at the PC | 2026-10-16 |
| Record Neurolinked's reply, if one comes | Design, "Prior art" | 2026-10-16 |
| Try RED Hot Tools on the dev PC | Tells us whether hot-loading archives works today (design, "Hot-loading archives"), and tests REDcode's Pack and Try hot path. Planned for your next session at the PC | 2026-10-16 |

## Waiting on other repos

| Request | What | Status |
|---|---|---|
| [REDbridge #4](https://github.com/Edgemodders/REDbridge/issues/4) | `tweakdb.records`: from an item ID to its appearance | **Shipped** in REDbridge 0.8.0, 2026-10-15. Used in M0 to find the sneakers' items |
| [REDcode #6](https://github.com/Edgemodders/REDcode/issues/6) | REDcode's mesh viewer asks EDGEmat for rendered materials; appearance switching; a GLB's own textures | **Shipped** in REDcode 0.10.0, 2026-10-16. Appearance switching and GLB textures hand-tested. The `renderMaterials` hook waits for EDGEmat to provide it (M5) |
| [REDcode #7](https://github.com/Edgemodders/REDcode/issues/7) | "Pack and try" (hot load) and "Edit in Blender" | **Shipped** in REDcode 0.10.0, 2026-10-16, hand-tested. Without Red Hot Tools, Pack and Try falls back to Pack and Install; the hot path is untested |
| [REDbridge #5](https://github.com/Edgemodders/REDbridge/issues/5) | Mesh import for a new asset, from a GLB | **Shipped** in REDbridge 0.9.0, 2026-10-16. A GLB is imported over a template mesh (WolvenKit cannot make one from a GLB alone). The result names the GLB's materials per submesh but does not apply them: assigning materials is EDGEmat's Looks editor (M4). Not yet loaded in the game |
| [EDGEbuilder #1](https://github.com/Edgemodders/EDGEbuilder/issues/1) | Index the user's mod archives, so custom objects can be placed | Open. EDGEbuilder's session is on it |
| [REDnode #12](https://github.com/Edgemodders/REDnode/issues/12) | Hot-load archives into the running game | Open. After REDnode's current task |

## Log

### 2026-10-19

| What | Detail |
|---|---|
| Find hand test passed | All 10 checks, through F5. The test steps now say where Find is: a header below the Library, and the Library's magnifier is Search Library, not Find |
| **Roadmap revised** | A new **M4 Make** ahead of the preview: materials for new meshes, which EDGEfab needs for the clothes and objects it makes. The preview moves to M5, Beyond mlsetup to M6, Ship to M7. Make holds materials from a model's textures, **Generate a material**, game materials on a new mesh and the Looks editor ([design, "Phases"](design.html#phases)) |
| Generate a material designed | Your idea: a non-artist types "brown leather" and gets a material. An AI image service (Nano Banana, Nano Banana Pro, GPT Image), opt-in with your own key, or your own photo. EDGEmat makes it seamless, derives bumps and shine, and writes a textured `.mi`. One general prompt prefix plus your words; presets only if tests show the need. The UI follows EDGEwave's generation dialog, with a tiled preview to show seams ([design](design.html#generate-a-material)) |
| Why not a layer | A layer of a game garment has no color texture, only a surface and a color preset, so recoloring a game garment stays a surface plus a color (no AI needed). Generated images go into textured `.mi` materials |
| EDGEfab's brief extended | Clothing fitted to the body: the game's body types, the body dummies and refitters in WolvenKit's Blender add-on, and Blender MCP servers so an assistant can model in Blender. EDGEfab gets materials from EDGEmat: generated, or picked from the game ([EDGEfab design](https://edgemodders.github.io/EDGEfab/design.html)) |
| Network rule changed | No network calls except to an AI service you chose, only when you press Generate, with your own key. Still no telemetry |

### 2026-10-18

| What | Detail |
|---|---|
| Release plan | A **0.2.0 preview** on GitHub at the end of M2: the VSIX and the MCP server as one file, marked pre-release. No Marketplace, Open VSX or npm until M7, so nobody installs a read-only build from a store expecting editing. The release workflow makes it from a `v*` tag |
| Test build sent | `edgemat-0.1.0-m2-preview.vsix` (everything through M2), for your laptop. It shows as 0.1.0; 0.2.0 installs over it |
| EDGEchat | Its design plans an `edgemat` server. `edgemat-mcp` now treats an empty setting as unset, so EDGEchat needs no wrapper script for it. It needs the npm package (M7, or earlier if you want) |

### 2026-10-17

| What | Detail |
|---|---|
| Find built | A new **Find** view under the Library: type an item's in-game name ("punk jeans") or part of a mesh path. An item opens into its looks per body, then meshes, then materials; clicking a multilayered material opens its setup with the exact mask set its material names, no guessing. On the jeans it shows the feminine body wearing other pants (`l1_066`) than the masculine (`l1_062`). Assistants get the same through MCP `mat_find` |
| Setup editor hand test passed | All 13 checks, including a setup opened from REDcode's Game Assets. Buttons got a clearer outline along the way, and the test steps now say where each control is |
| Setup editor built (read-only) | Open any setup: from the game by name, a file, a project, a mod archive, or REDcode's Game Assets. Each layer in plain words, and a color map of where each layer goes on the garment's texture; click a spot to find its layer, and the selected layer's area lights up. It flags what looks wrong: on our M0 test setup it points at layer 4's unknown color ("shows white") and layer 9's all-None presets. Assistants get the same through MCP `mat_describe` |
| Surface page hand test passed | Your run through F5: all 13 checks, and the Library view checks again (including the new log line naming the bridge) |
| Surface page built | Click a surface in the Library: a larger image tinted with the color you pick, every color as a swatch with a plain name, a filter ("red") and "closest to" a typed or picked color, roughness, metal and bumps in plain words, the textures, raw values one click away. Microblends get a page too. One tab is reused until you press Keep open. Assistants get the same through MCP `mat_colors` ("the closest dark red on this leather") |
| Open question found | Preset colors may be linear rather than screen colors; if so, swatches should be brighter. Checked in M5 (design, "Open questions") |
| EDGEfab's social preview | Uploaded by you |
| Three requests shipped | REDcode #6 and #7 in REDcode 0.10.0, REDbridge #5 in REDbridge 0.9.0 (latest is 0.10.0). REDnode #12 and EDGEbuilder #1 still open. EDGEmat's design and EDGEfab's brief get updated to the shipped shapes once you report all done |

### 2026-10-16

| What | Detail |
|---|---|
| Tests page | [Tests](testing.html): every test so far, with steps to rerun it, expected results and the test project's contents. The log now names REDcode's bridge when EDGEmat uses it |
| **M1 done** | Smoke test passes, and your hand test through F5 passed: the icon, the Library with thumbnails and hover cards, search, rebuild |
| Surface page planned for M2 | Clicking a surface opens a read-only page: big image, every color as a named swatch, presets in plain words, texture paths. Game surfaces are never edited in place, because every item using one would change. "Use on this layer" (M3) and "Make a custom copy" (M6) come later |
| CLI install test noted | In M7's test and in [Your to-dos](#your-to-dos) |
| M1 built | The extension, the library built from the game (386 surfaces, 131 microblends, 155,099 color presets, 343 thumbnails, about 22 s, 4 s with thumbnails cached), the MCP server, `npm run smoke`. Thumbnails: near-grey textures shown grey to avoid speckle; flat ones shown as relief from the normal map |
| EDGEfab created | The EDGE asset maker: "make it a game thing" for new items and objects. You created the repo; this session scaffolded it with branding and its cube activity icon. Its own session starts after the requests above |
| Custom-asset goals added | Import a textured model (GLB first), view it with its looks, the whole asset workflow, hot-loading archives. Requests filed to REDcode, REDbridge, REDnode and EDGEbuilder |
| **M0 done** | You agreed the behavior spec draft 0.2 |
| Neurolinked contacted | You sent the memo by Discord DM |

### 2026-10-15

| What | Detail |
|---|---|
| In-game tests done | On the "Sunny Ammo synthetic high-tops". See [what we learned](#what-we-learned-about-the-game) |
| The override mystery solved | The first round showed no change. After ruling out the appearance, archive mounting, hashes, load order and `modlist.txt`, WolvenKit's own warning named the cause: a replaced game `.mlsetup` needs the Material Texture Override mod. REDdeck's `modlist.txt` bug, found along the way, was fixed by its session |
| Preview split agreed | REDcode shows meshes; EDGEmat renders materials and hands them to REDcode's viewer. A shared viewer component is for later |
| Runtime materials | Changing materials in the running game through REDagent is a key long-term goal (design, "Later ideas") |
| Game folder and bridge | EDGEmat takes the game folder and the running bridge from REDcode, so a REDcode user configures nothing |
| Activity bar and Open any file | EDGEmat gets its own icon. Opening a file from anywhere, then Save to Project, is a supported workflow |

### 2026-10-14

| What | Detail |
|---|---|
| Spec checked against the game | Through REDcode's MCP server: the chain from an item to its layers, every `.mlsetup` field, templates, masks. Rows marked confirmed or corrected |
| Test set chosen | The Arasaka samurai jacket, the s1_055 sneakers, the l1_062 jeans |
| Spec draft 0.1 | Written in a cloud session from a study of MlsetupBuilder's behavior (never its code) |
| Design 0.2 agreed | A standalone extension, `.mlsetup` first, an MCP server with every feature, the library built from your game and never shipped |
| Scaffold | README, license, docs site, brand |

## Decisions

| Decision | Why | Date |
|---|---|---|
| Game surfaces are read-only; custom colors come from a custom copy | A surface is shared by every item that uses it | 2026-10-16 |
| The bridge client is copied from REDcode for now | A shared npm package for the EDGE tools stays the goal | 2026-10-16 |
| The library is built from the user's game, never shipped | The EDGE repos never ship data extracted from the game; it also stays current after patches | 2026-10-14 |
| REDcode shows meshes, EDGEmat renders materials | No second mesh viewer; loose coupling through an API | 2026-10-15 |
| EDGEfab owns new assets; EDGEmat owns materials and looks | Keeps each tool to one job | 2026-10-16 |
| MlsetupBuilder is studied, never copied | It is GPL-3.0; EDGEmat is MIT | 2026-10-14 |
| M4 Make comes before the preview | EDGEfab needs materials for new meshes; a textured `.mi` is seen without the layered bake | 2026-10-19 |
| Generated images become textured `.mi` materials, not layers | A layer has no color texture | 2026-10-19 |
| AI generation follows EDGEwave's idiom; keys in VS Code's secret storage, environment variables for MCP | One look across the EDGE tools; the MCP server cannot read VS Code's secrets | 2026-10-19 |
| A 0.2.0 preview on GitHub only, at the end of M2 | Something real to show; the stores wait for editing (M7) | 2026-10-18 |

Still open: how a recolor is saved, in place (needs MTO for every player) or at a new path (needs nothing extra; how most recolor mods ship). Leaning new path by default; settled in M3. Other open questions are in the [design](design.html#open-questions).

## What we learned about the game

The facts that shape the editor. Each is in the [behavior spec](design/behavior.html) with its evidence.

| Finding | What it means for EDGEmat |
|---|---|
| A replaced game `.mlsetup` only shows with the Material Texture Override mod | Saving in place must check for MTO; a new path avoids it |
| Mask *i* drives layer *i* | Clicking a mask region selects the right layer |
| A color name the surface does not have renders white | EDGEmat only offers the surface's own colors, and warns on unknown ones |
| All preset names `None` hides the layer | A way to switch a layer off |
| `ratio` changes how the microblend maps onto the item | Shown as a setting with a plain description |
| Level presets are pairs: out = scale × in + bias | Shown in plain words, raw values one click away |
| The running game shows a setup's `ratio` to scripts, not its layers | Runtime recoloring needs another route than the script API |
| An item reaches its layers through TweakDB, the `.ent`, the `.app`, the mesh appearance and its materials | M2's "find an item's materials" follows this chain |

## Try it

| What | How |
|---|---|
| Run the extension from source | Open this repo in VS Code, `npm run build`, then F5 ("Run EDGEmat") |
| Check the library against the game | `npm run smoke` |
| Use the MCP tools from Claude Code | [Dev setup](dev-setup.html), section 4 |
