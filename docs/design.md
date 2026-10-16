# EDGE<span class="y">mat</span> design

EDGEmat is the EDGEmodders material editor for Cyberpunk 2077: a VS Code extension and an MCP server. A modder picks a garment, clicks a layer, chooses a color and sees it on the model. Or they skip the UI and tell REDagent or Claude "make this jacket red".

**Status: draft 0.2.** Agreed with the user on 2026-10-14: a standalone extension in the EDGE family, `.mlsetup` editing first, an MCP server beside the UI, and MlsetupBuilder studied for behavior, never copied. Next: M0.

## Mission

EDGE brings modding to everyone, especially non-coders: easy, fun and fast. For EDGEmat this decides every UI question:

| Rule | In practice |
|---|---|
| The first result in seconds | Open an item, click a layer, pick a color, see it on the model. No file formats to learn first |
| Plain words first, details one click away | "Leather, dark red, 41% of the jacket" before `colorScale`, `mltemplate` and level ranges. Every raw value stays reachable for experienced modders |
| Everything the UI does, an assistant can do | Each feature ships in the UI and in the MCP server in the same phase |
| The best editor even with AI switched off | The MCP server does nothing until an assistant connects. No network calls, no telemetry |

## What EDGEmat edits

The file roles are from community knowledge (WolvenKit, the modding wiki, MlsetupBuilder) and are **unverified** here. M0 checks each one against real files through REDbridge.

| File | Class | What it is |
|---|---|---|
| `.mlsetup` | `Multilayer_Setup` | A multilayered material's layers. Each has a `.mltemplate`, a color preset, tiling, offsets, opacity, levels for normal, roughness and metalness, and a microblend (a small detail texture with its own tiling and contrast) |
| `.mltemplate` | `Multilayer_LayerTemplate` | A surface (leather, chrome, denim): its textures and its list of named color and level presets |
| `.mlmask` | `Multilayer_Mask` | One mask per layer: where on the mesh that layer shows |
| `.mesh` | `CMesh` | Material entries, local or external, and the appearances that pick a material per submesh. A multilayered material points at an `.mlsetup` and an `.mlmask` |
| `.mi` | `CMaterialInstance` | A `baseMaterial` (a `.mt` or another `.mi`) and the parameters it overrides |
| `.mt` | `CMaterialTemplate` | A shader and its parameters with defaults. Read, rarely edited |

Two facts that matter most, both **unverified**:

- **A layer's color is a preset name from its template, not a free RGB value.** So "make it red" means the nearest red among that template's presets, or a different template with a better red. Free colors would need a custom `.mltemplate`, which is an M5 question.
- **An item reaches its materials through a chain:** item, then appearance (`.app`, `.ent`), then mesh, then material, then `.mlsetup` and `.mlmask`. "This jacket" has to be resolved down that chain, so finding is a feature in its own right.

## Shape

