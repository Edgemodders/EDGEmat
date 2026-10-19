# <span class="y">Tests</span>

Every test run on EDGEmat so far: how to run it again, what to expect, and what it showed. Each phase ends with a test on the dev PC ([design, "Phases"](design.html#phases)); new tests are added here when they are first run.

Last updated 2026-10-17.

## At a glance

| Test | Kind | Phase | Last run | Result |
|---|---|---|---|---|
| [Type check and build](#type-check-and-build) | Automated | M1 | 2026-10-16 | Pass |
| [Smoke test](#smoke-test-the-library-against-the-game) | Automated, needs the game | M1, M2 | 2026-10-17 | Pass |
| [MCP server](#mcp-server) | By hand, over stdio | M1, M2 | 2026-10-17 | Pass |
| [Library view](#library-view-in-vs-code) | By hand, F5 | M1 | 2026-10-17 | Pass |
| [Surface page](#surface-page) | By hand, F5 | M2 | 2026-10-17 | Pass |
| [Setup editor](#setup-editor) | By hand, F5 | M2 | 2026-10-17 | Pass |
| [Find view](#find-view) | By hand, F5 | M2 | Not run | Walks checked outside VS Code on 2026-10-17 |
| [CLI install of the VSIX](#cli-install-of-the-vsix) | By hand | M7 at the latest | Not run | |
| [Spec checks 1 to 10](#spec-checks-against-the-game) | Reading game files | M0 | 2026-10-14/15 | Done |
| [In-game round 1](#in-game-round-1-colors-masks-overrides) | In the game | M0 | 2026-10-15 | Done |
| [In-game round 2](#in-game-round-2-ratio) | In the game | M0 | 2026-10-15 | Done |

## Automated

### Type check and build

```powershell
npm install
npm run typecheck
npm run build
```

Expected: no errors; `extensions/edgemat/dist` and `packages/edgemat-mcp/dist` written.

### Smoke test: the library against the game

```powershell
npm run smoke
```

Needs the game and REDbridge, found from the VS Code settings as the extension finds them ([dev setup](dev-setup.html), section 4). It builds the library into `%LOCALAPPDATA%\EDGEmat` and checks it.

| Check | Expected on game 2.31 |
|---|---|
| Surfaces read, against the game's listing | 386 of 386 |
| Microblends read, against the game's listing | 131 of 131 |
| Setups and mask sets counted | 17,734 and 5,722 |
| Thumbnails | 343; 4 surfaces have none (`unused`, two flat plastics, one whose texture the game lacks) |
| Files that failed to read | None. One texture the game itself lacks is listed apart, as missing: `graphics_logos_001_d.xbm` |
| Time | About 22 to 25 s; 4 s when thumbnails are cached |
| Surface page data (M2) | Every surface described with a default color and roughness, metal and bump presets; all 155,099 colors with a plain name and swatch; 139 distinct names |
| Typed colors (M2) | "dark red" on `leather_bull_01_30` finds a dark red preset (`c2162c_69039f`, distance 0.032); "banana" is refused; `#a03030` reads back as itself |
| Setup editor data (M2) | On `ml_s1_055_pma_shoe__red_yellow_graphic.mlsetup`: 20 layers, 19 shown, layer 11 hidden (opacity 0); mask set `ml_s1_055_pma_shoe__converse_masksset` (20 masks) found beside it, of 2 in the folder; layer 7 (the sole, in-game test R1-B) is rubber bumper damaged, 11.3% of the texture; every surface found, no warnings; the 0.0.1 and oldest JSON shapes (made from the current one) read the same layers. Read in about 0.3 s with the masks cached |
| Find (M2) | 1,997 clothing items with in-game names (8.5 s the first time, then cached); "sunny ammo high-tops" finds `Items.CasualShoes_01_basic_01` and "Pants_03_basic_01" finds `Items.Pants_03_basic_01`; the sneakers walk to two bodies (`_pwa_` and `_pma_` meshes), each with red_yellow_graphic's setup and the converse mask set; the jeans' feminine body wears `l1_066` pants; the jacket mesh's body and bags share one setup and `no_bags` hides them with `mesh_decal.mt`; a found setup opens with the mask set its material names. Each item walk takes about 0.15 to 0.35 s |
| Page images (M2) | 3 of 3 for `leather_bull_01_30`: the first in about 1.6 s while the bridge warms up, the rest in well under half a second, then instant from the cache |

The counts change after a game patch. A patch that adds surfaces is fine as long as "read" matches "listing".

## By hand in VS Code

### Library view in VS Code

Run 2026-10-16 and again 2026-10-17 by the owner: **all pass.**

1. Open this repo in VS Code, run `npm run build`, press **F5** and choose **Run EDGEmat**. A second VS Code window opens with EDGEmat loaded from source.
2. In that window, check:

| # | Check | Expected |
|---|---|---|
| 1 | The activity bar | The EDGEmat icon (corner brackets around two layers): yellow when inactive, white when active, in the REDnode HUD theme |
| 2 | The Library on first open | "386 surfaces · 131 microblends · built <date>". A first build shows progress in the view and takes under half a minute |
| 3 | Surfaces | Grouped by category (fabric, metal, plastic and so on), each with a thumbnail |
| 4 | Hover a surface | A larger thumbnail, its color count and its game path |
| 5 | Microblends: the second top-level group, below all the surface categories (Collapse All in the view's title bar shows both groups) | Listed with thumbnails when opened |
| 6 | Search (magnifier) for `leather` | 7 surfaces. Clear search restores the full list |
| 7 | Rebuild (refresh) | Progress in the view; done in a few seconds |
| 8 | Output › EDGEmat | Names the bridge used: "Using REDcode's REDbridge" when REDcode is active with the same game, otherwise "Starting REDbridge from ...". The first line was added after the 2026-10-16 run; before it, only EDGEmat's own bridge was named |

### Surface page

Run 2026-10-17 by the owner: **all pass.** Before that it was rendered in headless Chrome with real library data and a stand-in for VS Code, to catch layout and script errors.

Where things are: the Copy buttons sit after the game path at the top, beside Preset, RGB and Swatch in the color panel under the image, and under each texture image. Below about 760 px wide the page is one column, with the image and color panel above Colors.

1. `npm run build`, then **F5** (**Run EDGEmat**), as for the Library view.
2. In the development host, check:

| # | Check | Expected |
|---|---|---|
| 1 | Click a surface in the Library, such as fabric › leather bull 01 30 | An editor tab opens with its title and a small icon. The page shows "Surface · fabric › leather", the game path with Copy path, an image (the thumbnail at once, a sharper one within a second or two), and the default color selected |
| 2 | Click another surface | The same tab shows it; no new tab |
| 3 | Keep open, then click a third surface | The kept tab stays; a new tab opens for the third |
| 4 | Click swatches | The image is tinted with each color; the panel under it shows a plain name, the preset name, RGB and the swatch hex, each with Copy. Untick "Tint with the selected color" to see the detail map alone |
| 5 | Type `red` in Filter | Only reds; "n of 750 colors" |
| 6 | Type `dark red` in Closest to, or pick a color with the color box | The swatches reorder, closest first. A word EDGEmat does not know marks the box red |
| 7 | Copy buttons | The status bar says "Copied ..."; the clipboard holds the value |
| 8 | Raw values | Preset names and scale and bias appear beside roughness, metal and bumps; color mask levels appear under Textures |
| 9 | Roughness, metal, bumps | Plain words such as "glossy to rough", "not metal", "strong bumps", one marked default |
| 10 | Textures | Detail, bumps and roughness images; "Shared default: none of its own" where the surface has no map |
| 11 | Click a microblend | Its mask image, name and path, and a line on what a microblend does |
| 12 | Switch to another tab and back | The page keeps the selected color, filter and raw-values setting |
| 13 | Try another theme (Dark Modern, Light Modern) | Readable; headings and the selection use the theme's link color |

### Setup editor

Run 2026-10-17 by the owner: **all pass**, including opening from REDcode's Game Assets. Before that it was rendered in headless Chrome with real data, and run outside VS Code on a game setup, a project file and a mod archive. During the test the buttons got a clearer outline (the first ones did not read as buttons).

1. `npm run build`, then **F5** (**Run EDGEmat**).
2. In the development host, check:

| # | Check | Expected |
|---|---|---|
| 1 | **Open Setup** (the go-to-file icon in the Library's title bar) › From the game › `s1_055 red yellow` › `ml_s1_055_pma_shoe__red_yellow_graphic` | A tab "ml_s1_055_pma_shoe__red_yellow_graphic", "Setup · game file", "19 of 20 layers show · ratio 1". A color map of the sneaker's texture (yellow canvas, red panels, black sole) and 20 layers |
| 2 | The layers | Each with its index, color swatch, surface thumbnail, "Surface · color", finish words, and its share of the texture with a bar. Layer 11 is dimmed: "not shown: opacity 0" |
| 3 | Click layer 7 | Its details open: surface (rubber bumper damaged, with Open), color, roughness, metal, bumps, tiling ×10.1, opacity, microblend, "Shows on 11% of the texture". The map switches to Selected layer, with the sole and rubber band lit in yellow |
| 4 | Click spots on the map: a red panel, the yellow canvas, the sole | The layer that shows there is selected and scrolled into view |
| 5 | Under the map, the two-part switch **All layers** / **Selected layer** | All layers shows the whole color map; Selected layer dims it and lights the selected layer's area |
| 6 | Click layer 10 (cotton shirt clean 02 30, red) to open its details. In the details table, press the small **Open** after the surface name in the Surface row, then the **Open** after "graphics logos 004" in the Microblend row | The surface page, then the microblend page, in the reused tab |
| 7 | Tick **Raw values** (top right, beside Hide unused slots), with a layer's details open | The game's names and values in light blue beside the plain words: the surface's path, the color's preset name and RGB, each preset's name with its scale and bias, matTile, opacity, the microblend's path and offsets. The header adds useNormal and the WolvenKit JSON version. The layer list itself does not change |
| 8 | Under the map, the line "Mask set: ml_s1_055_pma_shoe__converse_masksset (found beside the setup)" has a **Change** button. Press it | A list with `ml_s1_055_pma_shoe__converse_masksset` (in use) and `ml_songbird_masksset`, plus Search and a file on disk. Picking songbird redraws the map with other shapes; pick converse again to go back |
| 9 | Open Setup › A file on disk › `Projects\EDGEmat_M0\source\archive\...\ml_s1_055_pma_shoe__red_yellow_graphic.mlsetup` | "Setup · project file", 18 of 20 show. Layer 4 has ⚠: its color "edgemat_unknown" shows white. Layer 9: "not shown: all presets set to None". Layer 7 is dark red: the M0 round 1 edits |
| 10 | Open Setup › A file on disk › `Projects\EDGEmat_M0\tests\round2\archive\pc\mod\EDGEmat_M0_round2_ratio.archive` › a setup | "Setup · from the mod EDGEmat_M0_round2_ratio.archive", ratio 4 |
| 11 | In REDcode's activity bar view, open Game Assets and go to a garment's `textures` folder (for example `base\characters\garment\player_equipment\feet\s1_055_shoe__converse\textures`). Open any `.mlsetup` there | VS Code asks which editor to use, or opens REDcode's. To switch: right-click the editor tab (or press Ctrl+Shift+P) › **Reopen Editor With...** › **EDGEmat Setup Editor**. The setup shows as in step 1 |
| 12 | Open a setup with unused slots: Open Setup › From the game › type `t2_078 samurai`, pick any. Then untick and tick **Hide unused slots** (top right, beside Raw values) | The header counts the unused slots. Unticked, they appear in the list as dimmed "unused" layers; ticked, they disappear |
| 13 | Another theme | Readable; the lit mask uses the theme's link color |

### Find view

Built 2026-10-17; **not yet run in VS Code.** The walks behind it were run outside VS Code on the test set (smoke test, and `mat_find` over stdio).

1. `npm run build`, then **F5** (**Run EDGEmat**).
2. In the development host, open EDGEmat's activity bar container. **Find** is the second view, below **Library**: collapse Library (click its header) if Find is squeezed.

| # | Check | Expected |
|---|---|---|
| 1 | The Find view before any search | A short text on what Find does, with a **Find...** button. The same command is the magnifier in Find's title bar (hover the view's header to see it) |
| 2 | Press **Find...** and type `sunny ammo` | The first time, a progress bar runs along the top of the Find view for several seconds while the item list is read from TweakDB (later searches are instant). Then an **Items** group with "Sunny Ammo synthetic high-tops", described "Feet · Items.CasualShoes_01_basic_01", first. The view's header line says `"sunny ammo": 3 items, 0 meshes` |
| 3 | Expand "Sunny Ammo synthetic high-tops" (click the arrow) | "Feminine body" (`s1_casual_01.app › basic_01_w`) and "Masculine body" (`› basic_01_m`). Each holds its mesh, `s1_055_pwa_shoe__converse.mesh` and `s1_055_pma_shoe__converse.mesh`, described "look red_yellow_graphic · 1 multilayered of 2", and under it two materials: **red_yellow_graphic** (layers icon, "multilayered · ml_s1_055_pma_shoe__red_yellow_graphic.mlsetup") and **dec_lights** ("metal_base.remt") |
| 4 | Hover **red_yellow_graphic** | A tooltip with its setup and mask paths |
| 5 | Click **red_yellow_graphic** under Feminine body | The setup editor opens. Its top line reads "Setup · game file · from Sunny Ammo synthetic high-tops, feminine". Under the map: "Mask set: ml_s1_055_pma_shoe__converse_masksset (named by the mesh's material)" |
| 6 | Find `punk jeans`, expand "Sturdy-stitched punk jeans" | The feminine body wears `l1_066_pwa_pants__rogue.mesh` with `ml_l1_066_black_punk.mlsetup`; the masculine body wears `l1_062_pma_pants__jeans.mesh` with `ml_l1_062_black_punk.mlsetup`: two different garments for one item |
| 7 | Find `t2_078 samurai` | A **Meshes** group with the samurai jacket meshes. Expand `t2_078_ma_jacket__samurai.mesh`: its appearances (default, no_bags and others). Expand **default**: two multilayered materials (the body and the bags) that share one setup. Expand **no_bags**: the bags' materials are `mesh_decal.mt`, which hides them |
| 8 | Right-click a mesh or a multilayered material › **Copy Game Path** (also the copy icon that appears on hover) | The mesh's path, or the material's setup path, on the clipboard |
| 9 | Find `nothing like this` | One line: Nothing matches, with a hint |
| 10 | **Clear Find** (the clear icon in Find's title bar) | The view goes back to its first text |

### CLI install of the VSIX

Not run yet. Asked for by the owner on 2026-10-16; part of M7's test at the latest. Your laptop install of the test build (2026-10-18) counts if it uses the command line. F5 runs the source; this tests what a user installs.

```powershell
npm run edgemat:package
code --install-extension dist\edgemat-<version>.vsix
```

Then **Developer: Reload Window** (this restarts a Claude panel in the same window) and repeat the [Library view](#library-view-in-vs-code) checks. Uninstall with `code --uninstall-extension edgemodders.edgemat`.

### MCP server

Run 2026-10-16 (M1 tools) and 2026-10-17 (`mat_colors`, `mat_describe`, `mat_find`): **pass.** Register the server ([dev setup](dev-setup.html), section 4), start a new Claude Code session, and ask:

| Ask | Tool | Expected |
|---|---|---|
| "Is the EDGEmat library built?" | `mat_library` status | The counts above and the build date |
| "Which leather surfaces are there?" | `mat_templates` `leather` | 7 surfaces |
| "Find logo microblends" | `mat_microblends` `logos` | 6 microblends |
| "What's the closest dark red on leather bull?" | `mat_colors` `leather_bull_01_30`, near `dark red` | The surface's dark reds, closest first, each with its preset name, a plain name, RGB and distance; roughness, metal and bumps in words. Run 2026-10-17 over stdio: `c2162c_69039f` first, distance 0.032 |
| "Colors of leather" | `mat_colors` `leather` | Several surfaces fit: the 7 candidates, asking for one path |
| "Which materials do the punk jeans use?" | `mat_find` item `punk jeans` | The item `Items.Pants_03_basic_01` (its crafting copy shares the look, so it is not asked about); feminine: `l1_066_pwa_pants__rogue.mesh` with `ml_l1_066_black_punk.mlsetup` and its mask set; masculine: `l1_062_pma_pants__jeans.mesh` with `ml_l1_062_black_punk.mlsetup`. Run 2026-10-17 over stdio |
| "Find s1_055" | `mat_find` query `s1_055` | The two sneaker meshes, `_pma_` and `_pwa_` |
| Started as a Claude Code plugin with its options left empty (`EDGEMAT_GAME_PATH`, `REDBRIDGE_EXE` and `EDGEMAT_CACHE` set to "") | `mat_find` item `sunny ammo` | Empty counts as unset: it falls back to the VS Code settings and walks the item (2 looks). Run 2026-10-17 over stdio |
| "Describe the sneakers' red_yellow_graphic setup" | `mat_describe` with the game path | 20 layers, 19 shown, the converse mask set and the songbird one as another choice, a color map file, each layer in plain words with its share. Run 2026-10-17 over stdio: layer 7 rubber bumper damaged, black, 11.3% |

## M0: the spec against the game

### Spec checks against the game

Checklist items 1 to 10 in the [behavior spec](design/behavior.html#checklist-for-the-local-session), each with its date and result. To redo one, read the files it names through `redcode-mcp` (`cr2w_read`, `texture_to_png`, `archive_search`; setup in [dev setup](dev-setup.html), section 3). The test garments are in the spec's [test set](design/behavior.html#test-set).

### Before any in-game test

| Need | Why |
|---|---|
| **Material Texture Override** (Nexus mod 25246, version 0.2), deployed | A replaced game `.mlsetup` has no effect in the game without it. This cost a day in M0 |
| The test archive deployed through REDdeck, and listed in `archive\pc\mod\modlist.txt` | The game reads `modlist.txt`; earlier archives win |
| Only one test archive deployed at a time | Rounds replace the same files |
| The sneakers on V | "Sunny Ammo synthetic high-tops" (`Items.CasualShoes_01_basic_01`), or any of `basic_01` to `_05`, `old_01`, `old_02`. With Cyber Engine Tweaks: `Game.AddToInventory("Items.CasualShoes_01_basic_01", 1)` |
| A screenshot before and after | Kept outside the repo (game images are game content), for example in the test project |

### The test project

`E:\Modding\Cyberpunk 2077\Projects\EDGEmat_M0`, a WolvenKit project. Nothing from it goes into this repo.

| Folder or file | What it is |
|---|---|
| `source\archive\...\s1_055_shoe__converse\textures\` | The eight edited sneaker setups for round 1, written 2026-10-14 |
| `source\archive\...\t2_142_jacket__witcher\...` | A witcher jacket setup added 2026-10-15 by the owner, from tests for another EDGE mod. Not part of EDGEmat's tests, but it is in the round 1 archive below |
| `packed\archive\pc\mod\EDGEmat_M0.archive` | Round 1, packed by WolvenKit on 2026-10-15 |
| `tests\round2\archive\pc\mod\EDGEmat_M0_round2_ratio.archive` | Round 2 |
| `*_stage` folders | The working copies each archive was packed from: `round1_marked_stage` (round 1), `round1b_stage` (every layer hidden but a green base), `probe_stage` (a file only our archive has, to prove it mounts), `ratio_stage` (round 2) |

**WolvenKit's Pack clears the `packed` folder.** Keep any archive you want to reuse in `tests\`, never in `packed`.

### In-game round 1: colors, masks, overrides

Archive: `packed\archive\pc\mod\EDGEmat_M0.archive`. Run 2026-10-15 with MTO, on the "Sunny Ammo synthetic high-tops", feminine body.

| Test | Edit | Look at | Result |
|---|---|---|---|
| R1-A | Layer 4: a color name no surface has | The collar lining | Turned white. An unknown color renders white |
| R1-B | Layer 7: the surface's reddest color | The sole and rubber band | Turned red. Mask *i* drives layer *i* |
| R1-C | Layer 9: all preset names `None`, and an `overrides` string | The toe cap | Its black layer vanished, no green. All-`None` hides a layer; `overrides` is not a combined selection in this form |
| R1 | The whole round, packed from `source\archive` | That anything changes | Loads, with MTO |

Without MTO, nothing changes on the shoe. That run, and how the cause was found, is in the spec's [results](design/behavior.html#in-game-tests).

### In-game round 2: ratio

Archive: `tests\round2\archive\pc\mod\EDGEmat_M0_round2_ratio.archive`. Run 2026-10-15 with MTO, same shoe.

| Edit | Look at | Result |
|---|---|---|
| `ratio` = 4 on the unedited setups | The printed graphic on the side panel (a microblend on layer 10) | It showed a different part of its image: the hooded skull's face where its halo rays had been. Masks, sole, toe cap and stripes unchanged. `ratio` changes how the microblend maps onto the item |
