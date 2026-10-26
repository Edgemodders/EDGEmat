# Multilayered materials: behavior <span class="y">spec</span>

What EDGEmat must understand and do to edit Cyberpunk 2077's multilayered materials. This is phase M0's spec: build sessions work from this page, not from MlsetupBuilder's source.

**Status: draft 0.2, checked against the game, agreed with the owner on 2026-10-16.** Draft 0.1 was written on 2026-10-14 from a study of MlsetupBuilder 1.6.9 (commit `4271e8c`) and community knowledge, in a cloud session with no game install. Draft 0.2 (2026-10-15) is that draft checked on the dev PC: every row read against real files through REDbridge (0.7.0, then 0.8.0; WolvenKit 9.1.0) and marked confirmed or corrected, and the open questions tested in game through in-game tests and REDnode ([checklist](#checklist-for-the-local-session)). What is still unknown is marked so, with the reason. Field names, game paths and numbers are facts about the game and WolvenKit's JSON; everything else is our own description.

## How this page is used

| Rule | |
|---|---|
| Build sessions read this page, never MlsetupBuilder's source | Questions go back to a spec session, which answers them here |
| A claim is only trusted once checked | The Check column says how. The local session marks each row **confirmed** or **corrected** with the date |
| MlsetupBuilder is a reference, not the authority | Where it and the game disagree, the game wins. Its known bugs are listed so we do not copy them by accident |

## Test set

Chosen by the owner on 2026-10-14: garments modders often recolor, all with many layers.

| Garment | Mesh | Setups | Layers used | Notes |
|---|---|---|---|---|
| Arasaka samurai jacket | `base\characters\garment\corp_arasaka\torso\t2_078_jacket__samurai\t2_078_ma_jacket__samurai.mesh` | 9 | 14 of 20 | NPC only: worn through `corpo__arasaka_*.app`, not a player item. 5 submeshes, 4 LODs |
| Sneakers | `base\characters\garment\player_equipment\feet\s1_055_shoe__converse\s1_055_pma_shoe__converse.mesh`, and `_pwa_` | 17 | 20 of 20 | `s1_casual_01.app`: the high-tops `Items.CasualShoes_01_basic_01` to `_05`, `_old_01`, `_old_02` ("Sunny Ammo synthetic high-tops" and others) and `Items.Q001_Shoes` ("V's Sneakers"). Both body types use the same setups and mask. The in-game test garment |
| Jeans | `base\characters\garment\player_equipment\legs\l1_062_pants__jeans\l1_062_pma_pants__jeans.mesh` | 18 | 20 of 20 | `l1_pants_03.app`: `Items.Pants_03_*` ("Sturdy-stitched punk jeans" and others) and `Items.Q001_Pants` ("V's Pants"). Masculine body only; the feminine body wears `l1_066 rogue` pants in the same items |

"Layers used" counts layers whose template is not `unused.mltemplate`.

## 1. From an item to its layers

A garment reaches its multilayered material through a chain. "Make this jacket red" has to walk it.

| Step | What holds the link | Check |
|---|---|---|
| Item to entity | The item's TweakDB record names an `entityName` and an `appearanceName`. For clothing the entity name is a row in `base\gameplay\factories\items\clothing.csv` (a `C2dArray`: name, path, preload), which gives a slot's root entity such as `base\gameplay\items\equipment\feet\player_feet_item.ent` | **Corrected** 2026-10-14; the record **confirmed** 2026-10-15 through REDbridge 0.8.0 `tweakdb.records` ([REDbridge #4](https://github.com/Edgemodders/REDbridge/issues/4)): for example `Items.CasualShoes_01_basic_01` has `entityName` `player_feet_item`, `appearanceName` `s1_casual_01_basic_01_`, `equipArea` `EquipmentArea.Feet` and the name "Sunny Ammo synthetic high-tops". 1,997 clothing records; the first TweakDB load took 14 s |
| Record to entity row | The record's `appearanceName` plus `&Male` or `&Female` is the `name` of a row in the root entity's `appearances`: `s1_casual_01_basic_01_&Male` gives `s1_casual_01.app`, appearance `basic_01_m` | **Confirmed** 2026-10-15 on all 16 `s1_casual_01` rows |
| Entity to `.app` | The root entity's `appearances` list one row per item appearance: `appearanceName` and an `appearanceResource`, a per-item `.app` under `base\characters\appearances\player\items\<slot>\`, for example `s1_casual_01.app` | **Confirmed** 2026-10-14 |
| `.app` appearance to mesh | A player item's `.app` appearance (`basic_01_m`, `old_02_w`...) has `partsValues` (a parts `.ent` beside the garment folder, holding the garment mesh component) and `partsOverrides` that set the component's `meshAppearance`. The `.app` also carries the resolved `components`. An NPC's `.app` (for example `corpo__arasaka_mah.app`) holds the garment mesh component directly in `components`, with no parts `.ent` | **Corrected** 2026-10-14. The spec had one link "item to appearance"; there are two shapes, player and NPC Used by EDGEmat's Find on 2026-10-17: the resolved `components` carry each mesh component's `mesh` and `meshAppearance` with the overrides already applied, so Find reads them first and falls back to the parts. **Confirmed** on the sneakers and jeans, both bodies |
| Body type | Player appearances end in `_m` or `_w`. They can point at different meshes (`_pma_`, `_pwa_`), and even at a different garment: the l1_062 jeans item uses `l1_066` pants on the feminine body | **Confirmed** 2026-10-14 |
| Mesh appearance to material | A `.mesh` has named `appearances`. Each lists `chunkMaterials`: one material name per render chunk, **across all LODs** (the jacket: 5 submeshes × 4 LODs = 20 names). `renderResourceBlob.header.renderChunkInfos[i].lodMask` tells which LOD a chunk belongs to | **Corrected** 2026-10-14. Not one name per submesh |
| Material name to material | `materialEntries` rows: `name`, `index`, `isLocalInstance`. A local one is `localMaterialBuffer.materials[index]`, an external one is `externalMaterials[index]` (a `.mi` path). Entry names are free text: the sneaker mesh calls its main material `ml_s1_001_...` | **Confirmed** 2026-10-14 for local materials (all three test meshes are all local). External `.mi` chains are **unverified**: none in the test set |
| Material to template | Each material has a `baseMaterial`. Multilayered ones use `engine\materials\multilayered.mt`. The same parameters exist on `base\materials\vehicle_destr_blendshape.mt` and `base\fx\_shaders\sandevistan_multilayer.mt`. A garment mixes multilayered materials with others: `metal_base.remt` for decals and lights, `base\materials\mesh_decal.mt` to hide parts (the jacket's `no_bags` appearance) | **Confirmed** 2026-10-14. Whether a `.mi` can stand between a mesh and `multilayered.mt` is **unverified** |
| Material to setup and mask | A multilayered material's `values` include `MultilayerSetup` (a `.mlsetup`), `MultilayerMask` (a `.mlmask`) and `GlobalNormal` (a normal texture), in any order. `multilayered.mt` also has `GlobalNormalIntensity` (1), `GlobalNormalUVScale` (1, 1) and `GlobalNormalUVBias` (0, 0) | **Confirmed** 2026-10-14, plus the three extra parameters |
| Two submeshes, one setup | Several materials can share one setup and mask: the jacket's body and its bags are two submeshes with two material entries, both pointing at the same `.mlsetup` and `.mlmask` | **Confirmed** 2026-10-14 |
| Defaults | `multilayered.mt` defaults to `engine\materials\defaults\multilayer_default.mlsetup` and `.mlmask`, and `GlobalNormal` to `engine\textures\editor\normal.xbm` | **Confirmed** 2026-10-14 |

WolvenKit's mesh export can write a material file beside the model (`<name>.Material.json`) that answers the mesh steps in one file (**unverified**, not tried). It is not needed: reading `appearances`, `materialEntries` and `localMaterialBuffer.materials` from a mesh through `cr2w_read` takes about 40 ms.

Naming patterns that help finding: masks are named `ml_<mesh>_masksset.mlmask` and setups `ml_<mesh>_<look>.mlsetup` in the garment's `textures\` folder, though some setups have plain names (`corduroy_black.mlsetup`) and one sneaker mask set is called `ml_songbird_masksset`. Mesh names carry body type and slot: `_pma_`/`_pwa_` (player), `_ma_`/`_mb_`/`_mm_` and so on (NPC bodies), `t1_`/`t2_` torso layers, `h0_`-`h2_` head, `l1_` legs, `s1_` feet, `a0_` arms. **Confirmed** 2026-10-14 on the test set and the player garment folders.

## 2. The `.mlsetup` file

A `Multilayer_Setup` is an ordered list of layers. Layer 0 is the base: its mask is solid white in all three test mask sets. Later layers draw over earlier ones where their masks allow (draw order **unverified**; checked in game by test R1-B).

The game has **17,734** `.mlsetup` files. All were read on 2026-10-14; the numbers below come from that scan.

| Root field | Type, engine default | Meaning | Check |
|---|---|---|---|
| `layers` | array of `Multilayer_Layer` | The layers, in order. **At most 20**: 9,310 setups have exactly 20, none has more. Counts run from 1 to 20 | **Confirmed** 2026-10-14 |
| `ratio` | Float, 1 | 1 in 95% of setups; other values from 0.5 to 2. **Changes how microblends map onto the mesh.** At 4, a microblend used as a printed graphic (`graphics_logos_004.xbm`, a square atlas of 16 graphics, at `mbTile` 0.4) showed a different part of its image: the skull's face instead of the halo rays around it. Every mask edge stayed put | **Corrected** 2026-10-15 (in-game test R2). Unverified: whether it is a scale, a shift or an aspect change (the name suggests aspect), and whether it also affects the surface textures |
| `useNormal` | Bool, true | True in every game setup. Meaning assumed from the name | **Confirmed** type and value 2026-10-14; effect unverified |
| `cookingPlatform` | enum, `PLATFORM_PC` in game files | | **Confirmed** 2026-10-14 |

"Engine default" is the type's default, the value the binary file leaves out. WolvenKit's JSON writes every field anyway.

| Layer field | Type, engine default | Meaning | In the game | Check |
|---|---|---|---|---|
| `material` | path to `.mltemplate`, empty | The surface: leather, chrome, denim | Empty slots use `base\surfaces\materials\special\unused.mltemplate` (11% of all layers). 377 of the 386 templates are used | **Corrected** 2026-10-14: the engine default is empty; `unused.mltemplate` is the game's convention |
| `colorScale` | preset name, `None` | One of the template's color presets | See section 3 for name shapes | **Corrected** 2026-10-14: default `None`; templates default to `null_null` |
| `matTile` | Float, 1 | Tiling of the surface textures, multiplied by the template's `tilingMultiplier` (multiplying **unverified**) | 0 to 300 | **Confirmed** type and default 2026-10-14 |
| `offsetU`, `offsetV` | Float, 0 | Shift of the surface textures | 0 to 1 | **Confirmed** 2026-10-14 |
| `opacity` | Float, 1 | How strongly the layer shows inside its mask | **0 to 4**; 30% of layers are 0 | **Corrected** 2026-10-14: not limited to 0 to 1. What values above 1 do is unverified |
| `normalStrength` | preset name, `None` | One of the template's normal-strength presets | `null` or a 6-hex name | **Corrected** 2026-10-14: default `None` |
| `roughLevelsIn`, `roughLevelsOut` | preset names, `None` | Roughness levels, input and output (section 3) | `roughLevelsIn` is `null` in every game layer | **Corrected** 2026-10-14: default `None` |
| `metalLevelsIn`, `metalLevelsOut` | preset names, `None` | The same for metalness | `metalLevelsIn` is `null` in all but 33 layers | **Corrected** 2026-10-14: default `None` |
| `microblend` | path to `.xbm`, empty | A small detail texture that breaks up the mask edge and adds surface detail | 144 distinct; `base\surfaces\microblends\default.xbm` in 56% of layers | **Corrected** 2026-10-14: the engine default is empty |
| `mbTile` | Float, 1 | Microblend tiling | 0 to 400 | **Confirmed** 2026-10-14 |
| `microblendContrast` | Float, **0.5** | How hard the microblend cuts into the mask | 0 to 1; mostly 1 | **Corrected** 2026-10-14: default 0.5, not 0 |
| `microblendNormalStrength` | Float, 1 | How much the microblend adds to the normal | **-6.59 to 7**; mostly 0 | **Corrected** 2026-10-14: negative and large values occur |
| `microblendOffsetU`, `microblendOffsetV` | Float, 0 | Shift of the microblend | 0 to 1 | **Confirmed** 2026-10-14 |
| `overrides` | name, `None` | `None` in every layer but 12. Those 12 (one file, `...\meat_factory\combined\textures\ml_maelstrom_factory_floor_b.mlsetup`) have all six preset names `None` and `overrides` = `null_null_null_null_null_null_null`: seven parts, the six names joined (`colorScale` has two). The hypothesis that it is one name selecting all six presets at once **did not hold** in game | **Corrected** 2026-10-15 (in-game test R1-C): a layer with all six names `None` and `overrides` = `<green preset>_null_null_null_null_null` showed no green; the layer was not drawn at all, and the layers below it showed through. What `overrides` does stays **unknown**. EDGEmat keeps the value it reads and never writes `None` into a preset name |

Everything named "preset name" is a key into the layer's template, not a value. **Changing a layer's template can leave its preset names pointing at nothing.** The game itself ships a few such names: of 264,000 layers, besides the twelve `None` layers above, 7 color names, 6 roughness Out names and 33 metal In names are missing from their template (for example `17687b_null` on `gold_polished_01_300.mltemplate`). **What the game shows** (in-game test R1-A, 2026-10-15): a color name the template lacks renders the layer **white or near-white**, not the template's default (mid grey for `null_null`) and not the previous color. With **all six** names `None` the layer is not drawn at all (R1-C). One test each, on one garment.

## 3. The `.mltemplate` file

A `Multilayer_LayerTemplate` is a surface and its presets. The game has **386**, under `base\surfaces\materials\` (metal 105, fabric 53, concrete 44, plastic 34, wood 19, terrain 35, and smaller folders), plus `engine\materials\defaults\multilayer_default.mltemplate`. **Corrected** 2026-10-14 (the draft said about 390).

| Field | Holds | Check |
|---|---|---|
| `colorTexture`, `normalTexture`, `roughnessTexture`, `metalnessTexture` | Paths, usually suffixed `_d`, `_n`, `_r`, `_m`. Missing ones point at `base\surfaces\materials\default\`: `default_d.xbm` (11 templates, one more uses `debug_d.xbm`), `default_n.xbm` (28), `white`, `gray` or `black.xbm` for roughness (22). **Metalness is mostly a default**: `black.xbm` in 241 templates, `white.xbm` in 109; only 36 have their own map | **Corrected** 2026-10-14: metal maps are rare, and the defaults include `default_d` and `default_n` |
| Normal maps | Two-channel: red and green hold X and Y, blue is 0, so Z is rebuilt | **Confirmed** 2026-10-14 on `silk_clean_01_30_n.xbm`; one sample |
| Diffuse | The sampled diffuse (`silk_clean_01_30_d.xbm`) is near-grey: detail and shading, with the color coming from the preset | One sample, 2026-10-14. Check more in M5 |
| `tilingMultiplier` | A template-level tiling: 1 in 307 templates; others from 0.5 to 20 | **Confirmed** 2026-10-14 |
| `overrides` | **The preset tables.** `colorScale`: rows `{ n, v: [r, g, b] }`. `normalStrength`: rows `{ n, v }`, one float. `roughLevelsIn`, `roughLevelsOut`, `metalLevelsIn`, `metalLevelsOut`: rows `{ n, v: [a, b] }` | **Corrected** 2026-10-14: the draft did not name where presets live |
| `defaultOverrides` | The default selection: one name for each of the six lists (`colorScale`, `normalStrength`, the four levels). Every default exists in its list | **Corrected** 2026-10-14: a default for all six, not only the color |
| `colorMaskLevelsIn`, `colorMaskLevelsOut` | Two pairs of floats per template. 259 templates have `[1, 0]` and `[0, 0]`; the rest vary. Meaning **unknown**; a name suggests a mask that limits where the color applies | New, 2026-10-14. Unverified |

Preset counts and values, from all 386 templates:

| List | Per template | Names | Values |
|---|---|---|---|
| `colorScale` | 1 to **1,017** (mean 402) | Two parts joined by `_`, each six hex digits or `null`: `hex_hex` (130,208), `hex_null` (22,939), `null_hex` (1,566), `null_null` (one per template). **They mean nothing to a person** | RGB from **0 to 2**, not 0 to 1. `null_null` is usually mid grey (0.5, 0.5, 0.5) |
| `normalStrength` | 1 to 9 | Six hex digits, or `null` | 0 to about 1.7. `null` is 1 in 212 templates but not always (0.5, 0.2, 0.15...): **`null` is not always neutral** |
| `roughLevelsIn` | 1 to 3 | Six hex digits, or `null` | See below |
| `roughLevelsOut` | 1 to 16 | | |
| `metalLevelsIn` | always 1 (`null`) | | |
| `metalLevelsOut` | 1 to 7 | | |

**Corrected** 2026-10-14: the draft said colors are 0 to 1 and up to about 900 per template.

### Level pairs are (scale, bias)

The draft asked whether a level pair `[a, b]` is (min, max) or (multiply, add). The game's own presets answer it: **`out = a × in + b`**. Checked on 2026-10-14 from all 5,534 level presets in the game:

| Evidence | |
|---|---|
| The neutral preset `null` is `[1, 0]` in nearly every template | The identity for scale and bias. As (min, max) it would be an inverted range |
| Common In presets are exact Photoshop-style levels | `[1.821, -0.429]` is 255/140 and -60/140: input 60..200 stretched to 0..1. `[2.143, -1.143]`, `[4.25, -2]` and others fit the same form |
| Metal Out presets `[0, 0.25]`, `[0, 0.5]`, `[0, 0.75]`, `[0, 1]`, `[0, 0]` | Under scale and bias: constant metalness 0.25, 0.5, 0.75, 1, 0. A natural preset set. As ranges they would be inverted ranges |
| No metal Out pair has `a + b > 1` | The output stays inside 0..1 under scale and bias |

So for EDGEmat: an In preset stretches the texture's contrast; an Out preset maps the result into a range. Read as levels, an Out pair `[a, b]` covers `b` to `a + b`. **Confirmed from data** 2026-10-14. The order of In and Out, and any clamping, is tested in M5 against in-game screenshots. The same form likely applies to `colorMaskLevelsIn/Out` (unverified).

Consequences for EDGEmat:

- **Colors are presets.** A layer can only take a color its template offers. "Make it red" means the nearest red preset in that template, or another template with a better red. Free colors need a custom `.mltemplate` (M6). What the game shows for a name the template lacks: checklist item 7.
- **EDGEmat names colors itself.** It shows each preset as a swatch with a plain name it generates ("dark red", "warm grey") and finds the nearest preset to any color with a perceptual color distance (for example in OKLab). Raw codes stay one click away. Swatches must allow values above 1 (bright, not just saturated).
- **Roughness and metal in plain words** come from the pairs: an Out preset with `a = 0` is a fixed value ("fully metal", "matte"); others are ranges.

## 4. The `.mlmask` file

A `Multilayer_Mask` holds one greyscale mask per layer: white where the layer shows, black where it does not. The masks are stored as a tiled atlas in `renderResourceBlob`; its header has `numLayers`, `maskWidth` and `maskHeight` (1024 × 1024 in the test set, with a 512 × 512 low version) and `maskTileSize` (14).

| Fact | Check |
|---|---|
| Mask *i* belongs to layer *i* | Supported by data 2026-10-14: mask 0 is solid white (the base) in all three test sets, and a sneaker mask shaped like the sole (mask 7) belongs to a rubber layer. **Confirmed** in game 2026-10-15 (R1-B): recoloring layer 7 turned exactly the sole and rubber band red |
| The mask count is in the mask set's header (`numLayers`), 20 for all three test sets. Setups that share the mask had 20 layers, except one sneaker setup with 19. A setup with more layers than masks has layers that never show; fewer leaves masks unused | Count **confirmed** 2026-10-14. What the game does with more layers than masks is unverified. EDGEmat warns on a mismatch |
| WolvenKit exports a mask set as a folder `<name>_layers\` of images `<name>_<i>.png`, plus `<name>.masklist` listing them | **Confirmed** 2026-10-14 through REDbridge's `project.export` |
| **No vertical flip** between WolvenKit's mask PNGs and the UVs in WolvenKit's glTF export: image row = V × height | **Confirmed** 2026-10-14 by rasterizing each test mesh's UV islands and measuring how much of each mask falls inside them, as-is and flipped. As-is wins clearly on the sneakers and jeans (most masks 80 to 100% inside, against 55 to 75% flipped) and overall on the jacket (once both of its multilayered submeshes are included) |

## 5. How the game blends layers

This is the least known part and the heart of the M5 preview. MlsetupBuilder does not blend layers: its 3D view shows only the selected layer, cut out by its mask, with the template's diffuse texture tinted by the color. It ignores microblends, levels and normal strength. So this section is a hypothesis to test, not a description.

| Step, per layer from 0 up | Hypothesis |
|---|---|
| Coverage | The mask, sharpened by the microblend: roughly, add the microblend to the mask, subtract one, then blend back toward the plain mask by the contrast. Times opacity |
| Color | The template's diffuse texture, tiled by `matTile` times the template tiling and offset, multiplied by the color preset |
| Roughness, metalness | The template's maps through the In preset, then the Out preset, each `a × x + b` (section 3) |
| Normal | The template's normal at the preset strength, plus the microblend normal at its strength, added to the global normal (a "whiteout" style blend) |
| Result | Each layer's values mixed over the result so far by its coverage |

Observed on 2026-10-14 and 15, for M5: a microblend texture (`fine_filth.xbm`) holds a normal in red and green and a mask in alpha; a microblend can also be a graphic atlas used as a print (`graphics_logos_004.xbm` at a low `mbTile`, cutting a layer like a stencil); `ratio` changes the microblend mapping (section 2); the template diffuse sampled is near-grey; `colorMaskLevels` has no place in the hypothesis yet.

**Measured 2026-10-26** on the Comfy rocker slim-fits' `leather.mlsetup` against the owner's in-game screenshot: the masks are painted for a threshold. The piping layer's mask sits near 0.65 with `default.xbm` (its alpha a flat 0.41) and shows solid black; the denim layer's sits near 0.55 with `lint_01.xbm` (alpha black but for specks) at `microblendContrast` 0 and hardly shows; the base covers the rest. Both fit "a layer shows where its mask plus the microblend's alpha is over 1", which EDGEmat's color map uses since then, with a soft band of 0.05 above 1 and the microblend tiled by `mbTile` and offset. Not used yet, unverified: `microblendContrast` (layers at 0 and at 0.56 both behave as the rule says), `ratio`, and a layer with no microblend (drawn by its mask alone).

M5 tests this against in-game screenshots, template by template, and records how close it gets.

## 6. The JSON form and saving

WolvenKit writes CR2W files as JSON. Over its versions an `.mlsetup` has had three shapes; EDGEmat reads all three and writes the current one.

| Shape | How to tell | Where the layers are | Check |
|---|---|---|---|
| Oldest | No `Header`; a `Chunks` list | `Chunks[0].Properties.layers`, plain values | Unverified: needs an old WolvenKit file |
| JSON version 0.0.1 | `Header.WKitJsonVersion` is `0.0.1` | `Data.RootChunk.Properties.layers[].Properties` | Unverified: needs an old WolvenKit file |
| Current (0.0.2 and later) | `Header.WKitJsonVersion` 0.0.2 or later | `Data.RootChunk.layers`; names as `{"$type": "CName", "$storage": "string", "$value": ...}`, paths as `{"DepotPath": {"$type": "ResourcePath", ...}, "Flags": "Default"}` | **Confirmed** 2026-10-14: REDbridge (WolvenKit 9.1.0) writes `0.0.9` for all 17,734 setups in this shape |

| Saving | Behavior for EDGEmat | Check |
|---|---|---|
| Where | The binary file at the same game path under the project's `source\archive`. `source\raw` is not needed for an `.mlsetup` | Written and packed 2026-10-14 |
| The project's `packed` folder | WolvenKit owns it: its Pack clears the folder first. EDGEmat never writes its own files there | **Confirmed** 2026-10-15: test archives kept in `packed` were deleted by a WolvenKit Pack |
| **Replacing a game setup in place** | **Has no effect in the game unless the "Material Texture Override" mod (MTO) is installed.** WolvenKit says so when packing a project that holds a base-game `.mlsetup`. Two routes for a recolor: edit the game's setup in place and require MTO, or save a **new** setup at a new path and point the mesh's material at it (a copy of the mesh, or an ArchiveXL patch), which needs no MTO and is how most recolor mods ship | **Corrected** 2026-10-15. Seen in game through REDnode: our archive mounted and its new-path file loaded (`ratio` 7), but every replaced setup loaded the game's own copy (a marker setup kept `ratio` 0.63, not our 4), whether or not the archive was in `modlist.txt`. Other mods' replacements of other file types worked. **With MTO installed** (Nexus mod 25246, version 0.2, archive only: 148 game setups) the marker read 4 and the edits showed on the shoe, **confirmed** 2026-10-15 |
| How | Through REDbridge: edit the document session (`cr2w.open`, `patch`, `save`), the one-call `cr2w_edit_file` with a game path and an output file, or build from JSON (`cr2w.fromJson`). No WolvenKit.CLI, no version choice for the user. A CName may be given as a plain string | **Confirmed** 2026-10-14: eight sneaker setups edited from game paths with `cr2w_edit_file`, read back with every edit in place, packed with `project.pack` |
| Editing a game file | Copy it into the project first, then edit the copy. The archives are never changed | **Confirmed** 2026-10-14 (`cr2w_edit_file` with a game path writes only the copy) |

## 7. Bridge needs

Checked on 2026-10-14 by doing each one with the existing tools.

| Need | Exists in REDbridge? | Request |
|---|---|---|
| Read and write `.mlsetup`, `.mltemplate`, `.mlmask`, `.mesh` as JSON | Yes: `cr2w.open`, `getNode`, `patch`, `save`, `cr2w.toJson`. **Confirmed**; the shape matches section 6 | None |
| Textures to PNG, for template maps and microblends | Yes: `texture.toPng`. **Confirmed** on a diffuse, a normal map and a microblend | None |
| A mask set's layers as images | Yes: `project.export` on an `.mlmask` writes one PNG per layer and a `.masklist`. **Confirmed**. It needs the mask copied under an "archive" folder first; EDGEmat's cache can use that layout | None |
| A mesh's materials and appearances, resolved | Yes, by reading the mesh: `cr2w_read` of `appearances`, `materialEntries`, `localMaterialBuffer.materials` takes about 40 ms. **Confirmed** | None. EDGEmat resolves the chain itself in `core` |
| From an item to its meshes | **Yes, since REDbridge 0.8.0.** The record (`entityName`, `appearanceName`, `displayName` with its text, `equipArea`) comes from `tweakdb.records`; everything after it is CR2W and CSV reads (section 1). **Confirmed** 2026-10-15 on the dev PC: 1,997 clothing records with those flats and their names in 14 s, most of it the first TweakDB load | [REDbridge #4](https://github.com/Edgemodders/REDbridge/issues/4), shipped in 0.8.0 on 2026-10-15. Also the redcode-mcp tools `tweakdb_records` and `tweakdb_record` |
| The material library | Yes: `archive.search` finds the 386 templates and `cr2w.toJson` reads them all in **4 seconds** | None. The draft's `mltemplate.index` is not needed |
| Mesh to glTF for the preview | Yes: `project.export`; keeps UVs and names primitives `submesh_NN_LOD_N` | None |

## 8. Features: what EDGEmat does with each

From MlsetupBuilder's feature set, sorted by what EDGEmat keeps, changes or drops. This section describes MlsetupBuilder, not the game; the M0 check does not apply to it.

| Feature | EDGEmat | Phase |
|---|---|---|
| Set up paths, extract tens of GB of game files first | **Drop.** REDbridge reads the archives directly; the library builds from the game in the background on first use | M1 |
| Material library with thumbnails, search | Keep, built from the user's game, searched by plain words ("leather", "chrome") | M1 |
| Find a model, then find its setup by hand | **Automate.** Pick an item or mesh; EDGEmat resolves appearances, materials, setups and masks | M2 |
| Several setups open at once | Keep: one editor tab per file, as VS Code does | M2 |
| Layer list: fixed 20 slots, enable slots, swap to reorder, copy and paste by right-click | **Replace** with a real list: add, delete, duplicate, drag to reorder, copy and paste. A warning when the count and the mask set differ. Reordering a layer means moving its mask too, since mask *i* belongs to layer *i* | M2, M3 |
| Edits wait for an "Apply edits" button | **Drop.** Edits apply live | M3 |
| No undo | **Add** undo and redo through VS Code | M3 |
| Color swatches with hash names, sorted by brightness | **Improve:** plain names, sorting by hue, "nearest preset to this color", search by color words | M2, M3 |
| A "luminosity" slider that only changes how swatches look | Drop | |
| Roughness, metal and normal presets shown as raw codes and numbers | **Improve:** a few plain choices ("matte", "satin", "glossy", "fully metal") mapped to presets through the scale and bias reading (section 3), raw lists one click away | M3 |
| Microblend gallery, packages, custom microblends | Keep the gallery from the game (144 microblends used); custom microblends later | M3, M6 |
| Place a microblend visually over the mask | Keep, inside the preview | M5 |
| Show the selected layer's mask on the model | Keep, plus a true blended preview of all layers | M2, M5 |
| Randomize layers in a range | Keep as "Surprise me" on selected layers; also an MCP use ("try three looks") | M3 |
| Export with a JSON version choice and a "compile" checkbox | **Drop.** Saves straight into the project in the current format | M3 |
| Viewport settings: lights, fog, camera, flips, wireframe | Keep a few sensible defaults; the rest behind an "advanced" switch. No mask flip switch: section 4 found none is needed | M5 |
| UV layout image, texture browser | Later, if asked | |
| Mask painting | Unfinished in MlsetupBuilder. A good later feature: paint where a layer shows | Later |
| Material instance editor (`.Material.json`, `.mi` parameters against their template's defaults) | M6, beside `.mi` editing | M6 |
| Hair color profiles (`.hp`, root-to-tip gradients) | Out of scope for now; possibly its own tool | |

## 9. Mistakes not to repeat

Seen in MlsetupBuilder, listed so build sessions check for them. Each is a code reading, not a test.

| What | Correct behavior |
|---|---|
| A new layer's roughness Out takes the roughness In value | Each field keeps its own value |
| Reading the oldest shape, `offsetV` takes the `offsetU` value | Each offset keeps its own value |
| `overrides` is always written as `None`, whatever was read | Keep the value read. It is set in at least one game file (section 2) |
| Roughness In is shown but always written as `null` | Write what the user set, or do not show it. (Every game layer does use `null` for roughness In) |
| An unknown color name silently shows as grey | Say that the template has no such color, and offer the nearest. The game itself shows such a layer white (R1-A), so a wrong name is visible in game but easy to miss in an editor |
| Writing `None` into preset names | Never. A layer whose names are all `None` is not drawn (R1-C) |
| Opacity and colors limited to 0..1 | The game uses opacity up to 4 and color values up to 2 (sections 2 and 3). Keep the ranges the game uses |

## 10. Workflows to support

| Workflow | In EDGEmat |
|---|---|
| Recolor a game garment | Search the item, pick the appearance, click a part of the model or a layer, pick a color. It saves into the project; pack with REDcode. Or tell the assistant. The appearance decides the setup: on the sneakers each look (`basic_01`, `old_02`...) has its own `.mlsetup`, so recoloring one look leaves the others alone |
| Use a setup from anywhere | Open a setup from any folder, as WolvenKit JSON, or from inside a mod's `.archive`; inspect it, change it if wanted, then Save to Project at a game path EDGEmat suggests. The original file is never written ([design](../design.html#open-any-file-then-save-it-into-a-project)) |
| Change a surface | Pick a layer, pick another template ("leather" to "worn chrome"); all six preset names reset to the new template's `defaultOverrides`, with a note |
| Start from a blank setup | New setup for a mask set: one layer per mask (`numLayers`), all set to `unused.mltemplate`, as the game fills empty slots |
| Try ideas | "Surprise me" on chosen layers, then refine |
| Check before packing | The preview, and a list of warnings: unknown preset names, layer and mask counts that differ |

## In-game tests

A WolvenKit project outside the repo, `Projects\EDGEmat_M0`, built on 2026-10-14 through REDbridge. Each round is one archive. The edits apply to the eight sneaker setups worn by the player appearances in `s1_casual_01.app` (`basic_01` to `basic_05`, `old_01`, `old_02`, `_q001__start_m`), so any of these sneakers shows them, on either body type. In game they are the high-tops `Items.CasualShoes_01_basic_01` to `_basic_05`, `_old_01` and `_old_02`, for example "Sunny Ammo synthetic high-tops" (`basic_01`), and, on the masculine body only, "V's Sneakers" (`Items.Q001_Shoes`).

| Test | Round | Edit | What it answers |
|---|---|---|---|
| R1-A | 1 | Layer 4 (the upper half of the shoe's top panels) `colorScale` = `edgemat_unknown`, a name no template has; opacity 1 | Item 7: what the game shows for an unknown color name |
| R1-B | 1 | Layer 7 (the sole and rubber band, mask 7) `colorScale` = the template's reddest preset; opacity 1 | Mask order: mask *i* belongs to layer *i* |
| R1-C | 1 | Layer 9 (the toe cap) all six preset names `None`, `overrides` = `<greenest preset>_null_null_null_null_null`; opacity 1 | What `overrides` does |
| R1 | 1 | Packed from `source\archive` | Item 9: an edited `.mlsetup` there loads |
| R2 | 2 | `ratio` = 4 on the unedited setups | What `ratio` does |

Results so far:

| Date | What happened |
|---|---|
| 2026-10-15 | R1 and a blunter test (R1b: every layer but the base hidden, base bright green) showed no change on the sneakers. Read through REDnode in the running game: V wears `s1_055_pwa_shoe__converse.mesh`, appearance `red_yellow_graphic`; our archive is mounted; a file only our archive has loads; every replaced setup loads the game's copy. WolvenKit then named the cause: replaced base-game setups need the Material Texture Override mod |
| 2026-10-15 | **R1 with MTO**, on the "Sunny Ammo synthetic high-tops" (`red_yellow_graphic`, feminine body). R1-B: the sole and rubber band turned red, so mask order holds. R1-A: the collar lining (layer 4, unknown color name) turned white. R1-C: the toe cap's black layer vanished, no green, so `overrides` is not a combined selection in this form. Item 9 confirmed |
| 2026-10-15 | **R2 with MTO**, same shoe. REDnode read `ratio` 4 from the loaded setup. The side panel's printed graphic, a microblend on layer 10, showed a different part of its image: the hooded skull's face where its halo rays had been. Masks, sole, toe cap and stripes unchanged. M0's in-game tests are done |
| 2026-10-15 | Side findings. In the running game, a loaded setup shows its `ratio` and `useNormal` to scripts but not its layers, so a runtime tool cannot read or change layers through the game's script API. REDdeck had a bug writing `modlist.txt`, fixed the same day by REDdeck's session |

## Checklist for the local session

Run against the real game through REDbridge (`cr2w_read`, `texture_to_png`, `archive_search` from `redcode-mcp` will do). Mark each row of this page **confirmed** or **corrected**, with the date.

| # | Check | How | Result |
|---|---|---|---|
| 1 | The chain in section 1 | Pick a common jacket; read its `.app` or `.ent`, its `.mesh`, one multilayered material, and confirm the `MultilayerSetup`, `MultilayerMask` and `GlobalNormal` parameters | Done 2026-10-14. Corrected: two `.app` shapes, chunk materials per LOD, extra global normal parameters. TweakDB hop open (REDbridge #4) |
| 2 | Every field in section 2, its type and default | Read a few game `.mlsetup` files as JSON | Done 2026-10-14 on all 17,734. Six defaults and three ranges corrected; `ratio` and `overrides` open |
| 3 | The largest layer count in the game | `archive_search` for `.mlsetup`, read a sample, count layers | Done 2026-10-14: 20, confirmed |
| 4 | Section 3: what an `.mltemplate` holds, where the presets live, how names look | Read `base\surfaces\materials\special\unused.mltemplate` and a fabric and a metal template | Done 2026-10-14 on all 386. Presets live in `overrides`, defaults in `defaultOverrides`; colors run to 2 |
| 5 | Whether roughness and metal pairs are (min, max) or (multiply, add) | Compare presets across templates; then test in game in M5 | Done 2026-10-14 from data: scale and bias. In-game check stays with M5 |
| 6 | Mask count against layer count, and mask order | Read a garment's `.mlmask` next to its `.mlsetup`; export the mask layers to PNG | Done 2026-10-14: 20 and 20; no flip. Order confirmed in game 2026-10-15 (R1-B) |
| 7 | What the game does with a color name the template lacks | Set one in a copy, pack, look in game | Done 2026-10-15 (R1-A): the layer renders white or near-white |
| 8 | Which JSON shape REDbridge writes and reads | `cr2w_read` an `.mlsetup`; compare with section 6 | Done 2026-10-14: the current shape, version 0.0.9 |
| 9 | Where WolvenKit expects an edited `.mlsetup` in a project | Save one under `source\archive` and pack; check it loads | Corrected 2026-10-15: under `source\archive` is right, but a replaced game setup has no effect without MTO (section 6). With MTO (Nexus mod 25246, version 0.2) it loads and shows, confirmed in game the same day |
| 10 | Which bridge methods in section 7 really are missing | Try each with the existing tools; file the rest as requests | Done 2026-10-14: one, filed as REDbridge #4; shipped in REDbridge 0.8.0 on 2026-10-15 |
