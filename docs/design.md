# EDGE<span class="y">mat</span> design

EDGEmat is the EDGEmodders material editor for Cyberpunk 2077: a VS Code extension and an MCP server. A modder picks a garment, clicks a layer, chooses a color and sees it on the model. Or they skip the UI and tell REDagent or Claude "make this jacket red".

**Status: draft 0.2.** Agreed with the user on 2026-10-14: a standalone extension in the EDGE family, `.mlsetup` editing first, an MCP server beside the UI, and MlsetupBuilder studied for behavior, never copied. M0 done on 2026-10-16: the [behavior spec](design/behavior.html) is checked against the game and agreed, and Neurolinked contacted. Since then the design gained the activity bar container, opening files from anywhere, the game folder and bridge through REDcode's API, and the preview split with REDcode. M1 done on 2026-10-16. Next: M2. **Revised 2026-10-19 with the owner:** [Generate a material](#generate-a-material) from words or a photo, [game materials on a new mesh](#game-materials-on-a-new-mesh), and a new phase **M4 Make** ahead of the preview, so EDGEfab's clothes and objects get materials sooner. Phases are now M0 to M7.

## Mission

EDGE brings modding to everyone, especially non-coders: easy, fun and fast. For EDGEmat this decides every UI question:

| Rule | In practice |
|---|---|
| The first result in seconds | Open an item, click a layer, pick a color, see it on the model. No file formats to learn first |
| Plain words first, details one click away | "Leather, dark red, 41% of the jacket" before `colorScale`, `mltemplate` and level ranges. Every raw value stays reachable for experienced modders |
| Everything the UI does, an assistant can do | Each feature ships in the UI and in the MCP server in the same phase |
| The best editor even with AI switched off | The MCP server does nothing until an assistant connects. No telemetry, and no network calls except to an AI service the modder chose, only when they ask: Generate, with their own key (revised 2026-10-19, as EDGEfab's rule says) |

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

- **A layer's color is a preset name from its template, not a free RGB value.** So "make it red" means the nearest red among that template's presets, or a different template with a better red. Free colors would need a custom `.mltemplate`, which is an M6 question.
- **An item reaches its materials through a chain:** item, then appearance (`.app`, `.ent`), then mesh, then material, then `.mlsetup` and `.mlmask`. "This jacket" has to be resolved down that chain, so finding is a feature in its own right.

## Shape

| Part | What it is |
|---|---|
| `extensions/edgemat` | The VS Code extension, id `edgemodders.edgemat`, with its own activity bar container: the `.mlsetup` editor, the library and find views ([In VS Code](#in-vs-code)), and the material bake that REDcode's viewer shows ([Preview](#preview-redcode-shows-meshes-edgemat-renders-materials)) |
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

EDGEmat has its own place in the activity bar, as REDcode and EDGEdeck do. It works with no folder open: a modder opens EDGEmat, not a workspace.

| Part | What it is | Phase |
|---|---|---|
| Activity bar | An EDGEmat view container. Its icon is [`tools/brand/activity.svg`](https://github.com/Edgemodders/EDGEmat/blob/main/tools/brand/activity.svg): the family's two HUD corner brackets around a material sheet over a second layer, 24 × 24, stroke 2, one color (`currentColor`). The theme paints it: in the REDnode HUD theme from REDcode, yellow when inactive and white when active. M1 copies it to `extensions/edgemat/images/activity.svg`, where REDcode and EDGEdeck keep theirs. The Marketplace icon is `docs/assets/brand/icon.png` (the "EM" mark) | M1 |
| Library view | Templates and microblends from the modder's game, with thumbnails, searched by plain words | M1 |
| Find view | Items, meshes and setups, from the game and the open project. **Built 2026-10-17:** clothing items by in-game name or record id (1,997 items, read from TweakDB once per game version, 8.5 s, then cached), meshes by path. An item opens into its looks per body, each into its meshes and their materials; a multilayered material opens its setup with the mask set the material names, and the editor says so. Setups are found through Open Setup. Not yet: items from mods (ArchiveXL), and the open project | M2 |
| View in 3D | **Built 2026-10-19, the owner's hand test passed the same day:** an eye on each mesh row in Find (and in its right-click menu) opens the mesh in REDcode's 3D view, which asks EDGEmat for its materials. A first `renderMaterials`, colors only and marked approximate: a layered material shows its color map (the setup editor's, each layer's color through its mask), a textured material shows its own color texture (`BaseColor`, `DiffuseTexture`, `Albedo` or `Diffuse`, sampled from the game). Bumps, shine, metal and microblends come with the bake (M5). REDcode opens a mesh at its first look, so EDGEmat names the look to pick in the status bar. Needs REDcode. Not yet tried: a mesh in a project (its own setups and textures are read first, by design). The assistant's twin is `mat_render` (M5) | M2 |
| Container title bar | Open File, Find, Rebuild Library. **Built 2026-10-17:** Open Setup (from the game by name, a file on disk, or a mod archive), Search, Rebuild Library | M2 |
| Surface page | An editor tab for one surface (`.mltemplate`) or microblend, opened by clicking it in the Library. One preview tab, reused as the modder clicks around, as Explorer does. It shows the large image; every color preset as a named swatch; the roughness, metalness and normal presets in plain words; the defaults; tiling; the textures with their game paths, raw values one click away. Read-only: a game surface is shared by every item that uses it, so it is never edited in place. With a setup editor open, "Use on this layer" applies it there (M3). "Make a custom copy" starts a custom surface with free colors (M6). The MCP twin is `mat_colors`. **Built 2026-10-17:** one tab reused until "Keep open"; the image tinted with the picked color (an approximation, said so on the page); a filter by words and "closest to" a typed or picked color (OKLab distance); plain color names generated by EDGEmat (139 distinct across the game's 155,099 presets); roughness and metal described as fixed values when the surface uses a flat default map | M2 |
| Setup editor | A custom editor tab for `.mlsetup`. Opens from EDGEmat's views, from REDcode's Project and Game Assets trees, from the Explorer, and from Open File | M2 |
| | **Editing built 2026-10-20 (M3):** the selected layer's details edit it: surface (a searchable list from the library), color (the surface's own swatches, filtered by words), the five presets as drop-downs in plain words, tiling, offsets, opacity, microblend and its numbers. Each change applies live and is one VS Code edit (Ctrl+Z, Ctrl+Y; unsaved edits survive a reload). Checks from the behavior spec: a new surface resets the six presets to its defaults; a preset must be the surface's own; `None` is never written; `overrides` and unknown fields are kept (an unedited setup writes back byte for byte). **Save to Project** (a page button, an editor title icon, and Ctrl+S on anything that is not a project's own file): as a new setup with the meshes pointed at it, in place, or at a typed path; then REDcode's Pack and Try. A project's own file saves in place with Ctrl+S, and warns once if it is at a game path (MTO). The MCP twin is `mat_edit`, with a preview mode | M3 |
| | **Built 2026-10-17, read-only:** a custom editor for `*.mlsetup` and `*.mlsetup.json` on any URI: files on disk and in projects, REDcode's `redcode-game:` files, EDGEmat's own read-only `edgemat-game:` file system for game setups it opens, and files taken out of mod archives. Each layer in plain words (surface, color, finish, metal, bumps, microblend, share of the texture), why a layer does not show, and warnings (a color the surface lacks shows white). A **color map**: each layer's swatch laid over the ones below through its mask, in texture space, with each layer's share; click a spot to select its layer; the selected layer's mask lit in the accent color. The mask set is the best name match beside the setup (on disk, in the mod, then in the game folder), or one the modder chooses: a setup does not name its mask, the mesh's material does. REDcode's CR2W editor also claims `*.mlsetup`; VS Code lets the modder pick, and Reopen Editor With switches | M2 |

### The game folder and the bridge

A modder with REDcode set up configures nothing in EDGEmat. EDGEmat finds the game folder in this order, and takes a folder only when it holds `bin\x64\Cyberpunk2077.exe` (REDcode's own test):

| # | Source | Notes |
|---|---|---|
| 1 | `edgemat.gamePath` | EDGEmat's own setting, empty by default, meaning "use the next source". It exists because VS Code lets an extension write only settings that an installed extension declares, so EDGEmat cannot save `redcode.gamePath` when REDcode is absent |
| 2 | REDcode's API, `gamePath()` | `REDcodeApi` version 1 from `extensions.getExtension("edgemodders.redcode-cyberpunk")` (REDcode 0.9.0, [REDcode's API doc](https://edgemodders.github.io/REDcode/api.html)). It returns `undefined` when REDcode's folder is not the game. It carries REDcode's game discovery and its Set Game Folder choice. REDcode stays optional: EDGEmat does not list it in `extensionDependencies` |
| 3 | `redcode.gamePath` | Read with `getConfiguration("redcode")`, for when REDcode is not active. Its default is the standard Steam folder, which on most machines is not the game until REDcode's first run fixes it; hence the check. EDGEmat watches this setting to follow a later Set Game Folder (the API has no change event for the game folder) |
| 4 | EDGEdeck's API, `gamePath()` | `extensions.getExtension("edgemodders.edgedeck").exports`, API version 1, only when EDGEdeck is already running (REDcode does the same, to avoid racing a window reload) |
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
| Assistant | `mat_describe` takes a file on disk or a setup inside a mod archive; `mat_edit` writes the result into a project the same way. **Built 2026-10-17:** `mat_describe` takes a game path or a file on disk; a setup inside a mod archive is not yet supported there (the UI's Open Setup handles it) |

## Preview: REDcode shows meshes, EDGEmat renders materials

The goal for a modder: preview meshes with their appearances and materials in REDcode or EDGEmat, author a new material in EDGEmat, and see it on the mesh. Agreed with the owner on 2026-10-15: **one viewer, two jobs, loosely coupled.** Neither extension requires the other.

| Job | Owner | Why |
|---|---|---|
| Viewing a mesh, its submeshes and LODs | REDcode | Its viewer (three.js, `webview/meshViewer.ts`, done in REDcode 0.7.0) already does this. EDGEmat does not build a second one |
| Viewing and switching a mesh's appearances | REDcode | Viewing: pick an appearance and see it. An appearance is mesh data: the material each render chunk uses |
| Turning a material into something renderable | **EDGEmat** | Layered materials need what EDGEmat knows: setup, masks, templates, microblends, the level math (spec sections 3 to 5). Later `.mi` and `.mt` |
| Authoring materials | EDGEmat | Its purpose |
| **Authoring a mesh's appearances**: its looks, which material each submesh uses, new looks and variants. "Save as new look" in a recolor is one case | **EDGEmat** | Revised with the owner on 2026-10-16: an appearance is a set of materials, so its editor belongs beside the material editor. EDGEmat's **Looks** editor ([Custom assets](#custom-assets-from-a-model-to-the-game)) |
| An item's or entity's appearances (`.app`, `.ent`), and generic editing of any file | REDcode, then EDGEfab | REDcode's CR2W editor edits any file raw. Guided item appearances for new assets belong to [EDGEfab](https://github.com/Edgemodders/EDGEfab) ([Custom assets](#custom-assets-from-a-model-to-the-game)) |

**How they connect.** EDGEmat exports an API (`apiVersion` 1, `src/api.ts`) with `renderMaterials(mesh, appearance)`. **A first version shipped 2026-10-19 (M2):** colors only, from what M2 already makes, so modders see a garment's colors in 3D long before the bake; REDcode's side was already in place (REDcode 0.10.0). The full contract:: per material name, baked PBR maps (color, normal, roughness, metalness) as PNG bytes, marked approximate until M5 checks them against the game, and an event when a material changes. REDcode's viewer asks for them when EDGEmat is active and keeps flat colors otherwise, the way REDcode reads EDGEdeck's API. Baking to plain maps keeps the contract small and serves three more uses: `mat_render`, glTF exports with real textures, and library thumbnails. Requested as [REDcode #6](https://github.com/Edgemodders/REDcode/issues/6) on 2026-10-15, with appearance switching, and with REDcode's planned layered material preview (C6) handed to EDGEmat.

**EDGEmat's own editor** embeds the same viewer for live preview while editing. **Later:** factor the viewer out of REDcode into a shared component (an npm package) that REDcode, EDGEmat and other EDGE tools embed; until then EDGEmat uses REDcode's bundled viewer or a copy (both MIT).

## Custom assets: from a model to the game

**The ultimate goal** (owner, 2026-10-16): modders create and modify custom assets, such as new clothes and objects, fully textured and with appearances, and see them in the game fast. EDGEmat is at the center of this, because every asset needs materials and looks. It is not the whole of it: the workflow spans several EDGE tools, and this section says who does what. These are goals and recommendations for planning, not yet phases with tests, except where the phase table says so.

### The four goals

| # | Goal | Owner | Notes |
|---|---|---|---|
| 1 | **Import a textured model** from Blender or an AI model service such as Tripo | REDbridge (geometry, images), EDGEmat (materials, looks) | **glTF and GLB first**: Blender exports them natively, Tripo and most AI services offer GLB, and WolvenKit's importer, which REDbridge's `project.import` runs, reads glTF. FBX and OBJ through Blender (EDGE can call an installed Blender in the background to convert) or asked for as GLB. Geometry becomes a `.mesh`; the model's images become `.xbm` (both exist in REDbridge 0.7.0). **Unverified:** WolvenKit's importer appears to import over an existing `.mesh` ("keeps the replaced file's settings"), so a new asset may start from a template mesh; to check with REDbridge |
| 2 | **View the model** with its in-game appearances | REDcode's viewer | Before import, a GLB shows its own textures: three.js loads them already, REDcode's viewer currently paints flat colors instead. After import, the viewer switches appearances and gets materials from EDGEmat (REDcode #6). Authoring the appearances is EDGEmat's **Looks** editor (the table above) |
| 3 | **The whole asset workflow**, from a model to a working item or object | Several tools, guided by **[EDGEfab](https://github.com/Edgemodders/EDGEfab)** | Below |
| 4 | **Hot-load updated archives** into the running game | REDnode (game side), REDcode (pack), EDGEdeck (deploy) | Below |

### What EDGEmat adds for this

| Feature | What it does | Phase |
|---|---|---|
| **Materials from a textured model** | Turns a model's PBR textures (base color, normal, metallic-roughness, emissive) into the game's material for plain textured assets: a `.mi` on `engine\materials\metal_base.remt` (the usual choice for custom assets, unverified for all cases), with the images imported as `.xbm`. Handles the format gaps: glTF packs roughness and metalness in one image; normal-map conventions may differ (unverified) | M4 |
| **Generate a material** | A new material from words ("brown leather") through an AI image service the modder chose, or from a photo. [Below](#generate-a-material) | M4 |
| **Game materials on a new mesh** | A surface and color, or a game `.mi`, picked from the game and put on a new mesh. [Below](#game-materials-on-a-new-mesh) | M4 |
| **Looks editor** | A mesh's appearances: list them, see each on the model, pick the material for each submesh, add a look, duplicate a look as a variant. Writes the mesh's `appearances` and `materialEntries` | M4 (recolor's "save as new look" in M3) |
| **Layered materials for new assets** | A multilayered material with several layers on a custom model needs masks painted for its UVs: mask painting (a later feature in the behavior spec) becomes how a modder makes one | M6 |

**For EDGEfab** (owner, 2026-10-19): EDGEfab makes clothes and objects, and gets their materials from EDGEmat in one of two ways: a new material made by Generate (EDGEmat calls the image service), or an existing game material picked and applied. It calls EDGEmat's API from its extension, and an assistant calls EDGEmat's MCP tools (`mat_generate`, `mat_find`, `mat_colors`, `mat_apply`). Fitting clothes to the body is EDGEfab's and Blender's ([EDGEfab design, "Clothing"](https://edgemodders.github.io/EDGEfab/design.html#clothing-fitting-to-the-body)).

### Generate a material

The goal (owner, 2026-10-19): a modder who is not an artist makes a new material from words, such as "brown leather" or "red concrete", or from a photo, and puts it on an object.

**A textured `.mi`, not a layer.** A layer of a multilayered material has no color texture: it is a surface's grey detail maps plus one color preset. An image's colors and patterns cannot go into a layer. So recoloring a game garment stays a surface plus a color, which the Library and `mat_colors` already find with no AI. A generated image becomes a textured `.mi` on `engine\materials\metal_base.remt`, the same output as Materials from a textured model.

| Step | What | Where |
|---|---|---|
| 1. An image | From the modder's words, through an AI image service they chose; or their own photo or image, with no service and no key | The service, or a file |
| 2. Seamless | Made to tile. Image services do not reliably tile, even when asked | EDGEmat, on the PC |
| 3. The other maps | Bumps (normal) and shine (roughness) derived from the image; metal as a choice. Plain-words sliders: "bumpier", "shinier" | EDGEmat, on the PC |
| 4. Into the game | Resized to a game size (1024 or 2048), imported as `.xbm`, the `.mi` written into the project | REDbridge |
| 5. Recorded | How it was made, beside the material: service, model, prompt, date. Mod sites may ask for AI content to be labelled (Nexus Mods, unverified) | EDGEmat |

**The prompt.** One general prefix, then the modder's words. The prefix asks for a seamless tiling texture seen straight on; flat, even light with no shadows, highlights or reflections, since the game lights it; the material filling the frame, with no objects, text, borders or vignette; and a real-world scale. It should work for every surface (unverified). A detail size (fine, medium, coarse) sets the scale. Kinds of output are added only if tests show the need; the likely one is a decal or emblem: one design on a plain background, not tiled. The whole prompt stays editable, one click away.

**Services.** Opt-in, with the modder's own key and credits.

| Service | Models |
|---|---|
| Google Gemini | Nano Banana and Nano Banana Pro |
| OpenAI | GPT Image, current version checked when built |

Model names come from the service's own model list where it has one, as EDGEwave does, not hard-coded. Exact model IDs are unverified until built.

**The UI** follows EDGEwave's voice tools (owner, 2026-10-19), with one change for images:

| EDGEwave | EDGEmat |
|---|---|
| A dialog over the page: prompt, options, Generate | The same, on a **New Material** page, opened from the Library's title bar and later from the Looks editor |
| Each press adds a take, newest first, each with **Add** | The same, as image tiles. A selected take shows tiled 3 × 3, so seams show before Add |
| The key in VS Code's secret storage, asked for the first time it is needed; Set and Clear key commands | The same, one key per service (`edgemat.gemini.apiKey`, `edgemat.openai.apiKey`) |
| "Spends your credits" in the dialog | The same |

**MCP.** `mat_from_image` makes a material from an image file. `mat_generate` asks a service. The MCP server cannot read VS Code's secret storage, so it reads the services' usual environment variables (`GEMINI_API_KEY`, `OPENAI_API_KEY`), which a plugin such as EDGEchat can set from its own settings.

### Game materials on a new mesh

EDGEfab's other route: pick a material from the game and put it on a new mesh.

| Kind | On a new mesh |
|---|---|
| A textured game `.mi` that tiles (many world materials) | Used as the mesh's external material. Textures painted for one mesh's UVs, as most garments' are, do not fit another mesh |
| A layered surface (leather, denim, chrome) | A one-layer setup: one surface, a color preset and tiling over a full white mask. Fits any UVs. Unverified in the game |
| Several surfaces on one garment | One submesh per part (body, collar, buttons), made in Blender, each with its own one-layer material. Several layers in one material need masks for the new UVs (M6) |

The Library, Find, `mat_templates` and `mat_colors` choose the material; `mat_apply` puts it on the mesh in a look.

### The workflow, step by step

Two kinds of asset, with different hard parts: an **object** (a prop placed in the world) needs no rig; **clothing** must be skinned to the player's rig and layer with other garments. Objects come first.

| Step | What happens | Tool |
|---|---|---|
| Make or get a model | Blender, or an AI model service. EDGE does not build a 3D modeler. An assistant can drive Blender through a Blender MCP server ([EDGEfab design](https://edgemodders.github.io/EDGEfab/design.html#blender-and-blender-mcp)) | Blender; an AI service, opt-in, as EDGEwave does for voice |
| Import | Geometry to `.mesh`, images to `.xbm` | REDbridge through REDcode (exists) |
| Rig and fit (clothing only) | Weights for the player's rig, fitted to the body types; garment layering parameters | Blender with the community WolvenKit Blender add-on, which carries the body dummies and refitters; guided by EDGEfab ([EDGEfab design, "Clothing"](https://edgemodders.github.io/EDGEfab/design.html#clothing-fitting-to-the-body)). An "Edit in Blender" round trip is in REDcode |
| Materials and looks | Materials from the model's textures, generated or picked from the game; recolors, variants | **EDGEmat** |
| Make it a game thing | Object: an entity with the mesh. Clothing: entity and `.app` appearances, an ArchiveXL factory and `.xl`, a TweakXL item record (entity name, appearance name, display name, icon), localized text, an inventory icon | **[EDGEfab](https://github.com/Edgemodders/EDGEfab)** |
| Place it (objects) | Drop it in the world and bake it into a sector | EDGEbuilder, once its index reads mod archives as well as the game's |
| Pack, deploy, try | Pack the project, deploy it, hot-load it, spawn it or put it on V | REDcode, EDGEdeck, REDnode (and REDagent: "give V the new jacket") |

**A new EDGE tool for asset assembly: EDGEfab.** Agreed with the owner on 2026-10-16; the repo is [EDGEfab](https://github.com/Edgemodders/EDGEfab), scaffolded the same day, with its own design brief. No tool owns "make it a game thing", and it is the step non-coders find hardest: many small files that must agree with each other. A guided tool, a VS Code extension like EDGEmat with an MCP server, would create new items and objects (and later vehicles or weapons) from a mesh and its looks: the entity, appearances, factory, `.xl`, TweakXL record, text and icon, checked against each other. It would use EDGEmat for materials and looks, REDcode's viewer, REDbridge for files, EDGEdeck and REDnode to try the result. Without it, EDGEmat would grow into an item editor, which blurs its purpose.

### Hot-loading archives

The game loads `.archive` files at startup, so today every change means a restart. Options, in order:

| Option | Notes |
|---|---|
| **RED Hot Tools** (a community RED4ext plugin) | Reported to reload archives from a hot folder in a running game. Unverified on the dev PC. Try it first |
| **An EDGE hot loader** | If RED Hot Tools does not fit, the same idea built into REDnode's native plugin: mount a changed archive and refresh what uses it |
| **Refresh what is on screen** | A reloaded resource shows only when the game loads it again. REDnode can respawn an object or re-apply V's appearance (switching appearances at runtime already works, as EDGEbuilder does) |

The flow for a modder: **Pack and try** in REDcode packs the project, deploys it to the hot folder (EDGEdeck's deploy, so the mod list stays right), and asks REDnode to reload and refresh. Setups replaced in place also need Material Texture Override (spec section 6), unknown whether that holds for hot loading. This also serves the runtime-materials goal in [Later ideas](#materials-at-runtime-through-redagent).

### Requests this implies

Filed on 2026-10-16, each to its repo as a `request`:

| Repo | Request |
|---|---|
| REDcode | [#6](https://github.com/Edgemodders/REDcode/issues/6) updated: show a GLB's own textures in the viewer; Looks authoring is EDGEmat's, REDcode views and switches. [#7](https://github.com/Edgemodders/REDcode/issues/7): "Pack and try" (hot load) and "Edit in Blender" |
| REDbridge | [#5](https://github.com/Edgemodders/REDbridge/issues/5): mesh import for a **new** asset (from a GLB, or over a template mesh); what the importer keeps and drops; material names |
| REDnode | [#12](https://github.com/Edgemodders/REDnode/issues/12): hot-load archives (through RED Hot Tools, or REDnode's own); refresh what uses a reloaded resource |
| EDGEbuilder | [#1](https://github.com/Edgemodders/EDGEbuilder/issues/1): index the user's mod archives, so custom objects can be placed |
| A new repo | [EDGEfab](https://github.com/Edgemodders/EDGEfab), created by the owner and scaffolded on 2026-10-16 |

## The material library

MlsetupBuilder ships about 18 MB of JSON built from the game (every `.mltemplate` with its color presets, a model list, mask and normal lists) and about 500 thumbnails made from game textures. EDGEmat ships none of it: that is data extracted from the game, which the EDGE repos never commit.

Instead EDGEmat builds the library from the modder's own game through REDbridge on first run, and keeps it in a local cache. It stays current with game patches and needs no WolvenKit.CLI.

**Built in M1** (2026-10-16), measured on the dev PC (game 2.31, REDbridge 0.8.0):

| Part | What | Measured |
|---|---|---|
| Surfaces | Every `.mltemplate`: category and group (from its folder), tiling, textures, the six default presets, every color, normal, roughness and metal preset (levels as scale and bias) | 386, matching the game's listing; 155,099 color presets |
| Microblends | Every `.xbm` in a `microblends` folder | 131, matching the game's listing. Setups use 144 distinct microblend paths (spec scan), so a few live elsewhere; found in M2 |
| Counts | Setups and mask sets in the game, for later phases | 17,734 setups, 5,722 mask sets |
| Thumbnails | 96 px PNGs: a surface's diffuse map with its levels stretched (grey when near-grey, to avoid speckle), or its normal map as relief when the diffuse is flat; a microblend's alpha mask | 343 files; 4 surfaces have none (`unused`, two flat plastics, one whose texture the game lacks) |
| Time and size | A full build, then a rebuild with the thumbnails cached | 22 to 25 s, then 4 s; `library.json` 11.3 MB |
| Where | `%LOCALAPPDATA%\EDGEmat`, one cache shared by the extension and the MCP server. A key from the game's archive list marks it out of date after a game update | |

The models that use multilayered materials, and each mask set's layers, are left to M2, where finding an item's materials needs them.

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
| `mat_from_image` | Makes a textured material from an image file: seamless, bump and shine maps, written into the project (M4) |
| `mat_generate` | The same from words, through an AI image service, with the key from the environment (M4, [Generate a material](#generate-a-material)) |
| `mat_apply` | Puts a material on a mesh's submeshes in a look, adding the look if asked (M4) |

"Make this jacket red" is then: `mat_find`, `mat_describe` to pick the layers that make up the fabric, `mat_colors` for the nearest red in each, `mat_edit`, `mat_render`, and the user sees it. Packing and installing stay with REDcode's and EDGEdeck's tools.

## Prior art, and how EDGEmat uses it

| Project | License | What EDGEmat takes |
|---|---|---|
| [MlsetupBuilder](https://github.com/Neurolinked/MlsetupBuilder) by Neurolinked | GPL-3.0 | The behaviors a multilayered material editor needs, learned by studying it. No code, no data |
| [WolvenKit](https://github.com/WolvenKit/WolvenKit) | GPL-3.0 | The file formats and their JSON form, through REDbridge only |
| The [Cyberpunk 2077 modding wiki](https://wiki.redmodding.org/) | | How the material system works. Findings that are new go back to it |
| [EDGEwave](https://github.com/Edgemodders/EDGEwave) | MIT | Its AI generation idiom (a dialog of takes, the key in secret storage), followed by Generate a material |

**Spec, then build.** EDGEmat is not a port of MlsetupBuilder and must not read like one.

| Step | Who | Rule |
|---|---|---|
| 1. Spec | One session studies MlsetupBuilder (code, UI, videos) and the game files | Writes [`docs/design/behavior.md`](design/behavior.html) in its own words: features, file fields, workflows, edge cases. No code, no copied text, no copied data |
| 2. Check | A session on the dev PC, through REDbridge, without opening MlsetupBuilder's source | Every claim in the spec is checked against real game files and corrected where wrong. MlsetupBuilder is a reference, not the authority. Questions about what MlsetupBuilder does go back to the spec session |
| 3. Build | Other sessions, from the spec | Never open MlsetupBuilder's source. Questions go back to step 1 |
| GPL logic worth reusing | REDbridge | If a piece of MlsetupBuilder's logic is worth reusing as code, it goes into REDbridge (GPL-3.0) with attribution, never into EDGEmat |

Neurolinked is contacted before EDGEmat is announced: credited, told what it is, and offered collaboration. **Done 2026-10-16:** the owner sent a Discord DM (what EDGEmat is, no code or data from MlsetupBuilder, credit, an offer to collaborate, and the M0 findings that may help MlsetupBuilder). Any reply, and credit wording they ask for, is recorded here.

## Phases

Phases are M0 to M7. **Unverified:** that no other EDGE repo uses M. Each ends with a test on the dev PC.

**Revised 2026-10-19 with the owner:** M4 Make (materials for new meshes) moved ahead of the preview, so EDGEfab's objects (its F1) and clothing (its F3) get materials sooner. A textured `.mi` needs no layered bake to be seen: REDcode's viewer shows a GLB's own textures already (unverified for an imported `.mi`). The preview became M5, Beyond mlsetup M6, Ship M7.

**Revised again 2026-10-19 with the owner:** no release at the end of M2. The first public preview is **0.3.0, at the end of M3**, so it edits with a full round trip into the game, and it takes **Generate's first slice** from M4, so it can say it has AI generation. A generated material replaces a whole material, so on a game garment it covers every part that material paints; the preview shows it on objects and simple parts, and does not pitch it as AI recoloring. That is the long-term goal ([Later ideas](#redesign-a-garment-by-asking-an-ai)).

| Phase | Builds | The test proves |
|---|---|---|
| **M0 Spec** | The behavior spec (steps 1 and 2 above). The file table above checked. The bridge methods EDGEmat needs, filed with REDbridge. Neurolinked contacted | The spec is agreed with the user, and every field in it is seen in a real file |
| **M1 Library** | The extension and MCP skeletons, the EDGEmat activity bar container, the bridge client, the material library built from the game and cached, the library view with thumbnails | A full library builds from the game; its counts match the game's |
| **M2 Read** | The surface page. The `.mlsetup` editor, read-only: layers in plain words, swatches, each layer's mask. Finding an item's materials. Open File for a setup anywhere on disk, as JSON or inside a mod archive. MCP `mat_find`, `mat_describe`, `mat_templates`, `mat_colors` | A game jacket shows the same layers WolvenKit shows, and Claude describes it correctly. A setup from a mod archive outside any project opens and reads the same |
| **M3 Edit**, released as the 0.3.0 preview | Change template, color, tiling, levels, microblend; undo and redo; save into a project (REDcode's or WolvenKit's, the same layout), including Save to Project for a file opened from anywhere; a new setup at a new path with a mesh copy pointed at it (the no-MTO route); "save as new look" if time allows. MCP `mat_edit`. **Generate's first slice**, from M4: the New Material page (words through Nano Banana, Nano Banana Pro or GPT Image with the modder's key, or their own photo), takes shown tiled, made seamless, bumps and shine derived, the `.xbm` and a textured `.mi` written into the project, and put on one material of a mesh found in Find. MCP `mat_generate`, `mat_from_image` and a minimal `mat_apply`. First, the two checks in [Open questions](#open-questions): a new `.xbm` from a PNG, and a hand-made textured `.mi` on a garment part in the game | A jacket recolored in EDGEmat, and another recolored by asking Claude, each saved into a REDcode project, packed and deployed by REDcode, show correctly in the game. A setup opened from outside the project, saved into it and packed, loads in the game. A material generated from words goes on part of a garment or an object and shows in the game, through the UI and by asking Claude |
| **M4 Make** | Materials for new meshes, what EDGEfab needs ([Custom assets](#custom-assets-from-a-model-to-the-game)): **materials from a textured model** (glTF PBR textures to `.xbm` and a `.mi`); the rest of **[Generate a material](#generate-a-material)** (its first slice is in M3: what M4 adds is prompt presets if tests show the need, the decal kind, and Generate from the Looks editor); **[game materials on a new mesh](#game-materials-on-a-new-mesh)**; the **Looks** editor for a mesh's appearances. EDGEmat's API for EDGEfab. MCP `mat_from_image`, `mat_generate`, `mat_apply`. First, an in-game test of a tiled texture on a garment ([open questions](#open-questions)) | A GLB model from Blender gets a generated material and a game material, in two looks, and shows in the game, once through the UI and once by asking Claude. A non-artist makes "brown leather" from words alone |
| **M5 Preview** | The bake: a layered material to PBR maps, with layers blended through their masks, templates and microblends, updated live. EDGEmat's API `renderMaterials` for REDcode's viewer ([REDcode #6](https://github.com/Edgemodders/REDcode/issues/6)); the same viewer in EDGEmat's editor. MCP `mat_render` | Side by side with an in-game screenshot, the preview reads the same, in REDcode's viewer and in EDGEmat's |
| **M6 Beyond mlsetup** | `.mi` parameters on game items; custom colors (a custom `.mltemplate`); layered materials with several layers on a new mesh (masks for its UVs). See [Custom assets](#custom-assets-from-a-model-to-the-game) | A non-multilayered game item retextured, a free color used, and a new mesh with a two-layer material, all shown in the game |
| **M7 Ship** | Open VSX and Marketplace, the MCP package, docs, a Nexus page, the EDGEkit bundle entry | A non-coder recolors an item from the docs alone, in the UI and by asking an assistant. The packaged VSIX, installed with `code --install-extension` into a normal VS Code (not the F5 development host), works the same |

## Open questions

| Question | Notes |
|---|---|
| The bridge client | **M1: copied.** `bridgeClient.ts`, `types.ts` and `gameFinder.ts` are copied from REDcode at commit `9f54c80` into `extensions/edgemat/src/core`, each with a header naming the source. A shared npm package for the EDGE tools stays the goal, together with the shared viewer |
| Saving a recolor: in place or at a new path | **Settled 2026-10-20 (M3):** a new setup beside the original (named with the project's name) by default, with every mesh that uses the old setup copied into the project and its materials pointed at the new one: no other mod needed. Found by reading the meshes in the garment's folder (the jacket's three body meshes in about 0.5 s). A material that names the setup through an `.mi` gets a copy of the `.mi` beside the new setup (written, not yet tried in the game). In place stays an option, and warns that it needs Material Texture Override. ArchiveXL patches instead of mesh copies: later, if mesh copies clash with other mods |
| Sharing REDcode's bridge | **M1:** EDGEmat uses REDcode's running bridge when REDcode is active and reads the same game folder; otherwise it starts its own, and the MCP server always does. Whether one bridge copes under load with both tools busy, and what to do when REDcode's bridge is older than EDGEmat needs, is watched in M2 |
| Preset colors: sRGB or linear | The surface page and `mat_colors` treat preset RGB as screen (sRGB) values, clipped above 1. Many presets then look very dark (about a quarter of all presets are named black or dark grey). If the game reads them as linear, swatches and names should brighten. Checked in M5 against in-game screenshots; one function (`core/colors.ts`) changes |
| Preview fidelity | The game's shaders are not public. How close the layered blend gets, and on which templates, is found in M5 |
| A tiled texture on a game garment | **Partly answered 2026-10-19.** `metal_base.remt` has a `LayerTile` scalar (20 parameters: `BaseColor`, `BaseColorScale`, `Normal`, `NormalStrength`, `Roughness`, `RoughnessScale` and `RoughnessBias`, `Metalness` with its scale and bias, emissive, `AlphaThreshold`, `LayerTile` and others), and garments use it already: Dawn's pants (`l1_001_wa_pants__dawn.mesh`) draw their stitching with local `metal_base` materials (a color texture, a normal map, a color tint). Still unverified: what `LayerTile` does exactly, and how a tiled texture looks across a garment's UV islands, which are laid out as one sheet. Checked in the game with EDGEmat's first written mesh, using a test pattern, before Generate's UI is built. A new mesh made in Blender sets its UVs to suit |
| Maps derived from a color image | How good bumps and shine made from a color image look in the game. M3, with Generate's first slice |
| A new `.xbm` from a PNG | **Answered 2026-10-19** (REDbridge 0.10.0): `project.import` makes a new `.xbm`, but always with WolvenKit's default setup (`TEXG_Generic_Color`, uncompressed, `isGamma` 0), where a game color texture is `TCM_QualityColor` with `isGamma` 1 and a normal map `TEXG_Generic_Normal`, `TCM_Normalmap`. A game `.xbm` of the right kind copied to the target first gives the import its setup (checked on a normal map). EDGEmat does that until [REDbridge #8](https://github.com/Edgemodders/REDbridge/issues/8) (a texture setup for `project.import`) ships |
| Image services and models | Which Gemini and OpenAI image models, their sizes and prices, and whether a general prompt prefix is enough. Checked when Generate's first slice starts (M3) |
| Which items first | The garments modders recolor most, to list in M0, become the test set |
| A shared mesh viewer | Factor REDcode's viewer out into a shared component (an npm package) that REDcode, EDGEmat and other EDGE tools embed. Later, once the material hook works; noted in REDcode #6 |
| The sibling repos' notes | REDcode's roadmap lists the layered material preview under C6 (README, `docs/design.html`); it should point at EDGEmat, requested in REDcode #6. EDGEkit's design says new EDGE editor extensions go into REDcode, and its `extensions.json` should gain EDGEmat. Each repo's own session makes the change |

## Later ideas

Not planned into a phase. Kept so they are not lost.

| Idea | Notes |
|---|---|
| Redesign a garment by asking an AI | The true goal of the AI features (owner, 2026-10-19). Thought through below |
| Recolor in the live game, through EDGEbuilder | EDGEbuilder is a REDnode in-game app. A modder looks at something in the game and says "recolor this"; EDGEbuilder works out the item or mesh and hands it to EDGEmat's MCP tools (`mat_find`, `mat_colors`, `mat_edit`), and the change is deployed back to the running game. Needs EDGEmat's MCP server (M2, M3), a way for EDGEbuilder to name what is being looked at, and REDnode's live deploy. Raised by the owner on 2026-10-14. Thought through below |

### Redesign a garment by asking an AI

**The true goal** (owner, 2026-10-19), however far off: a modder asks an AI agent to recolor or redesign a piece of clothing ("make this jacket look like worn desert gear") and it does. Start small and refine. First notes:

| Piece | What it needs | State on 2026-10-19 |
|---|---|---|
| 1. The whole garment | Every material of the item, per look and body: layered setups with their layers, the textured and decal materials (such as the stitching, `pasted__decal_stitches`) | `mat_find` lists them; `mat_describe` gives one setup's layers. An assistant combines the two today |
| 2. How they map onto it | Where each layer and material sits on the garment, in a form the agent can reason about: each layer's share and area in words ("collar", "sleeves"), and the color map as an image for a model that sees images | Shares exist; areas in words and the image through MCP do not |
| 3. The change | Per layer, a surface and a color the surface offers (`mat_colors`, `mat_edit`); per textured material, a generated or picked texture (`mat_generate`, `mat_apply`) | M3 builds the tools |
| 4. See it, and try again | The result in REDcode's 3D view, then in the game | View in 3D (colors), the bake (M5), hot loading |

Likely shape: one MCP call that returns the whole garment at once (`mat_item`, unverified name), so the agent plans the redesign with everything in view, then `mat_edit` per layer.

### Materials at runtime, through REDagent

**A key long-term goal** (owner, 2026-10-15): a modder, or even a player, changes materials in the running game by asking REDagent. For example, looking at a brown crate: "make it blue". Explored when the time comes; these are first notes.

| Piece | What it needs | State on 2026-10-15 |
|---|---|---|
| 1. What is being looked at | The running game names the object in view: its entity, mesh component, mesh and mesh appearance | Not built. REDnode reads and calls into the running game; a "looked-at object" query is a REDnode or EDGEbuilder request when the time comes |
| 2. The change | Find the object's setup, pick the nearest preset in each layer's template (or a template with a better match), write the result | EDGEmat's core, M2 and M3. World props use the same multilayered setups as clothing |
| 3. Into the running game | The game loads `.archive` files at startup, so a changed file has to be reloaded live | Open. RED Hot Tools (a community tool) is said to reload archives in a running game, unverified. If it does not fit, an EDGE hot reloader built the same way. REDnode's hot reload restarts its own JS mods; it does not reload game files. Planned with the custom-asset workflow: [Hot-loading archives](#hot-loading-archives) |

| Route | Notes |
|---|---|
| Switch to an existing appearance | The quick route, and certainly part of it: mods already change an object's appearance at runtime. Instant, needs no file change, but only offers the looks the mesh already has |
| Recolor a shared setup | One edited `.mlsetup` changes every object that uses it, everywhere: every crate of that mesh and look turns blue. Right for "all crates", wrong for "this crate" |
| Recolor one object | A new setup and a new mesh appearance (or material) for that object, and the placed object pointed at them in its streaming sector. EDGEbuilder's territory |
| A color no template has | Needs a custom `.mltemplate` (M6) |

Open for then: what a player (not only a modder) may change and how it is undone; whether runtime changes are saved as a mod in a project or only last for the session, as REDnode's TweakDB changes do.
