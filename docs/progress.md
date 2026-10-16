# Progress <span class="y">log</span>

What has been done on EDGEmat, what was decided and why, and what is open. Newest first within each section. Read this to catch up without asking. The [design](design.html) and the [behavior spec](design/behavior.html) hold the full detail.

Last updated 2026-10-16.

## At a glance

| | |
|---|---|
| Phase | **M1 Library done.** Next: **M2 Read** |
| Extension | 0.1.0: the EDGEmat icon in the activity bar, and a Library of every surface and microblend in your game, with thumbnails and search |
| MCP server | `mat_library`, `mat_templates`, `mat_microblends` |
| Spec | Behavior spec draft 0.2, checked against the game and in-game tests, agreed 2026-10-16 |
| Next up | M2: the surface page (click a surface in the Library), the read-only setup editor, finding an item's materials |

## Your to-dos

| To-do | Why | Since |
|---|---|---|
| Report back when the other sessions finish the requests below | EDGEmat's design and EDGEfab's brief get updated to the shapes that shipped; then the EDGEfab session starts | 2026-10-16 |
| Test the packaged VSIX from the CLI: `code --install-extension dist\edgemat-<version>.vsix` | F5 runs the source; only the CLI install tests what a user gets. At the latest in M6's test | 2026-10-16 |
| Upload EDGEfab's `docs/assets/brand/social.png` in EDGEfab's Settings > General > Social preview | GitHub has no API for it | 2026-10-16 |
| Record Neurolinked's reply, if one comes | Design, "Prior art" | 2026-10-16 |
| Optional: try RED Hot Tools on the dev PC | Tells us whether hot-loading archives works today (design, "Hot-loading archives") | 2026-10-16 |

## Waiting on other repos

| Request | What | Status |
|---|---|---|
| [REDbridge #4](https://github.com/Edgemodders/REDbridge/issues/4) | `tweakdb.records`: from an item ID to its appearance | **Shipped** in REDbridge 0.8.0, 2026-10-15. Used in M0 to find the sneakers' items |
| [REDcode #6](https://github.com/Edgemodders/REDcode/issues/6) | REDcode's mesh viewer asks EDGEmat for rendered materials; appearance switching; a GLB's own textures | Open. REDcode's session is on it |
| [REDcode #7](https://github.com/Edgemodders/REDcode/issues/7) | "Pack and try" (hot load) and "Edit in Blender" | Open. REDcode's session is on it |
| [REDbridge #5](https://github.com/Edgemodders/REDbridge/issues/5) | Mesh import for a new asset, from a GLB | Open. REDcode's session is on it |
| [EDGEbuilder #1](https://github.com/Edgemodders/EDGEbuilder/issues/1) | Index the user's mod archives, so custom objects can be placed | Open. EDGEbuilder's session is on it |
| [REDnode #12](https://github.com/Edgemodders/REDnode/issues/12) | Hot-load archives into the running game | Open. After REDnode's current task |

## Log

### 2026-10-16

| What | Detail |
|---|---|
| **M1 done** | Smoke test passes, and your hand test through F5 passed: the icon, the Library with thumbnails and hover cards, search, rebuild |
| Surface page planned for M2 | Clicking a surface opens a read-only page: big image, every color as a named swatch, presets in plain words, texture paths. Game surfaces are never edited in place, because every item using one would change. "Use on this layer" (M3) and "Make a custom copy" (M5) come later |
| CLI install test noted | In M6's test and in [Your to-dos](#your-to-dos) |
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