| Part | What it is |
|---|---|
| `extensions/edgemat` | The VS Code extension, id `edgemodders.edgemat`, with its own activity bar container: the `.mlsetup` editor, the library and find views, the preview ([In VS Code](#in-vs-code)) |
| `extensions/edgemat/src/core` | Everything that is not UI: the bridge client, the material library, reading and editing setups, finding an item's materials. **No VS Code imports**, so the MCP server bundles the same code, as `redcode-mcp` does with REDcode's bridge client |
| `packages/edgemat-mcp` | The MCP server over stdio, for Claude Code, REDagent or any MCP client |
| REDbridge | Every game file read and write: archives, CR2W as JSON, textures to PNG, mesh export. EDGEmat asks for new methods as REDbridge issues labelled `request` |

| Relationship | How |
|---|---|
| REDbridge | A separate process over JSON-RPC on stdio, the boundary REDcode keeps. EDGEmat is MIT; REDbridge is GPL-3.0 |
| REDcode | Not required. Projects are WolvenKit projects, so EDGEmat writes into `source/archive` itself. When REDcode is installed, EDGEmat uses its API (`REDcodeApi` version 1, extension `edgemodders.redcode-cyberpunk`, REDcode 0.9.0) for the game folder, the bridge and the open project ([below](#the-game-folder-and-the-bridge)), and for packing (`pack()`), never importing its code |
| The UI and the MCP server together | Both edit files. The editor follows changes on disk, so a modder watching the editor sees the assistant's edit land |
| EDGEkit | Bundled as a built-in extension once released |

## In VS Code

EDGEmat has its own place in the activity bar, as REDcode and REDdeck do. It works with no folder open: a modder opens EDGEmat, not a workspace.

| Part | What it is | Phase |
|---|---|---|
| Activity bar | An EDGEmat view container. Its icon is [`tools/brand/activity.svg`](https://github.com/Edgemodders/EDGEmat/blob/main/tools/brand/activity.svg): the family's two HUD corner brackets around a material sheet over a second layer, 24 × 24, stroke 2, one color (`currentColor`). The theme paints it: in the REDnode HUD theme from REDcode, yellow when inactive and white when active. M1 copies it to `extensions/edgemat/images/activity.svg`, where REDcode and REDdeck keep theirs. The Marketplace icon is `docs/assets/brand/icon.png` (the "EM" mark) | M1 |
| Library view | Templates and microblends from the modder's game, with thumbnails, searched by plain words | M1 |
| Find view | Items, meshes and setups, from the game and the open project | M2 |
| Container title bar | Open File, Find, Rebuild Library | M2 |
| Setup editor | A custom editor tab for `.mlsetup`. Opens from EDGEmat's views, from REDcode's Project and Game Assets trees, from the Explorer, and from Open File | M2 |

### The game folder and the bridge

A modder with REDcode set up configures nothing in EDGEmat. EDGEmat finds the game folder in this order, and takes a folder only when it holds `bin\x64\Cyberpunk2077.exe` (REDcode's own test):

| # | Source | Notes |
|---|---|---|
| 1 | `edgemat.gamePath` | EDGEmat's own setting, empty by default, meaning "use the next source". It exists because VS Code lets an extension write only settings that an installed extension declares, so EDGEmat cannot save `redcode.gamePath` when REDcode is absent |
| 2 | REDcode's API, `gamePath()` | `REDcodeApi` version 1 from `extensions.getExtension("edgemodders.redcode-cyberpunk")` (REDcode 0.9.0, [REDcode's API doc](https://edgemodders.github.io/REDcode/api.html)). It returns `undefined` when REDcode's folder is not the game. It carries REDcode's game discovery and its Set Game Folder choice. REDcode stays optional: EDGEmat does not list it in `extensionDependencies` |
| 3 | `redcode.gamePath` | Read with `getConfiguration("redcode")`, for when REDcode is not active. Its default is the standard Steam folder, which on most machines is not the game until REDcode's first run fixes it; hence the check. EDGEmat watches this setting to follow a later Set Game Folder (the API has no change event for the game folder) |
| 4 | REDdeck's API, `gamePath()` | `extensions.getExtension("edgemodders.reddeck").exports`, API version 1, only when REDdeck is already running (REDcode does the same, to avoid racing a window reload) |
| 5 | EDGEmat's own discovery | Steam libraries, GOG, Epic, then default folders, as REDcode's `gameFinder.ts` does. That file has no VS Code imports; copy it or share it, the same choice as the bridge client ([open questions](#open-questions)) |
| 6 | Ask | A folder picker, saved to `edgemat.gamePath` |

**The bridge.** When REDcode is active, EDGEmat uses REDcode's running bridge (`bridge()`), so the machine runs one REDbridge with one archive index instead of two, provided its `bridge.info` version has the methods EDGEmat needs. Otherwise EDGEmat starts its own, found the same way as the game: `edgemat.bridgePath`, then `redcode.bridgePath`, then a copy bundled with EDGEmat or on `PATH`; `edgemat.dotnetRoot`, then `redcode.dotnetRoot`. M1 checks that sharing one bridge holds up while the library builds. The MCP server runs outside VS Code and always starts its own bridge, reading the same settings from the user's `settings.json`, as `redcode-mcp` does, after its own `--game` and `--bridge` arguments and environment variables.

**The project.** REDcode's `project()` and `onDidChangeProject` give the open WolvenKit project and its folders, the default target for Save to Project.

### Open any file, then save it into a project

A modder has a setup somewhere on their computer: downloaded from a mod page, inside someone's mod, or left from an old project. They want to look at it, perhaps change it, and use it in their own project. Supported in the UI and through MCP:

| Step | Behavior |
|---|---|
| Open | **Open File** takes a file anywhere on disk, not only in the open folder: a binary `.mlsetup`, WolvenKit JSON (`.mlsetup.json`), or a mod's `.archive`, from which the modder picks a setup (REDbridge `archive.openMod`, `archive.extractFromMod`) |
| Inspect | The setup editor shows it like any other setup: layers in plain words, swatches, masks. The original file is never written. Masks and the model need the mesh that uses the setup: EDGEmat takes it from the same mod archive, from the game file at the same game path, or lets the modder pick one. Without a mesh the layers still show, without a model |
| Edit | Allowed. Edits stay in the editor, unsaved, until the modder saves them into a project |
| Save to Project | An editor title button, in the style of REDcode's "Save JSON to Project". It asks for the project (the open WolvenKit project, a recent one, or a `.cpmodproj` to browse to) and writes the binary to `source\archive\<game path>`. The game path is suggested from the file's own path when it holds one (`...\source\archive\base\...`, or the entry in a mod archive), else from a game file with the same name, else the modder types it. If a file is already there, EDGEmat asks before replacing it |
| Assistant | `mat_describe` takes a file on disk or a setup inside a mod archive; `mat_edit` writes the result into a project the same way |

## The material library

MlsetupBuilder ships about 18 MB of JSON built from the game (every `.mltemplate` with its color presets, a model list, mask and normal lists) and about 500 thumbnails made from game textures. EDGEmat ships none of it: that is data extracted from the game, which the EDGE repos never commit.

Instead EDGEmat builds the library from the modder's own game through REDbridge on first run, and keeps it in a local cache: templates and their presets, microblends, masks, the models that use multilayered materials, and thumbnails rendered from the textures. It stays current with game patches and needs no WolvenKit.CLI. How long a full build takes is measured in M1.

## The MCP server

The tools are about intent ("find this jacket's materials", "the nearest red"), not file plumbing. Proposed names, settled in M2:

| Tool | Does |
|---|---|
| `mat_find` | Finds the materials for an item, appearance, mesh or path: each `.mlsetup` with the submeshes and appearances that use it |
| `mat_describe` | A setup's layers in plain words and in raw values: template, color name and RGB, how much of the surface each layer covers. The setup can be a game file, a project file, a file anywhere on disk, or one inside a mod's `.archive` |
| `mat_templates` | Searches the library: "leather", "worn chrome" |
| `mat_colors` | A template's color presets with RGB, and the nearest preset to a color given as a word or a value |
| `mat_edit` | Changes layers (template, color, tiling, levels, microblend) and writes the result into the project, copying the setup first from wherever it came from (the game, a file on disk, a mod archive) when needed. Returns what changed, so it can be undone |
| `mat_render` | Renders the preview to a PNG, so the assistant can look at its own work before saying it is done |

"Make this jacket red" is then: `mat_find`, `mat_describe` to pick the layers that make up the fabric, `mat_colors` for the nearest red in each, `mat_edit`, `mat_render`, and the user sees it. Packing and installing stay with REDcode's and REDdeck's tools.

## Prior art, and how EDGEmat uses it

| Project | License | What EDGEmat takes |
|---|---|---|
| [MlsetupBuilder](https://github.com/Neurolinked/MlsetupBuilder) by Neurolinked | GPL-3.0 | The behaviors a multilayered material editor needs, learned by studying it. No code, no data |
| [WolvenKit](https://github.com/WolvenKit/WolvenKit) | GPL-3.0 | The file formats and their JSON form, through REDbridge only |
| The [Cyberpunk 2077 modding wiki](https://wiki.redmodding.org/) | | How the material system works. Findings that are new go back to it |

**Spec, then build.** EDGEmat is not a port of MlsetupBuilder and must not read like one.

| Step | Who | Rule |
|---|---|---|
| 1. Spec | One session studies MlsetupBuilder (code, UI, videos) and the game files | Writes [`docs/design/behavior.md`](design/behavior.html) in its own words: features, file fields, workflows, edge cases. No code, no copied text, no copied data |
| 2. Check | A session on the dev PC, through REDbridge, without opening MlsetupBuilder's source | Every claim in the spec is checked against real game files and corrected where wrong. MlsetupBuilder is a reference, not the authority. Questions about what MlsetupBuilder does go back to the spec session |
| 3. Build | Other sessions, from the spec | Never open MlsetupBuilder's source. Questions go back to step 1 |
| GPL logic worth reusing | REDbridge | If a piece of MlsetupBuilder's logic is worth reusing as code, it goes into REDbridge (GPL-3.0) with attribution, never into EDGEmat |

Neurolinked is contacted before EDGEmat is announced: credited, told what it is, and offered collaboration.

## Phases

Phases are M0 to M6. **Unverified:** that no other EDGE repo uses M. Each ends with a test on the dev PC.

| Phase | Builds | The test proves |
|---|---|---|
| **M0 Spec** | The behavior spec (steps 1 and 2 above). The file table above checked. The bridge methods EDGEmat needs, filed with REDbridge. Neurolinked contacted | The spec is agreed with the user, and every field in it is seen in a real file |
| **M1 Library** | The extension and MCP skeletons, the EDGEmat activity bar container, the bridge client, the material library built from the game and cached, the library view with thumbnails | A full library builds from the game; its counts match the game's |
| **M2 Read** | The `.mlsetup` editor, read-only: layers in plain words, swatches, each layer's mask. Finding an item's materials. Open File for a setup anywhere on disk, as JSON or inside a mod archive. MCP `mat_find`, `mat_describe`, `mat_templates`, `mat_colors` | A game jacket shows the same layers WolvenKit shows, and Claude describes it correctly. A setup from a mod archive outside any project opens and reads the same |
| **M3 Edit** | Change template, color, tiling, levels, microblend; undo and redo; save into a WolvenKit project, including Save to Project for a file opened from anywhere. MCP `mat_edit` | A jacket recolored in EDGEmat, and another recolored by asking Claude, both show correctly in the game. A setup opened from outside the project, saved into it and packed, loads in the game |
| **M4 Preview** | The 3D preview: the mesh with layers blended through their masks, templates and microblends, updated live. MCP `mat_render` | Side by side with an in-game screenshot, the preview reads the same |
| **M5 Beyond mlsetup** | `.mi` parameters, mesh appearances, custom colors (a custom `.mltemplate`, if M2 confirms colors are presets) | A non-multilayered item retextured and a free color used, both in the game |
| **M6 Ship** | Open VSX and Marketplace, the MCP package, docs, a Nexus page, the EDGEkit bundle entry | A non-coder recolors an item from the docs alone, in the UI and by asking an assistant |

## Open questions

| Question | Notes |
|---|---|
| The bridge client | Copy REDcode's `bridgeClient.ts` and `gameFinder.ts` for now, or make them a shared npm package that REDcode, EDGEmat and the other EDGE tools all use |
| Saving a recolor: in place or at a new path | A replaced game `.mlsetup` only shows in game with the Material Texture Override mod (spec section 6, found 2026-10-15). In place is the simplest file change but makes every player install MTO; a new setup at a new path, with the mesh's material pointed at it (a mesh copy or an ArchiveXL patch), needs nothing extra and is how most recolor mods ship. Leaning: new path by default, in place as an option that checks for MTO. Settled in M3 |
| Sharing REDcode's bridge | REDcode's `bridge()` lets EDGEmat skip a second REDbridge. Whether one bridge copes with REDcode's work and EDGEmat's library build at once, and what EDGEmat does when REDcode's bridge is older than it needs, is settled in M1 |
| Preview fidelity | The game's shaders are not public. How close the layered blend gets, and on which templates, is found in M4 |
| Which items first | The garments modders recolor most, to list in M0, become the test set |
| The sibling repos' notes | REDcode's roadmap lists the layered material preview under C6 (README, `docs/design.html`); it should point at EDGEmat. EDGEkit's design says new EDGE editor extensions go into REDcode, and its `extensions.json` should gain EDGEmat. Each repo's own session makes the change |

## Later ideas

Not planned into a phase. Kept so they are not lost.

| Idea | Notes |
|---|---|
| Recolor in the live game, through EDGEbuilder | EDGEbuilder is a REDnode in-game app. A modder looks at something in the game and says "recolor this"; EDGEbuilder works out the item or mesh and hands it to EDGEmat's MCP tools (`mat_find`, `mat_colors`, `mat_edit`), and the change is deployed back to the running game. Needs EDGEmat's MCP server (M2, M3), a way for EDGEbuilder to name what is being looked at, and REDnode's live deploy. Raised by the owner on 2026-10-14. Thought through below |

### Materials at runtime, through REDagent

**A key long-term goal** (owner, 2026-10-15): a modder, or even a player, changes materials in the running game by asking REDagent. For example, looking at a brown crate: "make it blue". Explored when the time comes; these are first notes.

| Piece | What it needs | State on 2026-10-15 |
|---|---|---|
| 1. What is being looked at | The running game names the object in view: its entity, mesh component, mesh and mesh appearance | Not built. REDnode reads and calls into the running game; a "looked-at object" query is a REDnode or EDGEbuilder request when the time comes |
| 2. The change | Find the object's setup, pick the nearest preset in each layer's template (or a template with a better match), write the result | EDGEmat's core, M2 and M3. World props use the same multilayered setups as clothing |
| 3. Into the running game | The game loads `.archive` files at startup, so a changed file has to be reloaded live | Open. RED Hot Tools (a community tool) is said to reload archives in a running game, unverified. If it does not fit, an EDGE hot reloader built the same way. REDnode's hot reload restarts its own JS mods; it does not reload game files |

| Route | Notes |
|---|---|
| Switch to an existing appearance | The quick route, and certainly part of it: mods already change an object's appearance at runtime. Instant, needs no file change, but only offers the looks the mesh already has |
| Recolor a shared setup | One edited `.mlsetup` changes every object that uses it, everywhere: every crate of that mesh and look turns blue. Right for "all crates", wrong for "this crate" |
| Recolor one object | A new setup and a new mesh appearance (or material) for that object, and the placed object pointed at them in its streaming sector. EDGEbuilder's territory |
| A color no template has | Needs a custom `.mltemplate` (M5) |

Open for then: what a player (not only a modder) may change and how it is undone; whether runtime changes are saved as a mod in a project or only last for the session, as REDnode's TweakDB changes do.
