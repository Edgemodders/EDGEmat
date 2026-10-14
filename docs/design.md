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
| `extensions/edgemat` | The VS Code extension, id `edgemodders.edgemat`: the `.mlsetup` editor, the material library view, the preview |
| `extensions/edgemat/src/core` | Everything that is not UI: the bridge client, the material library, reading and editing setups, finding an item's materials. **No VS Code imports**, so the MCP server bundles the same code, as `redcode-mcp` does with REDcode's bridge client |
| `packages/edgemat-mcp` | The MCP server over stdio, for Claude Code, REDagent or any MCP client |
| REDbridge | Every game file read and write: archives, CR2W as JSON, textures to PNG, mesh export. EDGEmat asks for new methods as REDbridge issues labelled `request` |

| Relationship | How |
|---|---|
| REDbridge | A separate process over JSON-RPC on stdio, the boundary REDcode keeps. EDGEmat is MIT; REDbridge is GPL-3.0 |
| REDcode | Not required. Projects are WolvenKit projects, so EDGEmat writes into `source/archive` itself. When REDcode is installed, EDGEmat uses it through its exported API (`extensions.getExtension`, never importing its code), as REDcode does with REDdeck: open in the CR2W editor, pack, install |
| The UI and the MCP server together | Both edit files. The editor follows changes on disk, so a modder watching the editor sees the assistant's edit land |
| EDGEkit | Bundled as a built-in extension once released |

## The material library

MlsetupBuilder ships about 18 MB of JSON built from the game (every `.mltemplate` with its color presets, a model list, mask and normal lists) and about 500 thumbnails made from game textures. EDGEmat ships none of it: that is data extracted from the game, which the EDGE repos never commit.

Instead EDGEmat builds the library from the modder's own game through REDbridge on first run, and keeps it in a local cache: templates and their presets, microblends, masks, the models that use multilayered materials, and thumbnails rendered from the textures. It stays current with game patches and needs no WolvenKit.CLI. How long a full build takes is measured in M1.

## The MCP server

The tools are about intent ("find this jacket's materials", "the nearest red"), not file plumbing. Proposed names, settled in M2:

| Tool | Does |
|---|---|
| `mat_find` | Finds the materials for an item, appearance, mesh or path: each `.mlsetup` with the submeshes and appearances that use it |
| `mat_describe` | A setup's layers in plain words and in raw values: template, color name and RGB, how much of the surface each layer covers |
| `mat_templates` | Searches the library: "leather", "worn chrome" |
| `mat_colors` | A template's color presets with RGB, and the nearest preset to a color given as a word or a value |
| `mat_edit` | Changes layers (template, color, tiling, levels, microblend) and writes the result into the project, copying the setup from the game first when needed. Returns what changed, so it can be undone |
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
| 2. Check | The same session, through REDbridge | Every claim in the spec is checked against real game files. MlsetupBuilder is a reference, not the authority |
| 3. Build | Other sessions, from the spec | Never open MlsetupBuilder's source. Questions go back to step 1 |
| GPL logic worth reusing | REDbridge | If a piece of MlsetupBuilder's logic is worth reusing as code, it goes into REDbridge (GPL-3.0) with attribution, never into EDGEmat |

Neurolinked is contacted before EDGEmat is announced: credited, told what it is, and offered collaboration.

## Phases

Phases are M0 to M6. **Unverified:** that no other EDGE repo uses M. Each ends with a test on the dev PC.

| Phase | Builds | The test proves |
|---|---|---|
| **M0 Spec** | The behavior spec (steps 1 and 2 above). The file table above checked. The bridge methods EDGEmat needs, filed with REDbridge. Neurolinked contacted | The spec is agreed with the user, and every field in it is seen in a real file |
| **M1 Library** | The extension and MCP skeletons, the bridge client, the material library built from the game and cached, the library view with thumbnails | A full library builds from the game; its counts match the game's |
| **M2 Read** | The `.mlsetup` editor, read-only: layers in plain words, swatches, each layer's mask. Finding an item's materials. MCP `mat_find`, `mat_describe`, `mat_templates`, `mat_colors` | A game jacket shows the same layers WolvenKit shows, and Claude describes it correctly |
| **M3 Edit** | Change template, color, tiling, levels, microblend; undo and redo; save into a WolvenKit project. MCP `mat_edit` | A jacket recolored in EDGEmat, and another recolored by asking Claude, both show correctly in the game |
| **M4 Preview** | The 3D preview: the mesh with layers blended through their masks, templates and microblends, updated live. MCP `mat_render` | Side by side with an in-game screenshot, the preview reads the same |
| **M5 Beyond mlsetup** | `.mi` parameters, mesh appearances, custom colors (a custom `.mltemplate`, if M2 confirms colors are presets) | A non-multilayered item retextured and a free color used, both in the game |
| **M6 Ship** | Open VSX and Marketplace, the MCP package, docs, a Nexus page, the EDGEkit bundle entry | A non-coder recolors an item from the docs alone, in the UI and by asking an assistant |

## Open questions

| Question | Notes |
|---|---|
| The bridge client | Copy REDcode's `bridgeClient.ts` for now, or make it a shared npm package that REDcode, EDGEmat and the other EDGE tools all use |
| Preview fidelity | The game's shaders are not public. How close the layered blend gets, and on which templates, is found in M4 |
| Which items first | The garments modders recolor most, to list in M0, become the test set |
| REDcode's notes | REDcode's CLAUDE.md says new editor extensions go into REDcode, and its roadmap lists the layered material preview under C6. Both should point at EDGEmat; the REDcode session makes that change |
