# <span class="y">Tests</span>

Every test run on EDGEmat so far: how to run it again, what to expect, and what it showed. Each phase ends with a test on the dev PC ([design, "Phases"](design.html#phases)); new tests are added here when they are first run.

Last updated 2026-10-20.

## At a glance

| Test | Kind | Phase | Last run | Result |
|---|---|---|---|---|
| [Type check and build](#type-check-and-build) | Automated | M1 | 2026-10-16 | Pass |
| [Smoke test](#smoke-test-the-library-against-the-game) | Automated, needs the game | M1 to M3 | 2026-10-20 | Pass |
| [MCP server](#mcp-server) | By hand, over stdio | M1 to M3 | 2026-10-20 | Pass |
| [Library view](#library-view-in-vs-code) | By hand, F5 | M1 | 2026-10-17 | Pass |
| [Surface page](#surface-page) | By hand, F5 | M2 | 2026-10-17 | Pass |
| [Setup editor](#setup-editor) | By hand, F5 | M2 | 2026-10-17 | Pass |
| [Find view](#find-view) | By hand, F5 | M2 | 2026-10-19 | Pass |
| [View in 3D](#view-in-3d) | By hand, F5, with REDcode | M2 | 2026-10-19 | Pass |
| [Setup editor: editing and Save to Project](#setup-editor-editing-and-save-to-project) | By hand, F5, with REDcode | M3 | 2026-10-20 | Pass |
| [New Material](#new-material) | By hand, F5, with an image service key | M3 | 2026-10-20 | Pass |
| [Generate round trip](#generate-round-trip) | In the game, with REDcode and Claude Code | M3 | 2026-10-20 | Pass on the owner's V |
| [Tiling check](#tiling-check) | In the game, from `npm run tiling-check` | M3 | 2026-10-20 | Done: LayerTile repeats the textures |
| [M3 in-game round trip](#m3-in-game-round-trip) | In the game, with REDcode and Claude Code | M3 | 2026-10-20 | Pass on the owner's V; the deploy needed a separate step |
| [M2 phase test](#m2-phase-test) | Against WolvenKit's reading, and by the owner | M2 | 2026-10-19 | Pass |
| [Connect an assistant](#connect-an-assistant) | By hand, in a normal VS Code, with Claude Code | Each release | | Not run yet (0.3.1). The bundled server was checked over stdio under Node and VS Code's binary on 2026-10-21: all 10 tools, `mat_library` reads the library |
| [Install of the release](#install-of-the-release) | By hand, in a normal VS Code | Each release | 2026-10-19 (0.1 test build, VSIX) | 0.3.0 from the Marketplace: not run yet |
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
| 3D view colors (M2) | The sneakers' `red_yellow_graphic` as a 512 px color map, in about 0.5 s; `dec_lights` left out (no color texture). The jacket's `default` look: 5 materials, the two layered ones as color maps and three decals as their own textures (`decals_arasaka_d01.xbm`, `garment_decals_d01.xbm`), in about 1 s |
| Edit and save (M3) | On the Arasaka jacket's setup (`ml_t2_078_ma_jacket__samurai.mlsetup`): unedited, it writes back byte for byte; written fresh (as from an older JSON shape) it reads back the same. "dark red" on its biggest layer picks `c2162c_69039f`; "leather standard clean" and "glossy" on the next one pick that surface and a glossy preset, with no warnings. Refused: `None` as a preset, a color the surface lacks, opacity 9. The meshes using the setup are found in about 0.5 s: `t2_078_ma`, `_mb` and `_mm` (the body and bags materials). Saved into a scratch project at a new path in about 2 s: the setup reads back with the edits, and all 3 mesh copies name it and no longer the game's; saving again finds the project's copies |
| A textured material (M3, Generate's first slice) | A 256 px test pattern imported as a texture takes the color settings of the game texture copied first (`TCM_QualityColor`, gamma 1); a `metal_base` .mi at LayerTile 4 names it; the slim-fits' `leather` material, pointed at the .mi, reads `metal_base.remt` with that texture; an unknown material name is refused with the mesh's names. Under 1 s |
| Generate: a material from an image (M3) | A colour ramp (301 px, odd on purpose) made seamless: its wrap seam goes from 255 to about 1 times the step inside. Made into a material and put on the slim-fits' `flames_blue_pink` (a garment): the repeat (3) baked into a 2048 px texture at LayerTile 1, the garment's own normal map kept; the plain material at LayerTile 3 with its own normal (`TEXG_Generic_Normal`) and roughness (`TEXG_Generic_Grayscale`) maps; the image and its record in `source\raw`. About 14 s |
| Generate: image services (M3) | Against a stand-in server, no network or key: Gemini's model list keeps the 2 image models (not text or Imagen), newest first; an image comes back after one retry without a size; a blocked prompt says why. OpenAI lists the `gpt-image` models; quality is sent; a bad key reads "OpenAI refused the key: ..."; no answer within the limit reads "No answer from OpenAI in 0.3 s ..." |
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

### Setup editor: editing and Save to Project

Built 2026-10-20 (M3). **Run 2026-10-20 by the owner on the laptop: all 14 pass**, after four fixes found during it: mask sets named by meshes (`3336eb7`), the dialog saying why no mesh was found (`adea83d`), a second save keeping the meshes (`a948baf`) and Open Setup searching as you type (`2dacd66`). Before that: the smoke test's "edit and save" checks pass (the jacket's setup edited, saved at a new path, three meshes repointed, all read back), and `mat_edit` was run over stdio.

**Before you start**, in your normal VS Code with REDcode: **REDcode: New Project** (Ctrl+Shift+P), named `EDGEmat_M3`, in `E:\Modding\Cyberpunk 2077\Projects`. Leave it open in REDcode: Save to Project uses REDcode's open project, and offers REDcode's Pack and Try after saving. Then in this repo: `npm run build` and **F5** (**Run EDGEmat**). In the development host, open the same project folder (File › Open Folder) so REDcode has it open there too. **Every step below happens in the development host** (the window F5 opened, titled "[Extension Development Host]"), not the window you pressed F5 in. After `git pull` and `npm run build`, restart it (Shift+F5, then F5): it keeps the code it started with.

| # | Do | Expected |
|---|---|---|
| 1 | EDGEmat's activity bar icon › the **Find** header (below the Library) › its magnifier › type `rocker's heart` › open the item › your V's body (Feminine or Masculine) › `t2_084_pw?__short_sleeves.mesh` › click the material **black_red_glossy** | The setup editor opens `ml_t2_084_pma_jacket__short_sleeves_black_red_glossy`. Under the title: "Select a layer to change it." and a line saying Ctrl+S saves it into a project. Top right: Hide unused slots, Raw values, and a filled **Save to Project** button. The editor's title bar (top right of the tab) has a Save to Project icon |
| 2 | Click the layer with the biggest share (the top of the bars on the right) | Its details open with controls: **Change...** in the Surface row; a filter box and a grid of swatches under Color, the current one outlined; drop-downs for Roughness, Roughness contrast, Metal, Metal contrast, Bumps; number boxes for Tiling, Offset U and V, Opacity; **Change...** and three number boxes in the Microblend row |
| 3 | In the Color row's filter box type `blue`, then click a strong blue swatch | The grid narrows to blues. The layer turns blue in the list and on the map. The tab shows the unsaved dot, and the header says "Edited, not saved yet." |
| 4 | Click an empty part of the page (not a box), then Ctrl+Z, then Ctrl+Y | Ctrl+Z puts the old color back; Ctrl+Y makes it blue again. Keep it blue: it is what you look for in the game |
| 5 | Roughness drop-down: pick a different finish, such as one with "glossy" | The layer's line in the list changes its finish words |
| 6 | Pick a second visible layer. Surface row › **Change...** › type `leather standard` › pick **leather standard clean 01 30** | A list at the top of the window, searchable. After picking: a line under the header, "New surface, leather standard clean 01 30: its ... were set to the surface's defaults", and the layer's thumbnail and color change |
| 7 | Opacity box of that layer: type `0`, press Enter. Then Ctrl+Z | At 0 the layer dims ("not shown: opacity 0") and leaves the map; Ctrl+Z brings it back |
| 8 | Tick **Raw values** | The drop-downs also show the presets' game names |
| 9 | **Save to Project** (the button top right) | A list titled "Save to Project: EDGEmat_M3" with **As a new setup** (recommended), **In place of the game's setup** (it says that needs Material Texture Override), and **At a game path you choose...**. Pick **As a new setup** |
| 10 | The path box shows `...\ml_t2_084_pma_jacket__short_sleeves_black_red_glossy_edgemat_m3.mlsetup`. Press Enter | "Finding the meshes that use this setup", then a list with `t2_084_pma__short_sleeves.mesh` and `t2_084_pwa__short_sleeves.mesh`, both ticked, each naming black_red_glossy. Press OK (or Enter) |
| 11 | Wait for the save | A message "Saved into EDGEmat_M3: the setup and 2 meshes pointed at it." with **Pack and Try** and **Open the Saved Setup**. The unsaved dot goes; a line under the header says where it was saved. In the project: `source\archive\base\characters\garment\player_equipment\torso\t2_084_jacket__short_sleeves\` has the two meshes, and its `textures` folder the new setup. Do not pack yet |
| 12 | **Open the Saved Setup** (in that message; or open the new `.mlsetup` from the project with EDGEmat). Change one more thing, then press Ctrl+S | "Setup · project file", with your edits. Ctrl+S saves straight into that file: no list, no question, and the unsaved dot goes |
| 13 | Open any game setup: **Open Setup** (the Library's title bar) › **From the game...** › type `s1_055 red yellow` (results appear as you type) › pick `ml_s1_055_pma_shoe__red_yellow_graphic`. Change a color, press Ctrl+S, then Esc in the list | Ctrl+S on a game file opens the Save to Project list (game files are never written). After Esc the tab stays unsaved, with no error message. Close it with Don't Save |
| 14 | Another color theme: with a layer's details open, press Ctrl+K then Ctrl+T, and arrow through the list (VS Code previews each). Try at least **Light Modern** and **Dark Modern**; Esc goes back to yours | In each: the swatches show and the current one is outlined; the filter box, drop-downs and number boxes are readable; Save to Project stands out; the share bars and map show |

### M3 in-game round trip

The phase test (design, "Phases"): recolors made in EDGEmat, by asking Claude, and from a setup opened outside the project, each saved into a REDcode project, packed and deployed by REDcode, and seen in the game. **Run 2026-10-20 by the owner on the laptop: pass.** The jacket, the jeans and the sneakers showed their new materials in the game. The sneakers were recolored from the game's setup and saved both ways (as a new setup, and in place with Material Texture Override); with both in the project, the mesh copies point at the new setup, so the game shows that one. Two things got in the way, neither in EDGEmat: with Red Hot Tools installed, Pack and Try sends the archive to `archive\pc\hot`, which Red Hot Tools reads only while the game runs, so with the game closed it stayed there and a separate Deploy from REDcode was needed; and the project packed as a REDmod (`redcode.pack.redmod` on), into `mods\`, which loads only when the game starts with `-modded`. Not checked: the other body, and screenshots (F). Before that, B's saving part passed: Claude saved both jeans, and the saved setups and meshes show dark green in EDGEmat and in REDcode's 3D view, after fix `3336eb7` (the feminine jeans' mask set sits in another folder). Saving as a new setup needs no other mod; Material Texture Override can stay installed or not.

All three go into the `EDGEmat_M3` project from the test above, on three garments V can wear, so they do not clash.

| # | Do | Expected |
|---|---|---|
| A | The jacket from the setup editor test above (the Rocker's Heart crystaljock bomber, saved in step 11) | Saved already |
| B | Register EDGEmat's MCP server for Claude Code if it is not ([dev setup](dev-setup.html), section 4; build it first with `npm run mcp:build`; register with `--scope user`, or only the folder it was run in sees it). Start a new Claude Code session and ask: "Using EDGEmat, make the Sturdy-stitched punk jeans dark green on both bodies, and save it into my project E:\Modding\Cyberpunk 2077\Projects\EDGEmat_M3." | Claude finds the item (`mat_find`), sees that the two bodies wear different meshes with their own setups (`l1_066` feminine, `l1_062` masculine), looks at the layers (`mat_describe`) and recolors both (`mat_edit`), and says which files it saved: a new setup and a mesh for each body. To look at them: right-click a saved `.mlsetup` › **Open With...** › **EDGEmat Setup Editor** (REDcode's tree also opens `.mlsetup`), and open a saved `.mesh` from the project in REDcode's 3D view with the **black_punk** appearance chosen (it opens on the first one) |
| C | In the development host: Open Setup (the Library's title bar) › **A file on disk...** › `E:\Modding\Cyberpunk 2077\Projects\EDGEmat_M0\source\archive\base\characters\garment\player_equipment\feet\s1_055_shoe__converse\textures\ml_s1_055_pma_shoe__red_yellow_graphic.mlsetup`. It is the M0 round 1 setup: the sole red, the collar lining white, the toe cap layer hidden. **Save to Project** › EDGEmat_M3 › As a new setup › Enter › both sneaker meshes ticked › OK | "Setup · project file" (of the M0 project); saved into EDGEmat_M3 as `..._edgemat_m3.mlsetup`, with `s1_055_pma_shoe__converse.mesh` and `s1_055_pwa_shoe__converse.mesh` |
| D | In REDcode with EDGEmat_M3 open: **Pack and Try** (or Pack and Install). Answer **Deploy all** if REDcode asks. Start the game. With Red Hot Tools installed, Pack and Try only sends the archive to `archive\pc\hot` for a running game: with the game closed, use **Pack and Install** (or Deploy) instead | The project packs with no errors and is installed: `<game>\archive\pc\mod\EDGEmat_M3.archive` exists (folder `mod`, singular). If it went to `mods\EDGEmat_M3\` instead, `redcode.pack.redmod` is on, and the game must start with `-modded` (REDcode's Run Game does) |
| E | In the game, with Cyber Engine Tweaks' console: `Game.AddToInventory("Items.Jacket_01_old_01", 1)`, `Game.AddToInventory("Items.Pants_03_basic_01", 1)`, `Game.AddToInventory("Items.CasualShoes_01_basic_01", 1)`. Equip all three; look in third person (photo mode or a mirror) and at your arms in first person | The jacket shows your blue and leather layer; the jeans are dark green; the sneakers have a red sole, a white collar lining and no black toe cap |
| F | Screenshots before and after | Kept outside the repo |

### New Material

Built 2026-10-20 (M3, Generate's first slice). **Run 2026-10-20 by the owner on the laptop: all pass**, with a real image service key (the first live calls). Before that: the page rendered in headless Chrome with a take (stubbed service), the smoke test's Generate checks, and `mat_from_image` and `mat_apply` over stdio. You need a REDcode project open (EDGEmat_M3 is fine) and, for steps 4 to 8, an API key for Google Gemini (aistudio.google.com › Get API key) or OpenAI (platform.openai.com › API keys; GPT Image may ask you to verify your organization first). Each Generate spends a few cents of your credits. `npm run build`, then F5; every step happens in the development host.

| # | Do | Expected |
|---|---|---|
| 1 | EDGEmat's activity bar icon › the **Library** header › the sparkle icon (**New Material...**, leftmost) | A **New Material** tab: "Where it goes" says not on a mesh yet; **1. The image** with two tabs, From words (AI) and From an image file; a text box, Detail, the service (Google Gemini), the model ("Newest (listed when you generate)"), List models, a line on credits and the key, and **Generate** |
| 2 | Close it. **Find** › `comfy rocker` › the item (Comfy rocker aramid-weave slim-fits) › your body › `l1_012_pw?_pants__jeans_tight.mesh` › hover the material **leather** › the sparkle icon at its right (or right-click › **New Material Here...**) | The tab opens titled "New Material: leather". "Where it goes" names leather on both meshes, `l1_012_pwa_...` and `l1_012_pma_...` (both bodies), and says the garment keeps its own folds |
| 3 | Type `worn brown leather with fine creases`. Open **The words sent** | The words EDGEmat sends: a seamless texture of your words, flat light, no text or logos, and the detail size. Edit them and **Back to the standard words** appears |
| 4 | Pick your service. Press **Generate** | A password box asks for the key the first time (it says where to make one). Then a notification "EDGEmat: generating with ..." with Cancel, and within about a minute **2. Takes** shows Take 1, selected, and **3. The material** shows it tiled 3 × 3. The model menu now lists your key's image models |
| 5 | Press **Generate again**, then Cancel in the notification while it runs | The page says "Cancelled." in red; no take is added; nothing is charged for a cancelled call (unverified: the service may still count it) |
| 6 | Generate once more, and click between the takes | The tiled view and the line under it follow the take you click. Look for seams in the 3 × 3 view: there should be none |
| 7 | Under **3. The material**: name `worn leather`, Repeat 6, Bumps Moderate, Shine Satin. Press **Add to Project** | A notification "writing worn_leather into EDGEmat_M3", then "Saved worn_leather into EDGEmat_M3 and put on 2 mesh materials." with **Pack and Try** and **Show Files**. The page lists both meshes with "repeat in the texture, garment folds kept". In the project: `source\archive\edgemat\materials\worn_leather\` (textures and .mi files), the two slim-fits meshes, and `source\raw\edgemat\materials\worn_leather\` with the image and `worn_leather.edgemat.json` (service, model, prompt) |
| 8 | **From an image file** › **Choose an image...** › any photo of a material on your PC | A take from the file, no key used |
| 9 | Ctrl+Shift+P › **EDGEmat: Clear Image Service Key...** › your service | "the ... API key is cleared"; the next Generate asks again |

### Generate round trip

The M3 phase test's last row (design, "Phases"): a material generated from words goes on part of a garment and shows in the game, through the UI and by asking Claude. **Run 2026-10-20 by the owner on the laptop: pass.** Both pairs showed their new material on the owner's V, front, back and side. What the screenshots show:

| | Worn leather (the page, Repeat 6, satin) | Snakeskin (asked of Claude) |
|---|---|---|
| Folds | The pants' own, at their normal size: knees, the backs of the thighs, the ankles. Not the small repeated wrinkles of the tile-4 pair | The same |
| Scale | Fine creases and cracks, even over both legs | Scales of a believable size, even over both legs |
| Repeat | Not visible at a glance | Not visible at a glance |
| Seams | The panel lines read as stitching (owner: "totally fine") | The pattern breaks at the front thigh panel line, as expected at a UV border |
| Bumps and shine | Creases catch the light; a soft sheen on the knees and seat | A wet-look sheen on the seat and thighs; the scales show as relief |
| Color | A warm tan brown, lighter than "brown" may suggest | Dark green with black scale edges |

Not checked: the other body; the normal map's green convention (the bumps read right, so no sign it is flipped).

| # | Do | Expected |
|---|---|---|
| A | The material from the New Material test, step 7 (worn leather on the Comfy rocker slim-fits) | Saved already |
| B | Register the MCP server with your key (`-e GEMINI_API_KEY=...`; [dev setup](dev-setup.html), section 4), start a new Claude Code session, and ask: "Using EDGEmat, make a dark green snakeskin material and put it on the Light Azure composite-lined slim-fits, both bodies, in my project <your EDGEmat_M3 folder>" | Claude finds the item's material (`mat_find`: flames_blue_pink on both meshes) and calls `mat_generate` with both targets; it says which files it wrote |
| C | REDcode: **Pack and Install** with the game closed (or Pack and Try with the game running) | Packed and installed |
| D | In the game: `Game.AddToInventory("Items.Pants_01_basic_01", 1)` and `Game.AddToInventory("Items.Pants_01_basic_02", 1)`. Equip each; photo mode front, back and side | The first pair worn leather, the second snakeskin, at a fine repeat, with the pants' own folds at their normal size (not the small repeated wrinkles of the tiling check's tile-4 pair). Note how the bumps and shine look, and any seams |
| E | Screenshots of both | Shared with the session; kept outside the repo |

### Tiling check

The open question "A tiled texture on a game garment" (design, "Open questions"): how a texture lies across a garment's UVs, and what `metal_base`'s `LayerTile` does. Its answer shapes how Generate puts a material on a garment. **Run 2026-10-20 by the owner on the laptop (feminine body), with screenshots from the front, back and side: done.** Tile 1: upright, even scale, no visible stretch; one leg mirrored (the front of V's right leg reads "5a", "E3"); the pattern breaks down each leg and across the top of the thighs. Tile 4: the squares a quarter the size, repeating across (column 8 beside column 1) and down (row 8 above row 1); the folds repeat with them: finer wrinkles down the legs, mostly at the front (the owner, in the game; darker creases at the same rows in the screenshots). Findings in the design's open questions.

`npm run tiling-check` writes a project from your own game: a UV test pattern (8 × 8 colored squares, each labelled with its column and row: 11 top left, 81 top right, 18 bottom left), two `metal_base` materials using it with the slim-fits' own normal map, at LayerTile 1 and 4, and the slim-fits pants' meshes for both bodies with one look on each.

| Item | Look | Material |
|---|---|---|
| `Items.Pants_01_basic_01`, Comfy rocker aramid-weave slim-fits | leather | The pattern, LayerTile 1 |
| `Items.Pants_01_basic_02`, Light Azure composite-lined slim-fits | flames_blue_pink | The pattern, LayerTile 4 |

| # | Do | Expected |
|---|---|---|
| 1 | In the repo: `git pull`, `npm run build`, then `npm run tiling-check -- "<your Projects folder>\EDGEmat_Tiling"` | Four `ok` lines (two looks on each body's mesh), then "packed 5 files into ...\EDGEmat_Tiling.archive" |
| 2 | With the game closed, install it: in REDcode, open the `EDGEmat_Tiling` folder and run **Pack and Install** (Pack and Try goes to Red Hot Tools' hot folder, which only a running game reads). Or copy `packed\archive\pc\mod\EDGEmat_Tiling.archive` into `<game>\archive\pc\mod` | The archive is in the game |
| 3 | In the game, Cyber Engine Tweaks' console: `Game.AddToInventory("Items.Pants_01_basic_01", 1)` and `Game.AddToInventory("Items.Pants_01_basic_02", 1)`. Equip the first; look in photo mode from the front, the back and each side | The colored squares on the pants. Note which numbers show on the front of the thighs, the back, the waist; whether the numbers read normally, mirrored or upside down; whether squares stay square or stretch; where the seams cut squares |
| 4 | Equip the second | Unknown, which is what the test finds out: the squares four times smaller and repeated (LayerTile tiles the texture), the same as the first (it does nothing here), or something else. Also whether the folds from the normal map repeat too |
| 5 | Screenshots of both pants, front and back | Shared with the session; kept outside the repo |

### Find view

Built 2026-10-17. **Last run 2026-10-19 by the owner through F5: all 10 checks pass.** The walks behind it were also run outside VS Code on the test set (smoke test, and `mat_find` over stdio).

1. `npm run build`, then **F5** (**Run EDGEmat**).
2. In the development host, open EDGEmat's activity bar container. **Find** is the second view, a **FIND** header below **Library**, often collapsed at the bottom of the sidebar: click its header to expand it, and collapse Library (click its header) if Find is squeezed. The magnifier at the top of the Library is **Search Library**, not Find; Find's own magnifier shows only when you hover over Find's header.

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

### View in 3D

Built 2026-10-19. **Last run 2026-10-19 by the owner through F5: all 7 checks pass**, colors the right way up on the sneaker and the jacket. The colors behind it are also checked outside VS Code (smoke test, "3D view"). Needs REDcode installed in the development host's VS Code (it is, when REDcode is installed in your normal VS Code), with its REDbridge running.

1. `npm run build`, then **F5** (**Run EDGEmat**).
2. In the development host, open EDGEmat's activity bar container, expand **FIND** below the Library, press **Find...** and type `sunny ammo`.
3. Expand "Sunny Ammo synthetic high-tops", then **Feminine body**. Under it is the mesh row `s1_055_pwa_shoe__converse.mesh`.

| # | Check | Expected |
|---|---|---|
| 1 | Hover the mesh row `s1_055_pwa_shoe__converse.mesh` | Two icons at its right end: an **eye** (View in 3D) and **copy** (Copy Game Path) |
| 2 | Click the **eye** | REDcode's editor opens the mesh in a new tab, on its **3D** view. The status bar (bottom of the window) says: EDGEmat: pick the look "red_yellow_graphic" in the 3D view |
| 3 | In the 3D view's toolbar, pick **red_yellow_graphic** in the appearance list | The sneaker shows its colors: black sole, red trim, an orange-brown upper, as in the setup editor's color map. The 3D view says "EDGEmat: approximate". Nothing shiny or bumpy yet: colors only |
| 4 | Rotate the sneaker (drag in the view) | The colors sit where they belong on the shoe: the sole is black, the laces area matches the map. If the colors look scrambled or upside down, tell me: it means the map's orientation is off |
| 5 | Find `t2_078 samurai`, expand **Meshes**, right-click `t2_078_ma_jacket__samurai.mesh` › **View in 3D** | The jacket opens in 3D. On its first look it is near-black (the Arasaka jacket is black), with the Arasaka decals and stitches showing as textures |
| 6 | Switch the 3D view's appearance list to **no_bags** | The bags change to a flat color or disappear (their material is `mesh_decal.mt` without a texture) |
| 7 | **Show Log** (Library's `...` menu) | Lines like `3D view: 5 of 5 materials for base\...\t2_078_ma_jacket__samurai.mesh, look default, in 1055 ms` |

### M2 phase test

**Passed 2026-10-19.** The test in the design: a game jacket shows the same layers WolvenKit shows, and Claude describes it correctly; a setup from a mod archive outside any project opens and reads the same.

| Part | How | Result |
|---|---|---|
| The same layers as WolvenKit | The Arasaka samurai jacket's setup (`ml_t2_078_ma_jacket__samurai.mlsetup`, the material `ml_t2_078_ma_jacket__samurai_masksset` on `t2_078_ma_jacket__samurai.mesh`, look `default`), read by EDGEmat and compared field by field with WolvenKit's own JSON of the file (REDbridge's `toJson` runs WolvenKit's reader) | 20 of 20 layers; all 360 fields equal (surface, color, tiling, offsets, opacity, levels, microblend and its settings); no field EDGEmat ignores; ratio and useNormal equal |
| Claude describes it correctly | `mat_describe` over stdio, as Claude Code calls it, and Claude's description from it | 14 of 20 layers shown, with their surfaces, colors, finishes and shares. The owner: "100% accurate". The white stitching is not in the setup but a separate decal material on the mesh (`pasted__decal_stitches`, `garment_decals_d01.xbm`), which `mat_find` lists: a whole-garment description combines the two |
| A setup from a mod archive | The setup editor hand test, step 10 (2026-10-17) | Pass |

### Connect an assistant

Added for 0.3.1, when the MCP server came into the extension. In a normal VS Code with EDGEmat installed from the Marketplace:

| Step | Do | Expect |
|---|---|---|
| 1 | Check `%LOCALAPPDATA%\EDGEmat\mcp\` | `edgemat-mcp.cjs` is there, made when EDGEmat started |
| 2 | Library view › **...** (top right of the view) › **Connect an Assistant (MCP)...** | Four choices; the hint at the top says whether agents inside this editor already see EDGEmat |
| 3 | **Connect Claude Code**; with a key set, answer the key question | "EDGEmat is connected to Claude Code" |
| 4 | In a terminal: `claude mcp list` | `edgemat` points at the file from step 1, connected |
| 5 | A new Claude Code session: "Which EDGEmat tools do you have?", then "Describe the Comfy rocker slim-fits' materials" | The 10 `mat_` tools; `mat_find` and `mat_describe` answer |
| 6 | VS Code 1.101 or later: open the editor's own agent chat and its tools list | EDGEmat and its tools are listed |

### Install of the release

Asked for by the owner on 2026-10-16 as the CLI install of the VSIX. **Last run 2026-10-19 by the owner on a test build's VSIX: pass.** F5 runs the source; this tests what a user installs. From 0.3.0 a release is on the VS Code Marketplace and Open VSX, so the test installs from there, in a normal VS Code with no development host open ([Dev setup, "Releasing"](dev-setup.html#releasing)):

1. Extensions view (`Ctrl+Shift+X`), search `EDGEmat`, pick EDGEmat by Edgemodders with the Preview badge, **Install**. Or `code --install-extension edgemodders.edgemat`.
2. Check the version on its page is the release's.
3. Click the EDGEmat icon in the activity bar: the [Library view](#library-view-in-vs-code) checks, then Find and New Material open.

Without a store, the release's VSIX the same way:

```powershell
code --install-extension edgemat-<version>.vsix
```

Uninstall with `code --uninstall-extension edgemodders.edgemat`.

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
| "Make the jacket's biggest layer dark red and its next one glossy standard leather; just show me" | `mat_edit` with preview | Run 2026-10-20 over stdio on the Arasaka jacket's setup: layer 0 dark red (`c2162c_69039f`, distance 0.032), layer 2 leather standard clean, glossy to shiny, its color and bumps reset to the surface's defaults (said in notes); nothing written. "leather" alone is refused with the 7 surfaces it fits |
| "... and save it into this project" | `mat_edit` with project | Run 2026-10-20 over stdio into a scratch project: the new setup `..._mcp_project.mlsetup` and the three meshes that use it (`t2_078_ma`, `_mb`, `_mm`), with the materials pointed at it |
| "Make me a brown leather material" (no key in the server's environment) | `mat_generate` | Refused in words: set `GEMINI_API_KEY` or `OPENAI_API_KEY` in the MCP server's environment, with the `claude mcp add ... -e` form. Run 2026-10-20 over stdio |
| "Make a material from this image and put it on the Comfy rocker slim-fits, both bodies" | `mat_from_image` with targets | Run 2026-10-20 over stdio into a scratch project, repeat 6: the plain material and textures in `edgemat\materials\rust_plate\`, both bodies' meshes with `leather` on `rust_plate_x6_..._n01.mi` (repeat in the texture, the garment's normal map kept), the image and its record in `source\raw` |
| "Put that material on the Light Azure look too" | `mat_apply` | Run 2026-10-20 over stdio: the masculine mesh's `flames_blue_pink` on `rust_plate.mi`; an unknown material name is refused with the mesh's names |
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
