# EDGE<span class="y">mat</span> design

EDGEmat is the EDGEmodders material editor for Cyberpunk 2077. A modder opens a material, sees every parameter it has, including the ones it inherits, changes colors, textures and values, and sees the result without packing the mod and starting the game.

**Status: draft 0.1, scaffold.** Nothing here is agreed yet. Next: M0, the decisions below, with the user.

## What EDGEmat edits

The file roles below are from community knowledge (WolvenKit, the Cyberpunk 2077 modding wiki) and are **unverified** in this repo. M0 checks each against real files through REDbridge.

| File | Class | What it is |
|---|---|---|
| `.mt` | `CMaterialTemplate` | A shader and its parameters with default values. Modders rarely change these |
| `.mi` | `CMaterialInstance` | A `baseMaterial` (a `.mt` or another `.mi`) plus the parameters it overrides: textures, colors, scalars |
| `.mesh` | `CMesh` | Holds material entries: local instances inside the mesh and references to external `.mi` files, and the appearances that pick a material per submesh |
| `.mlsetup` | `Multilayer_Setup` | A multilayered material's layers: for each one a `.mltemplate`, a color, tiling and the strength of its normal, roughness and metal values |
| `.mltemplate` | `Multilayer_LayerTemplate` | A layer's textures and its preset colors and levels |
| `.mlmask` | `Multilayer_Mask` | The masks that say where each layer shows |

## What EDGEmat is, and is not

| It is | It is not |
|---|---|
| An editor for the files above, with the inheritance chain resolved so a modder sees what a parameter's value really is and where it comes from | A shader compiler or a new material system. It edits what the game already reads |
| A preview: the material on a sphere or on the mesh that uses it | An exact render of the game. The preview approximates the game's shaders, and says so |
| A client of REDbridge for every file read and write | A place for WolvenKit or other GPL code. That stays in REDbridge, behind a process boundary |

## Facts that shape the design

| Fact | Consequence |
|---|---|
| REDbridge already opens, patches and saves any CR2W file (`cr2w.open`, `patch`, `save`, REDbridge 0.5.0 and later), converts textures to PNG (`texture.toPng`) and exports meshes (`project.export`) | EDGEmat builds on those methods. New ones (for example resolving a material's inheritance chain) go to REDbridge as requests |
| REDcode's CR2W editor already edits these files as a generic tree, and REDcode V1 has a three.js mesh viewer | EDGEmat is the material-specific view on top. Whether it reuses REDcode's editor and viewer, or ships beside them, is an M0 question |
| REDcode's roadmap lists "material preview" under C6 Parity | EDGEmat may take that over, as EDGEkit took over C7 Brand. To agree in M0 and note in REDcode's design |
| The game's shaders are not public source | The preview is an approximation built per template (for example metal-roughness PBR for the common templates). Each template EDGEmat previews is listed with how close it is |
| Community tools already cover parts of this: WolvenKit's editors, the Cyberpunk Blender add-on's material import, and MLSetupBuilder for multilayered setups | EDGEmat credits them and learns from them. Their licenses are checked before any of their data (for example layer presets) is reused |

## Phases

Phases are numbered M0 to M5, so they do not clash with the other repos' phases (C in REDcode, K in EDGEkit). **Unverified:** that no other EDGE repo uses M. Each phase ends with a test on the dev PC.

| Phase | Builds | The test proves |
|---|---|---|
| **M0 Decide** | The open questions below, answered with the user. A survey of real `.mi`, `.mt` and `.mlsetup` files through REDbridge | The plan and the file table above are agreed and checked |
| **M1 Read** | Open a `.mi` (and a mesh's local materials): the parameter list with each value and where it comes from, following `baseMaterial` to the template. Textures shown as thumbnails | A game material shows the same values WolvenKit shows |
| **M2 Edit** | Change a parameter, override an inherited one, reset to inherited, pick a texture from the project or the game, undo and redo, save | An edited material packs and shows in the game as expected |
| **M3 Preview** | The material on a sphere and on its mesh, updated as values change, for the most used templates | Side by side with an in-game screenshot, the preview reads the same |
| **M4 Multilayer** | The `.mlsetup` layer editor: layers, their templates, colors from the template's presets, tiling, the mask per layer, and a preview | A recolored outfit made in EDGEmat shows correctly in the game |
| **M5 Ship** | Packaging and a release, the docs, a Nexus page | A modder installs it and recolors an item from the docs alone |

## Open questions for M0

| Question | Notes |
|---|---|
| What form does EDGEmat take? | A VS Code extension in this repo that works beside REDcode (like the planned `redcode-rednode` add-on); a mode of REDcode's CR2W editor with only docs here; or a standalone app. REDcode's notes say new EDGE editor extensions go into REDcode, so a separate repo needs a reason |
| Does it need REDcode installed? | Sharing REDcode's bridge client, project view and mesh viewer saves work; a standalone tool reaches modders who do not use VS Code |
| Which templates first? | The preview covers templates one at a time. The most used ones (to count in M0) come first |
| Multilayered first? | Recoloring clothing through `.mlsetup` may be what most modders want, ahead of plain `.mi` editing |
| Bridge methods | Which new REDbridge methods are needed (for example, resolve a material chain, list a template's parameters), filed as requests in REDbridge |
| AI | Expose the material methods as MCP tools, as REDcode does, so an assistant can recolor or retexture a material |
