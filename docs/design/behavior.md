# Multilayered materials: behavior <span class="y">spec</span>

What EDGEmat must understand and do to edit Cyberpunk 2077's multilayered materials. This is phase M0's spec: build sessions work from this page, not from MlsetupBuilder's source.

**Status: draft 0.1, unverified.** Written on 2026-10-14 from a study of MlsetupBuilder 1.6.9 (commit `4271e8c`) and community knowledge, in a cloud session with no game install. Every claim below is unverified until the local session checks it against real files through REDbridge ([checklist](#checklist-for-the-local-session)). Field names, game paths and numbers are facts about the game and WolvenKit's JSON; everything else is our own description.

## How this page is used

| Rule | |
|---|---|
| Build sessions read this page, never MlsetupBuilder's source | Questions go back to a spec session, which answers them here |
| A claim is only trusted once checked | The Check column says how. The local session marks each row **confirmed** or **corrected** with the date |
| MlsetupBuilder is a reference, not the authority | Where it and the game disagree, the game wins. Its known bugs are listed so we do not copy them by accident |

## 1. From an item to its layers

A garment reaches its multilayered material through a chain. "Make this jacket red" has to walk it.

| Step | What holds the link | Check |
|---|---|---|
| Item to appearance | The item's appearance resource (`.app`) or entity (`.ent`) names the mesh and the mesh appearance to use | Unverified |
| Mesh appearance to material | A `.mesh` has named appearances. Each lists one material name per submesh, in submesh order | Unverified |
| Material to template | Each material entry names a base: a `.mt` template or a `.mi` instance. Multilayered ones end in `engine\materials\multilayered.mt` (also seen: `base\materials\vehicle_destr_blendshape.mt`, `base\fx\_shaders\sandevistan_multilayer.mt`) | Unverified |
| Material to setup and mask | A multilayered material's parameters include `MultilayerSetup` (a `.mlsetup`), `MultilayerMask` (a `.mlmask`) and `GlobalNormal` (a normal texture) | Unverified |
| Defaults | The multilayered template's own defaults point at `engine\materials\defaults\multilayer_default.mlsetup` and `.mlmask` | Unverified |

WolvenKit's mesh export can write a material file beside the model (`<name>.Material.json`). It lists every material with its template and parameters, and every appearance with its material names. That one file answers steps 2 to 4 for a mesh. EDGEmat needs the same answer from REDbridge (see [bridge needs](#7-bridge-needs)).

Naming patterns that help finding (unverified, from community use): setups and masks are often named `ml_<mesh>_masksset`; mesh names carry body type and part codes (for example `_pwa_`/`_pma_` for the player, `t1_`/`t2_` torso layers, `h0_` head, `l1_` legs, `s1_` feet).

## 2. The `.mlsetup` file

A `Multilayer_Setup` is an ordered list of layers. Layer 0 is the base; each later layer is drawn over the ones before it where its mask allows (unverified).

| Root field | Meaning | Check |
|---|---|---|
| `layers` | The layers, in order. **At most 20** | Unverified: find the largest count in the game |
| `ratio` | A float, usually 1.0. Meaning unknown; possibly the surface aspect ratio | Unverified |
| `useNormal` | Whether the layers' normal maps are used | Unverified |
| `cookingPlatform` | `PLATFORM_PC` | |

| Layer field | Type | Meaning | Default |
|---|---|---|---|
| `material` | path to `.mltemplate` | The surface: leather, chrome, denim | `base\surfaces\materials\special\unused.mltemplate` |
| `colorScale` | preset name | One of the template's color presets | `null_null` |
| `matTile` | float | Tiling of the surface textures, multiplied by the template's own tiling | 1.0 |
| `offsetU`, `offsetV` | float | Shift of the surface textures | 0.0 |
| `opacity` | float 0 to 1 | How strongly the layer shows inside its mask | 1.0 |
| `normalStrength` | preset name | One of the template's normal-strength presets | `null` |
| `roughLevelsIn`, `roughLevelsOut` | preset names | The template's roughness range presets, input and output | `null` |
| `metalLevelsIn`, `metalLevelsOut` | preset names | The same for metalness | `null` |
| `microblend` | path to `.xbm` | A small detail texture that breaks up the mask edge and adds surface detail | `base\surfaces\microblends\default.xbm` |
| `mbTile` | float | Microblend tiling | 1.0 |
| `microblendContrast` | float 0 to 1 | How hard the microblend cuts into the mask | 0.0 |
| `microblendNormalStrength` | float | How much the microblend adds to the normal | 1.0 |
| `microblendOffsetU`, `microblendOffsetV` | float | Shift of the microblend | 0.0 |
| `overrides` | name | Unknown. MlsetupBuilder always writes `None` | `None` |

Everything named "preset name" is a key into the layer's template, not a value. **Changing a layer's template can leave its preset names pointing at nothing**; EDGEmat must then pick the new template's default and say so (unverified what the game does with an unknown name).

## 3. The `.mltemplate` file

A `Multilayer_LayerTemplate` is a surface and its presets. MlsetupBuilder's data lists about 390 of them, under `base\surfaces\materials\` in folders such as `metal`, `fabric`, `concrete`, `plastic`, `wood`, `paint` (unverified count).

| Part | Holds | Notes |
|---|---|---|
| Textures | Diffuse, normal, roughness and metal maps, usually suffixed `_d`, `_n`, `_r`, `_m`. Missing ones point at `base\surfaces\materials\default\{white,black,gray}.xbm` | Some normal maps are two-channel; the third channel is rebuilt |
| Color presets | Name to RGB (0 to 1). Up to about 900 per template | Names are opaque codes: two six-hex-digit parts joined by `_`, or `null` parts. **They mean nothing to a person** |
| Normal presets | Name to a strength | `null` is the default |
| Roughness presets, In and Out | Name to a pair of numbers | Whether a pair is (min, max) or (multiply, add) is **unknown** |
| Metal presets, In and Out | The same | |
| Tiling | A template-level multiplier, most often 1, sometimes 0.5 to 20 | |
| Default color | The preset a new layer starts with | |

Consequences for EDGEmat:

- **Colors are presets.** A layer can only take a color its template offers (unverified: what the game shows for a name the template lacks). "Make it red" means the nearest red preset in that template, or another template with a better red. Free colors need a custom `.mltemplate` (M5).
- **EDGEmat names colors itself.** It shows each preset as a swatch with a plain name it generates ("dark red", "warm grey") and finds the nearest preset to any color with a perceptual color distance (for example in OKLab). Raw codes stay one click away.

## 4. The `.mlmask` file

A `Multilayer_Mask` holds one greyscale mask per layer: white where the layer shows, black where it does not.

| Fact | Check |
|---|---|
| Mask *i* belongs to layer *i* | Unverified |
| The number of masks is fixed by the mesh's mask set. A setup with more layers than masks has layers that never show; fewer leaves masks unused | Unverified. EDGEmat warns on a mismatch |
| WolvenKit exports a mask set as a folder `<name>_layers\` of images `<name>_<i>` | Unverified |
| Whether masks need a vertical flip against the mesh UVs | **Unknown.** MlsetupBuilder offers a toggle with no settled default |

## 5. How the game blends layers

This is the least known part and the heart of the M4 preview. MlsetupBuilder does not blend layers: its 3D view shows only the selected layer, cut out by its mask, with the template's diffuse texture tinted by the color. It ignores microblends, levels and normal strength. So this section is a hypothesis to test, not a description.

| Step, per layer from 0 up | Hypothesis |
|---|---|
| Coverage | The mask, sharpened by the microblend: roughly, add the microblend to the mask, subtract one, then blend back toward the plain mask by the contrast. Times opacity |
| Color | The template's diffuse texture, tiled by `matTile` times the template tiling and offset, multiplied by the color preset |
| Roughness, metalness | The template's maps remapped by the In and Out level presets |
| Normal | The template's normal at the preset strength, plus the microblend normal at its strength, added to the global normal (a "whiteout" style blend) |
| Result | Each layer's values mixed over the result so far by its coverage |

M4 tests this against in-game screenshots, template by template, and records how close it gets.

## 6. The JSON form and saving

WolvenKit writes CR2W files as JSON. Over its versions an `.mlsetup` has had three shapes; EDGEmat reads all three and writes the current one.

| Shape | How to tell | Where the layers are |
|---|---|---|
| Oldest | No `Header`; a `Chunks` list | `Chunks[0].Properties.layers`, plain values |
| JSON version 0.0.1 | `Header.WKitJsonVersion` is `0.0.1` | `Data.RootChunk.Properties.layers[].Properties` |
| Current (0.0.2 and later) | `Header.WKitJsonVersion` 0.0.2 or later | `Data.RootChunk.layers`; names as `{"$type": "CName", "$storage": "string", "$value": ...}`, paths as `{"DepotPath": {"$type": "ResourcePath", ...}, "Flags": "Default"}` |

| Saving | Behavior for EDGEmat |
|---|---|
| Where | Straight into the WolvenKit project: the binary file at the same game path under `source\archive`, so the next pack picks it up. Optionally the JSON under `source\raw` (unverified which WolvenKit expects for each workflow) |
| How | Through REDbridge: edit the document session (`cr2w.open`, `patch`, `save`) or build from JSON (`cr2w.fromJson`). No WolvenKit.CLI, no version choice for the user |
| Editing a game file | Copy it into the project first, then edit the copy. The archives are never changed |

## 7. Bridge needs

| Need | Exists in REDbridge? | Request |
|---|---|---|
| Read and write `.mlsetup`, `.mltemplate`, `.mlmask`, `.mesh` as JSON | Yes: `cr2w.open`, `getNode`, `patch`, `save`, `cr2w.toJson` | None. Check the JSON shape matches section 6 |
| Textures to PNG, for template maps and microblends | Yes: `texture.toPng` | None |
| A mask set's layers as images | Unverified | `mlmask.toPngs`: one PNG per layer, with the layer count |
| A mesh's materials and appearances, resolved | No: `project.export` exports meshes without materials | `mesh.materials`: per appearance, per submesh, the material name, its base template, and for multilayered ones the setup, mask and global normal paths |
| From an item to its meshes | Unverified | Possibly `item.meshes`, or EDGEmat walks `.app` and `.ent` itself with `cr2w` reads |
| The material library | Partly: `archive.search` lists files | `mltemplate.index`: every template with its texture paths and all presets, in one call, so the library builds in seconds and not one file at a time |
| Mesh to glTF for the preview | Yes: `project.export`, as REDcode's mesh viewer uses | Possibly a variant that writes to a cache and keeps UVs and submesh names |

Requests are filed in REDbridge as issues labelled `request` once the local session confirms what is missing.

## 8. Features: what EDGEmat does with each

From MlsetupBuilder's feature set, sorted by what EDGEmat keeps, changes or drops.

| Feature | EDGEmat | Phase |
|---|---|---|
| Set up paths, extract tens of GB of game files first | **Drop.** REDbridge reads the archives directly; the library builds from the game in the background on first use | M1 |
| Material library with thumbnails, search | Keep, built from the user's game, searched by plain words ("leather", "chrome") | M1 |
| Find a model, then find its setup by hand | **Automate.** Pick an item or mesh; EDGEmat resolves appearances, materials, setups and masks | M2 |
| Several setups open at once | Keep: one editor tab per file, as VS Code does | M2 |
| Layer list: fixed 20 slots, enable slots, swap to reorder, copy and paste by right-click | **Replace** with a real list: add, delete, duplicate, drag to reorder, copy and paste. A warning when the count and the mask set differ | M2, M3 |
| Edits wait for an "Apply edits" button | **Drop.** Edits apply live | M3 |
| No undo | **Add** undo and redo through VS Code | M3 |
| Color swatches with hash names, sorted by brightness | **Improve:** plain names, sorting by hue, "nearest preset to this color", search by color words | M2, M3 |
| A "luminosity" slider that only changes how swatches look | Drop | |
| Roughness, metal and normal presets shown as raw codes and numbers | **Improve:** a few plain choices ("matte", "satin", "glossy") mapped to presets, raw lists one click away | M3 |
| Microblend gallery, packages, custom microblends | Keep the gallery from the game; custom microblends later | M3, M5 |
| Place a microblend visually over the mask | Keep, inside the preview | M4 |
| Show the selected layer's mask on the model | Keep, plus a true blended preview of all layers | M2, M4 |
| Randomize layers in a range | Keep as "Surprise me" on selected layers; also an MCP use ("try three looks") | M3 |
| Export with a JSON version choice and a "compile" checkbox | **Drop.** Saves straight into the project in the current format | M3 |
| Viewport settings: lights, fog, camera, flips, wireframe | Keep a few sensible defaults; the rest behind an "advanced" switch | M4 |
| UV layout image, texture browser | Later, if asked | |
| Mask painting | Unfinished in MlsetupBuilder. A good later feature: paint where a layer shows | Later |
| Material instance editor (`.Material.json`, `.mi` parameters against their template's defaults) | M5, beside `.mi` editing | M5 |
| Hair color profiles (`.hp`, root-to-tip gradients) | Out of scope for now; possibly its own tool | |

## 9. Mistakes not to repeat

Seen in MlsetupBuilder, listed so build sessions check for them. Each is a code reading, not a test.

| What | Correct behavior |
|---|---|
| A new layer's roughness Out takes the roughness In value | Each field keeps its own value |
| Reading the oldest shape, `offsetV` takes the `offsetU` value | Each offset keeps its own value |
| `overrides` is always written as `None`, whatever was read | Keep the value read, until we know what it does |
| Roughness In is shown but always written as `null` | Write what the user set, or do not show it |
| An unknown color name silently shows as grey | Say that the template has no such color, and offer the nearest |

## 10. Workflows to support

| Workflow | In EDGEmat |
|---|---|
| Recolor a game garment | Search the item, pick the appearance, click a part of the model or a layer, pick a color. It saves into the project; pack with REDcode. Or tell the assistant |
| Change a surface | Pick a layer, pick another template ("leather" to "worn chrome"); presets reset to the new template's defaults, with a note |
| Start from a blank setup | New setup for a mask set: one layer per mask, all set to the unused template |
| Try ideas | "Surprise me" on chosen layers, then refine |
| Check before packing | The preview, and a list of warnings: unknown preset names, layer and mask counts that differ |

## Checklist for the local session

Run against the real game through REDbridge (`cr2w_read`, `texture_to_png`, `archive_search` from `redcode-mcp` will do). Mark each row of this page **confirmed** or **corrected**, with the date.

| # | Check | How |
|---|---|---|
| 1 | The chain in section 1 | Pick a common jacket; read its `.app` or `.ent`, its `.mesh`, one multilayered material, and confirm the `MultilayerSetup`, `MultilayerMask` and `GlobalNormal` parameters |
| 2 | Every field in section 2, its type and default | Read a few game `.mlsetup` files as JSON |
| 3 | The largest layer count in the game | `archive_search` for `.mlsetup`, read a sample, count layers |
| 4 | Section 3: what an `.mltemplate` holds, where the presets live, how names look | Read `base\surfaces\materials\special\unused.mltemplate` and a fabric and a metal template |
| 5 | Whether roughness and metal pairs are (min, max) or (multiply, add) | Compare presets across templates; then test in game in M4 |
| 6 | Mask count against layer count, and mask order | Read a garment's `.mlmask` next to its `.mlsetup`; export the mask layers to PNG |
| 7 | What the game does with a color name the template lacks | Set one in a copy, pack, look in game |
| 8 | Which JSON shape REDbridge writes and reads | `cr2w_read` an `.mlsetup`; compare with section 6 |
| 9 | Where WolvenKit expects an edited `.mlsetup` in a project | Save one under `source\archive` and pack; check it loads |
| 10 | Which bridge methods in section 7 really are missing | Try each with the existing tools; file the rest as requests |
