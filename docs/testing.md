# <span class="y">Tests</span>

Every test run on EDGEmat so far: how to run it again, what to expect, and what it showed. Each phase ends with a test on the dev PC ([design, "Phases"](design.html#phases)); new tests are added here when they are first run.

Last updated 2026-10-26.

## At a glance

| Test | Kind | Phase | Last run | Result |
|---|---|---|---|---|
| [Type check and build](#type-check-and-build) | Automated | M1 | 2026-10-16 | Pass |
| [Core package](#core-package) | Automated by hand, a scratch folder | After 0.3.1 (#7) | 2026-11-12 | **Pass** (Claude): packed and installed in a scratch project; `require` gives 144 exports, `import` works, EDGEfab's imports type-check against its types, no `powershell` or `SecureString` in it |
| [Smoke test](#smoke-test-the-library-against-the-game) | Automated, needs the game | M1 to M3 | 2026-10-26 | Pass, with the Desk's six checks (entries, variations, the move from the old Desk), and the items that wear a mesh look (2026-10-26: the slim-fits' leather look, `Items.Pants_01_basic_01`; index in 11 s), and microblends in the color map (the slim-fits' leather: base 87.1%, denim with lint 0.5%, piping 6.7%) |
| [MCP server](#mcp-server) | By hand, over stdio | M1 to M3 | 2026-10-20 | Pass. 2026-10-25: 11 tools listed; `mat_desk` adds, refuses a `.ent`, lists and clears, in a scratch cache. 2026-10-26: `mat_desk` add twice reuses the unedited entry (same id); remove of an unknown id is refused. `mat_find` with the slim-fits mesh and look `leather`: `worn_by` `Items.Pants_01_basic_01` (feminine) with its `cet` command; with item `Items.Pants_01_basic_01`, `cet` |
| [Game Materials view](#game-materials-view-in-vs-code) | By hand, F5 | M1 | 2026-10-17 | Pass (as the Library view) |
| [Game Materials name](#game-materials-name) | By hand, F5 | After 0.3.1 | 2026-11-13 | **Pass** (owner, laptop: steps 1 to 9); then the magnifier became **Filter Game Materials**, a funnel (2026-11-13, the owner: search and filter are different actions), and a filter opens the groups down to what it found: steps 2 to 4 and 7 rerun and passed the same day (owner, laptop). On the way: step 6 reworded (each title bar button by its look and tooltip); step 9 added after the owner saw a microblend's tooltip had no picture (fixed the same day) |
| [Surface page](#surface-page) | By hand, F5 | M2 | 2026-10-17 | Pass |
| [Setup editor](#setup-editor) | By hand, F5 | M2 | 2026-10-17 | Pass |
| [Find view](#find-view) | By hand, F5 | M2 | 2026-10-19 | Pass |
| [View in 3D](#view-in-3d) | By hand, F5, with REDcode | M2 | 2026-10-19 | Pass |
| [Setup editor: editing and Save to Project](#setup-editor-editing-and-save-to-project) | By hand, F5, with REDcode | M3 | 2026-10-20 | Pass |
| [New Material](#new-material) | By hand, F5, with an image service key | M3 | 2026-10-20 | Pass |
| [Generate round trip](#generate-round-trip) | In the game, with REDcode and Claude Code | M3 | 2026-10-20 | Pass on the owner's V |
| [Tiling check](#tiling-check) | In the game, from `npm run tiling-check` | M3 | 2026-10-20 | Done: LayerTile repeats the textures |
| [Reshape check](#reshape-check) | From `node scripts/reshape-check.mjs`, with Gemini and Tripo keys; then in the game | W3 | 2026-11-02 | **Passed** (owner, in the game): the cowboy hat with a brim about 1.8 times as wide, from GPT Image 2.5's picture, sits on V's head, one brim, the badge in front. Before it: V's head through the crown (fixed: the crown centred on the game's) and two brims (Gemini's picture) |
| [Materials from a model](#materials-from-a-model) | Automated by hand, with the game's files | M4 (#4, #6) | 2026-11-04 | **Pass** outside the game: EDGEfab's glowing vending machine (one material, four maps, glow strength 3) gave five textures and a .mi that reads back with every value (EV 5.585 under the first rule; 2.585 since 2026-11-05); texture files on a game screen mesh took its `xx_screen` entry only, the other four named as kept; `mat_from_model` over stdio. Smoke: the .mi's glow values |
| [Glow check](#glow-check) | From `npm run glow-check`, then in the game | M4 (#6) | 2026-11-05 | **Partly run** (owner, in the game, screenshots, strength 1, EV 4): it glows and follows the map, but very bright in a dark room: the middle washes out to white, with cyan only at the edges and in the halo. Too bright for small lit details (owner); it depends on the use. Strength 0.25 (EV 2) looks the same to the owner, in the installed archive and loaded by the game. Strength 0.0625 (EV 0): EV does act: the halo is much tighter and V's vest loses its tint, but the middle is still white, as a game sign in the same shot looks. EV -4, EV -2 and EV 0 with the color at a sixteenth: all black, which no dimming explains well. The owner's control, strength 1 again: the glow returned, so nothing else interferes and the drop is real. The ladder at EV 0: the whole hat dark. **The ladder at EV 1 (read back from the game folder): all six levels show, in a dark room and in daylight, no wide bloom.** So EV 0 and below is off; the rule is now 1 + log2(strength), never below 1. **The color dimming passed too** (EV 1, the color at a quarter). Passed; the vending machine in the game stays with EDGEmat #6 |
| [Paint check](#paint-check) | From `npm run paint-check`, with a Tripo key; then in the game | W2 | 2026-10-31 | **Passed** (owner, dev PC): Tripo keeps the garment's vertices and UVs, and its paint shows in the game as painted. It paints no repeating pattern |
| [M3 in-game round trip](#m3-in-game-round-trip) | In the game, with REDcode and Claude Code | M3 | 2026-10-20 | Pass on the owner's V; the deploy needed a separate step |
| [M2 phase test](#m2-phase-test) | Against WolvenKit's reading, and by the owner | M2 | 2026-10-19 | Pass |
| [The Desk](#the-desk) | By hand, F5, with REDcode | After 0.3.1 | 2026-11-13 | **Pass** (owner, laptop, 2026-11-13: all 24 steps). On the way: clearer wording for steps 2, 6, 10, 11, 14 and 18; step 14's project now opens in REDcode (owner's ask); step 18 first gave no Replace or Keep question because the new material went on another look than the one edited (no clash; the test now uses **leather** throughout); step 23 failed with ENOTEMPTY on `desk\items` (a held file), fixed the same day and passed on the rerun. Earlier: **2026-11-13 (owner, laptop): run up to step 19, with no failure reported before step 18 (results of steps 15 to 17 not yet reported), after clearer wording (steps 2, 6, 10, 11, 14, 18) and a change: step 14's project now opens in REDcode. Step 18 first showed no Replace or Keep question: the new material went on another look than the one edited in step 7, which is no clash (the step now says to use **leather** throughout). Rerun on leather: the question shows.** Replayed the same day on the dev PC with the core (leather edited on the Desk, added, the blue variation added, a material put on leather in the project): the conflict is found. Still to run: 19 to 24. Earlier: **Partly run by the owner after the rework, 2026-10-26: steps 1 to 3, 5 to 11, 13, 14, 16, 17 and the first part of 21 pass.** Still to run: 3b (new: Add to Desk in Find), 4, 12, 15, 18 to 20, the rest of 21, and 22 to 24. Earlier runs: 2026-10-25, two failures. Step 12 said "0 files written" in a project that already had its own slim-fits (pointed at other materials), and the edit stayed on the Desk with only a log line; Add and Clear would have deleted it. After the add, the game's mesh in Game Assets showed the Desk's edit in 3D. Both fixed 2026-10-26. A second run the same day: a second pair of slim-fits from Game Assets showed the first pair's edit (the Desk kept one edit per setup for all entries), and a project file kept reading "the project's copy" after the project was closed. Reworked 2026-10-26 into entries with their own edits, variations and a **+** per entry, with new steps |
| [Microblends and worn looks](#microblends-and-worn-looks) | By hand, F5, with REDcode | After 0.3.1 | 2026-11-13 | **Pass** (owner, laptop: steps 1 to 7; step 1 reworded to use Game Assets' Filter, not its Search pick list, which cannot be right-clicked). Earlier: **Steps 2 to 6 passed (owner, 2026-10-27).** Step 1 opened the look **green** (worn by 1 item, and before **leather** in the mesh), not **leather**: the Desk took the first look any item wears. Changed the same day to the look the most items wear, and Find got a **+** (Add to Desk) on each mesh: rerun step 1, and step 7 (new). The smoke test checks the slim-fits' leather shares (base 87%, denim with lint 0.5%, piping 6.7%) |
| [Which item: In the game](#which-item-in-the-game) | By hand, F5, then in the game with REDnode's Console | After 0.3.1 | | Not run yet. Built 2026-10-26; the smoke test checks the lookup on the slim-fits, and `mat_find` over stdio returns `worn_by` |
| [Open Mesh in EDGEmat](#open-mesh-in-edgemat) | By hand, F5, with REDcode | After 0.3.1 | 2026-11-13 | **Pass** (owner, laptop, 2026-11-13: every step, 1 to 7 and 4b). On the way: step 2's tooltip paths were cut off, so they wrap now; step 7 seemed to do nothing, so the look's layered material now opens in the setup editor. Earlier: **Partly run by the owner: steps 1 to 3 pass; step 4 failed** (the edit vanished from view after a tab switch, and Save to Project pointed the citizen jeans' meshes, not the project's). Both fixed the same day. Since 2026-10-25 the mesh goes on the Desk: run [The Desk](#the-desk) first, then this test from step 3 |
| [Open Material in EDGEmat](#open-material-in-edgemat) | By hand, F5 | After 0.3.1 | 2026-11-13 | **Pass** (owner, laptop, 2026-11-13: steps 1 to 6). Reworded on the way: a click already opens the setup editor (the default editor for `.mlsetup`); step 3 names REDcode CR2W Editor; step 6 expects Open in EDGEmat on a mesh. Earlier: Not run yet. Type check and build pass (2026-10-21) |
| [Keys in VS Code](#keys-in-vs-code) | By hand, F5, then Claude Code | After 0.3.1 | 2026-11-13 | **Pass** (owner, laptop: steps 1 to 7). Step 6 first failed: the copied command had no `-e` for the key (Copy skipped the keys; the same in 0.3.1); fixed the same day and passed on the rerun. Built 2026-11-11 (EDGEmat #10); the packaged VSIX has no PowerShell decryption, and `mat_generate`'s no-key answer over stdio passes. It replaces **Shared keys**, withdrawn unrun when the shared key store was shelved |
| [Wardrobe Designer W0](#wardrobe-designer-w0) | By hand, in the game with REDnode and REDagent | W0 | 2026-10-30 | **Passed** (owner, every step): 6 worn items read in 4.6 s (with the item index of 2,074 clothing items); V's Pants' 12 layers in 2.1 s over REDnode's REDbridge, the window over the inventory screen taking clicks; three plans in 3.0 to 6.2 s for $0.09 in all, with real presets of the right color (checked with `mat_colors`) |
| [Wardrobe Designer W1](#wardrobe-designer-w1) | By hand, in the game with REDnode and REDagent | W1 | 2026-10-30 | **Passed** (owner, every step: step 3 after the preview fix, [REDnode #28](https://github.com/Edgemodders/REDnode/issues/28); step 7 after the Restore fix, [REDnode #29](https://github.com/Edgemodders/REDnode/issues/29)). Built 2026-10-30; checked outside the game: V's Pants restyled into a scratch project twice (the second from the copy), packed (2 files), and `mat_restyle` over stdio |
| [Wardrobe Designer W2 patterns](#wardrobe-designer-w2-patterns) | By hand, in the game with REDnode, REDagent and a Gemini key | W2 | 2026-11-01 | **Passed** (owner, rerun from step 4): yellow dots, bigger dots staying yellow, the world look, `red leather` taking the pattern off, Restore. Faded dots near the tile edges: EDGEmat's seamless blend, not Gemini. Gemini refused one image once (`IMAGE_RECITATION`); pressing again worked |
| [Wardrobe Designer W2 pattern fixes](#wardrobe-designer-w2-pattern-fixes) | By hand, in the game with REDnode, REDagent and a Gemini key | W2 | 2026-11-02 | **Passed** (owner, in the game): the same picture kept at a new size and shine, no Gemini call; a picture that tiled across only shows faded dots in bands where it was blended down. Built 2026-11-01; checked outside the game on V's Pants with two saved Gemini pictures: the same words at a new repeat, then a new shine, made no image call and left only the new repeat's files; a picture that tiles across only was blended down only. Smoke: tiling, and the `IMAGE_RECITATION` retry against a stand-in |
| [Wardrobe Designer Reshape and keys](#wardrobe-designer-reshape-and-keys) | By hand, in the game with REDnode 0.56.1 or later, REDagent, OpenAI and Tripo keys | W3 | 2026-11-03 | **Steps 1 and 2 as expected** (owner): with every key set and allowed already, it opened on the main view. Two fixes the same day, from the log and the owner: Equipment-EX's slots were not read (the app's TweakDB check for them failed with Equipment-EX 1.2.10 installed), and the white pictures clashed with the dark window (now shown on a dark background). Then the owner saw an item Equipment-EX's outfit no longer wore listed as **Outer torso** (still equipped in the base slot, hidden): with the outfit on, the app now reads only its slots. Rerun from step 3 after **Restart** |
| [Wardrobe Designer patterns with GPT Image](#wardrobe-designer-patterns-with-gpt-image) | By hand, in the game with REDnode, REDagent and an OpenAI key | W2 | 2026-11-02 | **Passed** (owner, in the game): sharp, even dots front and back, none faded ("much better than Gemini"); REDnode asked for the OpenAI key once; the switch works and is saved. Not seen: a restart with Gemini chosen |
| [Wardrobe Designer install](#wardrobe-designer-install) | By hand, in the game, from the release zip | Each Wardrobe Designer release | | Not run yet. Added 2026-10-30 with the release scaffolding; the draft zip builds (65 KB, the game-folder layout) |
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

Expected: no errors; `extensions/edgemat/dist`, `packages/edgemat-mcp/dist` and `packages/edgemat-core/dist` written.

### Core package

Added 2026-11-12 ([EDGEmat #7](https://github.com/Edgemodders/EDGEmat/issues/7)): `@edgemodders/edgemat-core` works for a tool that installs it from npm, as EDGEfab will. In a terminal at the repository root, with a scratch folder outside it.

| Step | Do | Expect |
|---|---|---|
| 1 | `npm run build --workspace packages/edgemat-core`, copy `LICENSE` into `packages/edgemat-core`, `npm pack --pack-destination <scratch>` there, then delete the copy | `edgemodders-edgemat-core-<version>.tgz`: `dist/index.cjs`, its map, `dist/types/*.d.ts`, README, LICENSE, package.json, about 216 KB |
| 2 | In an empty scratch folder: `npm init -y`, `npm install <the .tgz> typescript @types/node` | `pngjs` and `vscode-jsonrpc` come with it |
| 3 | `node -e "const c=require('@edgemodders/edgemat-core'); console.log(Object.keys(c).length, typeof c.materialsFromModel)"`, and the same with `node --input-type=module -e "import { materialsFromModel } from '@edgemodders/edgemat-core'; ..."` | A count (144 on 2026-11-12) and `function`, both ways |
| 4 | A `.ts` file with EDGEfab's imports (`bridgeOver`, `materialsFromModel`, `projectAt`, `BridgeClient`, `isGameFolder`, `resolveBridge`, `resolveGame`, `vscodeUserSettings`, `readPng`, `writePng` and the types `BridgeCall`, `FromModelMaterial`, `ModelGlow`, `Image`), `tsc --noEmit` with `module` `Node16` and `strict` | No errors |
| 5 | Search `node_modules/@edgemodders/edgemat-core/dist/index.cjs` for `powershell` and `SecureString` | None |

Last run 2026-11-12 by Claude: every step as expected.

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
| The Desk (2026-10-25) | In a scratch Desk: the slim-fits mesh put on twice is one entry; its setup (the citizen jeans', `ml_l1_012_wa_pants__jeans_tight.mlsetup`) edited to red and saved on the Desk is the one edit there, and the 3D view's color map changes with it. Added to a scratch project in about 0.1 s: the setup as `..._desk_project.mlsetup` reads back with the edit, and the mesh copied in names it (2 files). Added again: only the setup is written, the mesh still counted. With the mesh taken off, the edit stays on the Desk with a note; Clear empties it |
| Page images (M2) | 3 of 3 for `leather_bull_01_30`: the first in about 1.6 s while the bridge warms up, the rest in well under half a second, then instant from the cache |

The counts change after a game patch. A patch that adds surfaces is fine as long as "read" matches "listing".

## By hand in VS Code

### Game Materials name

Added 2026-11-06 (EDGEmat #8): the Library view is now Game Materials. Step 8 added 2026-11-10: a Desk entry's Add to Project has EDGEfab's new-file icon. Step 9 added 2026-11-13: a microblend's tooltip shows its picture, as a surface's does (the owner saw only a path). Only names changed, and the view's id is the same, so this checks the names and that its buttons still work.

1. Open this repo in VS Code, run `npm run build`, press **F5** and choose **Run EDGEmat**.
2. In the second VS Code window that opens, check:

| # | Do | Expected |
|---|---|---|
| 1 | Click EDGEmat's icon in the activity bar (left edge) | The views are **DESK**, **GAME MATERIALS** and **FIND**, in that order. None is called Library. Your open and folded views are as you left them |
| 2 | Hover the **GAME MATERIALS** header, then hold the pointer over its funnel icon and its refresh icon | Their tooltips say **Filter Game Materials** and **Rebuild Game Materials** |
| 3 | Fold **Surfaces** and **Microblends** first (click their arrows). Then press the funnel, type `leather`, press Enter | The box is titled **Filter Game Materials**; the view shows 7 surfaces, unfolded down to each one: **Surfaces**, the categories that hold a match, and **Microblends** if one matches. Clear the filter: your folding is as before. 2026-11-13: only the folded group showed (the owner); fixed and passed the same day |
| 4 | Press the funnel again, type `zzzz`, press Enter | The view says **Nothing in Game Materials matches your filter**, with a **Clear Filter** button. Press it: the full list returns |
| 5 | Press the refresh icon (**Rebuild Game Materials**), then the view's **...** menu › **Show Log** | The view shows progress. The log (Output › EDGEmat) has a line `Game Materials built in ...` |
| 6 | Hover the **GAME MATERIALS** header again. Its title bar has, from left to right: a sparkle (tooltip **New Material...**), a page with an arrow pointing into it (tooltip **Open Setup...**), the funnel, the refresh icon, and three dots at the right end (tooltip **More Actions...**). (a) Press the sparkle. (b) Go back to EDGEmat's view, press the page with the arrow. (c) Press the three dots | (a) A **New Material** tab opens; close it. (b) A box titled **Open Setup** at the top of the window, with **From the game...** and **A file on disk...**; press Esc. (c) A menu with **Set Game Folder**, **Show Log** and **Connect an Assistant (MCP)...**; press Esc |
| 7 | Press Ctrl+Shift+P and type `EDGEmat: ` | The list has **EDGEmat: Filter Game Materials** and **EDGEmat: Rebuild Game Materials**, and nothing named Library |
| 8 | Put something on the Desk if it is empty (Find › a garment › its mesh line › **+**, Add to Desk), then hover the entry's line on the **DESK** | Its Add to Project button is a page with a corner folded and a small plus (VS Code's new-file icon, as on EDGEfab's Desk), with the tooltip **Add to Project...**. The Desk's title bar keeps its **+** (Add the Desk to Project...) |
| 9 | In **GAME MATERIALS**, unfold **Microblends** (the second group, below **Surfaces**) and hold the pointer over one, such as **dirt stains**. Then unfold **Surfaces**, a category in it, and hold the pointer over a surface, to compare | Both tooltips have the same shape: the picture, the name in bold, a line saying what it is (for a microblend: "a small detail texture that breaks up a layer's mask edge"), and the game path in a box. Before the fix, a microblend showed only its path |

### Game Materials view in VS Code

Run 2026-10-16 and again 2026-10-17 by the owner: **all pass.**

1. Open this repo in VS Code, run `npm run build`, press **F5** and choose **Run EDGEmat**. A second VS Code window opens with EDGEmat loaded from source.
2. In that window, check:

| # | Check | Expected |
|---|---|---|
| 1 | The activity bar | The EDGEmat icon (corner brackets around two layers): yellow when inactive, white when active, in the REDnode HUD theme |
| 2 | Game Materials on first open | "386 surfaces · 131 microblends · built <date>". A first build shows progress in the view and takes under half a minute |
| 3 | Surfaces | Grouped by category (fabric, metal, plastic and so on), each with a thumbnail |
| 4 | Hover a surface | A larger thumbnail, its color count and its game path |
| 5 | Microblends: the second top-level group, below all the surface categories (Collapse All in the view's title bar shows both groups) | Listed with thumbnails when opened |
| 6 | Filter (funnel) for `leather` | 7 surfaces. **Clear Filter** restores the full list |
| 7 | Rebuild (refresh) | Progress in the view; done in a few seconds |
| 8 | Output › EDGEmat | Names the bridge used: "Using REDcode's REDbridge" when REDcode is active with the same game, otherwise "Starting REDbridge from ...". The first line was added after the 2026-10-16 run; before it, only EDGEmat's own bridge was named |

### Surface page

Run 2026-10-17 by the owner: **all pass.** Before that it was rendered in headless Chrome with real library data and a stand-in for VS Code, to catch layout and script errors.

Where things are: the Copy buttons sit after the game path at the top, beside Preset, RGB and Swatch in the color panel under the image, and under each texture image. Below about 760 px wide the page is one column, with the image and color panel above Colors.

1. `npm run build`, then **F5** (**Run EDGEmat**), as for the Game Materials view.
2. In the development host, check:

| # | Check | Expected |
|---|---|---|
| 1 | Click a surface in Game Materials, such as fabric › leather bull 01 30 | An editor tab opens with its title and a small icon. The page shows "Surface · fabric › leather", the game path with Copy path, an image (the thumbnail at once, a sharper one within a second or two), and the default color selected |
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
| 1 | **Open Setup** (in the Game Materials title bar, hover the header: the page with an arrow pointing into it, second from the left) › From the game › `s1_055 red yellow` › `ml_s1_055_pma_shoe__red_yellow_graphic` | A tab "ml_s1_055_pma_shoe__red_yellow_graphic", "Setup · game file", "19 of 20 layers show · ratio 1". A color map of the sneaker's texture (yellow canvas, red panels, black sole) and 20 layers |
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
| 1 | EDGEmat's activity bar icon › the **Find** header (below Game Materials) › its magnifier › type `rocker's heart` › open the item › your V's body (Feminine or Masculine) › `t2_084_pw?__short_sleeves.mesh` › click the material **black_red_glossy** | The setup editor opens `ml_t2_084_pma_jacket__short_sleeves_black_red_glossy`. Under the title: "Select a layer to change it." and a line saying Ctrl+S saves it into a project. Top right: Hide unused slots, Raw values, and a filled **Save to Project** button. The editor's title bar (top right of the tab) has a Save to Project icon |
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
| 13 | Open any game setup: **Open Setup** (the Game Materials title bar) › **From the game...** › type `s1_055 red yellow` (results appear as you type) › pick `ml_s1_055_pma_shoe__red_yellow_graphic`. Change a color, press Ctrl+S, then Esc in the list | Ctrl+S on a game file opens the Save to Project list (game files are never written). After Esc the tab stays unsaved, with no error message. Close it with Don't Save |
| 14 | Another color theme: with a layer's details open, press Ctrl+K then Ctrl+T, and arrow through the list (VS Code previews each). Try at least **Light Modern** and **Dark Modern**; Esc goes back to yours | In each: the swatches show and the current one is outlined; the filter box, drop-downs and number boxes are readable; Save to Project stands out; the share bars and map show |

### M3 in-game round trip

The phase test (design, "Phases"): recolors made in EDGEmat, by asking Claude, and from a setup opened outside the project, each saved into a REDcode project, packed and deployed by REDcode, and seen in the game. **Run 2026-10-20 by the owner on the laptop: pass.** The jacket, the jeans and the sneakers showed their new materials in the game. The sneakers were recolored from the game's setup and saved both ways (as a new setup, and in place with Material Texture Override); with both in the project, the mesh copies point at the new setup, so the game shows that one. Two things got in the way, neither in EDGEmat: with Red Hot Tools installed, Pack and Try sends the archive to `archive\pc\hot`, which Red Hot Tools reads only while the game runs, so with the game closed it stayed there and a separate Deploy from REDcode was needed; and the project packed as a REDmod (`redcode.pack.redmod` on), into `mods\`, which loads only when the game starts with `-modded`. Not checked: the other body, and screenshots (F). Before that, B's saving part passed: Claude saved both jeans, and the saved setups and meshes show dark green in EDGEmat and in REDcode's 3D view, after fix `3336eb7` (the feminine jeans' mask set sits in another folder). Saving as a new setup needs no other mod; Material Texture Override can stay installed or not.

All three go into the `EDGEmat_M3` project from the test above, on three garments V can wear, so they do not clash.

| # | Do | Expected |
|---|---|---|
| A | The jacket from the setup editor test above (the Rocker's Heart crystaljock bomber, saved in step 11) | Saved already |
| B | Register EDGEmat's MCP server for Claude Code if it is not ([dev setup](dev-setup.html), section 4; build it first with `npm run mcp:build`; register with `--scope user`, or only the folder it was run in sees it). Start a new Claude Code session and ask: "Using EDGEmat, make the Sturdy-stitched punk jeans dark green on both bodies, and save it into my project E:\Modding\Cyberpunk 2077\Projects\EDGEmat_M3." | Claude finds the item (`mat_find`), sees that the two bodies wear different meshes with their own setups (`l1_066` feminine, `l1_062` masculine), looks at the layers (`mat_describe`) and recolors both (`mat_edit`), and says which files it saved: a new setup and a mesh for each body. To look at them: right-click a saved `.mlsetup` › **Open With...** › **EDGEmat Setup Editor** (REDcode's tree also opens `.mlsetup`), and open a saved `.mesh` from the project in REDcode's 3D view with the **black_punk** appearance chosen (it opens on the first one) |
| C | In the development host: Open Setup (the Game Materials title bar) › **A file on disk...** › `E:\Modding\Cyberpunk 2077\Projects\EDGEmat_M0\source\archive\base\characters\garment\player_equipment\feet\s1_055_shoe__converse\textures\ml_s1_055_pma_shoe__red_yellow_graphic.mlsetup`. It is the M0 round 1 setup: the sole red, the collar lining white, the toe cap layer hidden. **Save to Project** › EDGEmat_M3 › As a new setup › Enter › both sneaker meshes ticked › OK | "Setup · project file" (of the M0 project); saved into EDGEmat_M3 as `..._edgemat_m3.mlsetup`, with `s1_055_pma_shoe__converse.mesh` and `s1_055_pwa_shoe__converse.mesh` |
| D | In REDcode with EDGEmat_M3 open: **Pack and Try** (or Pack and Install). Answer **Deploy all** if REDcode asks. Start the game. With Red Hot Tools installed, Pack and Try only sends the archive to `archive\pc\hot` for a running game: with the game closed, use **Pack and Install** (or Deploy) instead | The project packs with no errors and is installed: `<game>\archive\pc\mod\EDGEmat_M3.archive` exists (folder `mod`, singular). If it went to `mods\EDGEmat_M3\` instead, `redcode.pack.redmod` is on, and the game must start with `-modded` (REDcode's Run Game does) |
| E | In the game, with Cyber Engine Tweaks' console: `Game.AddToInventory("Items.Jacket_01_old_01", 1)`, `Game.AddToInventory("Items.Pants_03_basic_01", 1)`, `Game.AddToInventory("Items.CasualShoes_01_basic_01", 1)`. Equip all three; look in third person (photo mode or a mirror) and at your arms in first person | The jacket shows your blue and leather layer; the jeans are dark green; the sneakers have a red sole, a white collar lining and no black toe cap |
| F | Screenshots before and after | Kept outside the repo |

### New Material

Built 2026-10-20 (M3, Generate's first slice). **Run 2026-10-20 by the owner on the laptop: all pass**, with a real image service key (the first live calls). Before that: the page rendered in headless Chrome with a take (stubbed service), the smoke test's Generate checks, and `mat_from_image` and `mat_apply` over stdio. You need a REDcode project open (EDGEmat_M3 is fine) and, for steps 4 to 8, an API key for Google Gemini (aistudio.google.com › Get API key) or OpenAI (platform.openai.com › API keys; GPT Image may ask you to verify your organization first). Each Generate spends a few cents of your credits. `npm run build`, then F5; every step happens in the development host.

| # | Do | Expected |
|---|---|---|
| 1 | EDGEmat's activity bar icon › the **Game Materials** header › the sparkle icon (**New Material...**, leftmost) | A **New Material** tab: "Where it goes" says not on a mesh yet; **1. The image** with two tabs, From words (AI) and From an image file; a text box, Detail, the service (Google Gemini), the model ("Newest (listed when you generate)"), List models, a line on credits and the key, and **Generate** |
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

### Reshape check

Added 2026-11-02 (owner: W3 next): design, "Reshape: a garment's shape changed by words", "A reshape check first". Can a garment's shape be changed by words, through pictures, on a stiff garment? `extensions\edgemat\scripts\reshape-check.mjs` runs Reshape's steps one at a time, keeping each step's files in the project's `source\raw\edgemat\reshape\<item>` folder and reusing them, so each can be looked at before paying for the next:

| Step | What it does | `--until` | Cost |
|---|---|---|---|
| 1. Views | Exports the item's meshes as `.glb`, draws them front, left, back and right (orthographic, the look's colors from EDGEmat's color maps, soft light, white), the garment half the square so a change has room. `views.png` (two by two) and `views.json` (scale, centre, box) | `views` (default) | None |
| 2. Change | Sends `views.png` to Gemini with the words; cuts the answer into four views; prints each view's outline before and after, in metres | `edit` | A few US cents. The same words reuse the picture; `--again` asks again; `--model` picks Gemini's model |
| 3. Model | Uploads the four changed views to Tripo's multiview to model (`v3.1-20260211`), downloads the `.glb` and Tripo's preview, and draws the model the same way | `model` | 30 credits (US$0.30) on 2026-11-02 |
| 3b. Fewer faces | Tripo's retopology of that model to `--faces` (default 6000), its texture baked on | `model` | 30 credits |
| 4. Fit | For a garment on one bone (a hat). Drops stray pieces (wholly outside the model's main box, or under 0.5% of it); turns Tripo's model (it faces +X) to the garment's front; places it on the box the changed views show, by their scale; writes a `.glb` shaped as WolvenKit's export (the armature and skin kept, one part, every vertex on the bone, tangents from the UVs) at the mesh's raw path; imports it over the mesh; Tripo's color and roughness as a textured material on the look's first material; packs | `fit` | None |

Run it as `node extensions\edgemat\scripts\reshape-check.mjs "<your Projects folder>\EDGEmat_ReshapeCheck" --until edit --what "cowboy hat"` after `npm run build` in `extensions\edgemat`. The game's export is kept as `<mesh>.original.glb` in the work folder. **Since 2026-11-02 the steps live in EDGEmat's core** (`src/core/reshape.ts`, with `glb.ts` and `tripo.ts`), as Wardrobe Designer will run them, and the script is a thin wrapper. The work folder keeps `reshape.json` (the views, each change, whether the garment can be fitted) and `fitted.json` (the meshes it fitted); the views are drawn once (`--redraw` starts over); each change builds on the last (`--from game` starts from the game's look); `--picture <file>` adds a picture made before as the change, with no image service asked. Rerun through the core on a new project (`EDGEmat_ReshapeCore`) with GPT Image's picture and Tripo task `e2727342-…` reused (no new cost): the same outlines, the crown moved 0.4 cm, imported, 4 files packed. Before, the fit's mark file sat beside the mesh and was packed too.

| # | In the game | Expected |
|---|---|---|
| 1 | With the game closed, copy `<project>\packed\archive\pc\mod\EDGEmat_ReshapeCheck.archive` into `<game>\archive\pc\mod` | |
| 2 | Start the game, load a save with a feminine V. **F10** › REDnode's launcher › **Console**: `addItem("Items.Hat_02_basic_01")`. Inventory › **Head**: equip the **Cowboy hat with hardened-leather band** | The inventory's preview shows the wide-brimmed hat |
| 3 | Photo mode: front, each side, back, and a look up and down | The hat sits on the head as the game's did: not floating, not sunk into the forehead; hair not through the crown; the brim about 1.6 times as wide; the band dark with the lit badge at the front; the texture the right way up (as `fit_..._views.png`). It moves with the head |
| 4 | Screenshots; take the archive out of `archive\pc\mod` afterwards | Shared with the session | Defaults: the Cowboy hat with hardened-leather band (`Items.Hat_02_basic_01`, `h1_021_pwa_hat__cowboy_sheriff.mesh`, look `white`), feminine, "make the brim twice as wide".

**Run 2026-11-02 by Claude on the dev PC, steps 1 to 3.** The hat: 1 mesh, 4 parts, 2,538 triangles, 0.31 × 0.19 × 0.35 m. WolvenKit names the most detailed level `LOD_1`. The `.glb` faces +Z (the front brim dips, the buckle is at the back).

| Try | Model | What came back |
|---|---|---|
| 1 | Nano Banana 2 Lite (picked by mistake: the "mini" in "Gemini", fixed) | Brim 14% wider, not twice; the back's buckle copied onto the front |
| 2 | Nano Banana Pro, prompt "the same size" | Nearly unchanged (the hat filled 80% of each square, and the prompt said to keep its size) |
| 3 | Nano Banana Pro, the hat half the square, "the same camera and scale; it may grow" | **Brim 1.6 times as wide in all four views, the crown unchanged, the views in step**; the buckle only at the back. 14 s |

Tripo, task `080581f8-…`, from try 3: 130 s, 30 credits. A believable cowboy hat with the wide brim, the band and the back buckle, in the hat's colors; a small loose piece beside it. **1,484,202 triangles** (the game's: 2,538): the next run asks for fewer. Tripo's model faces +X, scaled to 1 m.

**Step 4, the same day (Claude):** the hat is on one bone, `Head`, and has one level of detail; its export's vertex colors are all zero. Tripo's retopology (task `b220c41f-…`, 145 s, 30 credits) to 8,475 triangles, then a loose piece of 390 triangles beside the hat dropped (it had widened the fit), leaving 8,085 triangles and 6,890 vertices (the game's hat: 2,538 triangles). The fitted model drawn as the changed views matches them. Tripo's model came out rounder than Gemini drew it, so the fit stretches it a third more front to back than across (0.66 against 0.50). WolvenKit's import worked: the mesh now has 1 part on `Head` (the game's had 4: hat, band piece, emissive, glass), every look keeps its first material (`white` now Tripo's texture, 2048 px, with Tripo's roughness), box 0.50 × 0.55 m, the crown's top at the game hat's height. Packed: `EDGEmat_ReshapeCheck.archive`.

**In the game, the same day (owner, six screenshots: photo mode from below and above, the inventory from both sides, behind and the front three-quarter):** the hat sits on the head at the right height and moves with it, the brim wide, the dark band, Tripo's texture the right way up. **V's head showed through the front of the crown**: a skin-colored dome where the crown's front should be, from the side, the front and above. From behind it looked right. Not the faces: they all face out (the shell's signed volume is positive, winding agrees with the normals). The crown, measured along the centre line, sat 4 to 6 cm off the game's: the fit placed the whole outline's box, and Tripo's brim reaches further one way than Gemini drew, so the crown slid off the head. Fixed: the top 30% (the crown) is centred where the game's crown is (`--anchor`); moved 5.7 cm. Now along the centre line it runs −0.10 to +0.14 m around the game's −0.09 to +0.12 m. Also found: **WolvenKit's export faces −Z** (the lit badge on the band is the hat's front, not the back): `--front` is now −z by default, and this run's files, made with +z, are rebuilt with `--front +z`. Rebuilt and packed; steps 1 to 4 again. **The owner also saw two brims**, as if merged with the game's hat: Gemini's picture (Nano Banana Pro) has them, the game's upturned brim tips standing inside the wider brim, and Tripo and the fit kept them. So **the 3D steps are faithful to the pictures, and the pictures are where a reshape goes right or wrong** (owner: "better news"): the player refining the pictures before Tripo is paid for (design, Reshape step 2) is the right place for the effort. The prompt likely caused it: "the parts the words do not change stay the same size and place" and "it may grow" read as keep the old brim, add a new one.

**A new prompt, 2026-11-02 (Claude):** "a changed part replaces the old one: the old part is gone, not kept inside, under or beside the new one", and the hat's real front (`--front -z`). Nano Banana Pro: **one brim now**, but hardly wider (17% in front, the side views unchanged) and front and back unlike each other (curled up in front, flat and wide behind). The script now takes `--service openai` (OpenAI's `gpt-image-2.5-sunburst` by default: OpenAI's guide shows its edits endpoint taking pictures, up to four in its examples, with this model) and keeps each model's picture apart (`edit_<words>_<model>.png`; `--edit <picture>` picks one for the next steps). **GPT Image 2.5 (`gpt-image-2.5-sunburst`, the owner's key, the same prompt and views, 1536 px, 32 s): the best so far.** One brim, about 1.8 times as wide and alike from every side (0.58 m in front, 0.57 m from the sides, 0.59 m behind; the game's 0.32 m), the crown and its pinch unchanged, the lit badge in front only. Gemini's: one brim with the new prompt, but barely wider and unlike from front to back.

**Built from GPT Image's picture (Claude, the owner's go):** Tripo task `e2727342-…` (145 s, 30 credits), its retopology `a0729f5c-…` (121 s, 30 credits) to 7,190 triangles, no loose pieces. Tripo's model matched the views' proportions (stretched 0.584, 0.586, 0.578). The crown moved 0.3 cm when centred, and along the centre line it holds the game's crown at every height. The top is 3.4 cm above the game hat's: GPT Image drew the crown about 2 to 2.5 cm taller and the band 0.6 cm (front) to 1.8 cm (back) higher, measured on the front and back views, so the hat may sit about 1 cm higher on the head. Imported and packed. Steps 1 to 4 again.

**Result, 2026-11-02: passed** (owner, in the game: "much better"; six screenshots read by Claude). From below: one brim, smooth, nothing through it. Behind: the wide brim, crown and band, hair below. Both sides: the lit badge in front, the brim over V's visor, no skin through the crown. In front: the badge centred, the brim curling up at the sides as GPT Image drew it, the band just above the visor, no gap showing. From above: one brim, the badge in front; its outline a rounded trapezoid, wider behind (Tripo had no top view). **The owner's decision: GPT Image 2.5 is the default image service for Reshape** (the script's `--service` is now `openai` by default). Not done: the masculine mesh, the other looks' materials, Tripo's normal map. Not done: the masculine mesh, other looks' materials (the other looks show the hat in their old material on Tripo's UVs), Tripo's normal map.

### Materials from a model

Added 2026-11-04 (EDGEmat #4 and #6, for EDGEfab): `materialsFromModel` in the core, `mat_from_model`, and the API's `materialsFromModel`. Run outside the game with REDbridge, in a scratch project.

| Step | Do | Expect |
|---|---|---|
| 1 | `materialsFromModel` on EDGEfab's vending machine (test 8's `vending_glow.glb`: one Tripo material with color, metal and roughness, normal and glow maps, `emissiveFactor` 1, `KHR_materials_emissive_strength` 3), folder `edgemat\tests\vending` | Five textures (`_d01`, `_r01`, `_m01`, `_n01`, `_e01`) and a .mi; read back, the .mi is on metal_base with BaseColor, Roughness (scale 1), Metalness (scale 1), Normal, Emissive, EmissiveEV 2.585 (1 + log2 3) and EmissiveColor 255, 255, 255. Notes: the normal maps' direction is unverified |
| 2 | The same with texture files for `large_wall_screen_a_screen_aa.mesh`'s `xx_screen` (a color image, roughness 0.4) and glow `[0.2, 0.6, 1]` strength 2 with no map, and a glow for a material that does not exist | The mesh copied into the project, `xx_screen` pointing at the new .mi (local instance, no values of its own); the .mi has Emissive `white.xbm`, EV 2, color 124, 203, 255, RoughnessBias 0.4; notes name the glow left out and the four entries that kept their material |
| 3 | `mat_from_model` over stdio, the vending machine with a glow override (orange, strength 3, EDGEfab's mask) and a folder with forward slashes | Listed among the tools; glow EV 2.585, color 255, 188, 0, from the map; six files; "Nothing was put on a mesh" (no mesh given) |

**Last result:** 2026-11-04, every step as expected (17 s for the vending machine's five 2048 px textures, 4 s for step 2).

### Glow check

Added 2026-11-04 (EDGEmat #6): how bright glTF's glow strengths look in the game. EDGEmat turns a strength into the material's EmissiveEV as 1 + log2(strength), never below 1, from this test's results (design, "How glow works in the game"). `npm run glow-check` makes every material of the cowboy hat's look dark grey with a cyan glow in eight bands across its texture (a glow map), packed into the project's `packed` folder.

| Step | Do | Expect |
|---|---|---|
| 1 | In a terminal in `extensions\edgemat`: `npm run build`, then `node scripts/glow-check.mjs "E:\Modding\Cyberpunk 2077\Projects\EDGEmat_GlowCheck" --strength 1` | The hat's materials listed with "EV 1, color 124, 231, 255, in bands", then "packed 5 files" and the archive's path |
| 2 | With the game closed, copy `EDGEmat_GlowCheck.archive` from the project's `packed\archive\pc\mod` into `<game>\archive\pc\mod`. Make sure `EDGEmat_ReshapeCheck.archive` is not there (its hat would win). Start the game, load a save, **F10** › REDnode's **Console**: `addItem("Items.Hat_02_basic_01")`, put the hat on | |
| 3 | Look at the hat at night (or in a dark room), then in daylight; photo mode, front and side. Screenshots | Cyan bands that glow, dark grey between them. Note how bright: a lit screen, too dim, or glaring |
| 4 | Close the game, run step 1 again with a lower strength (below 1, EV stays 1 and the color dims; add `--ladder` for six map levels at once), copy, start the game (it reads archives only at its start), look again in the same place | Dimmer than step 3 (each EV is half as bright). Check whether the middle shows cyan instead of white, and whether it would suit a small lit detail |
| 5 | Optional: `--whole` for the whole hat glowing | The whole hat cyan and lit |
| 6 | Tell Claude: which strength looked like a lit screen | Claude sets the EV rule (`GlowEV.base`) from it and records the result |
| 7 | With the game closed, delete `EDGEmat_GlowCheck.archive` from `<game>\archive\pc\mod` | The hat is the game's again. Left there, it changes the same hat as Wardrobe Designer's Reshape test |

**Last result:** 2026-11-05, the owner at strength 1 (EV 4), two screenshots in a dark interior: it glows; lit and dark areas follow the map (patches, not straight bands: the hat's UVs are in pieces); the lit areas wash out to white with cyan only at the edges and in the halo. "Very bright, maybe too bright for accent lit details, but it depends on the application, where it appears and how much of it there is." V's vest looks tinted by it (from the glow's own light or the bloom: not told apart). This map is white at full brightness, a harder case than the game's screens. `GlowEV.base` stays 4 until a lower strength is seen. Strength 0.25 (EV 2), the same evening: the owner sees no difference from strength 1. Read back from the archive in the game folder, its materials say EV 2, and the game started after it was copied, so it was the one shown. Either the glow is still washing out, or EmissiveEV does not act as the rule assumes: unsettled. Strength 0.0625 (EV 0), the same evening, two screenshots in the same place: the owner sees it "might be a bit dimmer". Compared with strength 1: the halo shrinks from a wide bloom to a thin rim, and V's vest no longer looks cyan, so EmissiveEV does control the brightness and the earlier look was washing out. The lit areas are still white with cyan only at the rim. A game sign in the second shot looks alike (white letters, a green rim; out of focus, so a rough comparison). The blue patch and the blue NPC behind V do not change, so they are not the hat's. Not seen yet: any strength in daylight. Strength 0.00390625 (EV -4), the same evening: the owner sees the hat all black, no glow; EV -4 confirmed in the archive the game loaded. Either that is too dim to see, or a negative EV switches the glow off (no game material surveyed goes below EV 0). Strength 0.015625 (EV -2): three screenshots, a dark spot, a roofed plaza, the inventory screen: all black, no lit parts, and the inventory's light shows only the dark grey base. Four times dimmer than EV 0, which still washes out to white, cannot do that, so a negative EV seems to switch the glow off. So EV stops at 0 in the code and the color dims below it (`glowDim`). Strength 0.00390625 (EV 0, the color at a sixteenth, 29, 63, 71; read back from the installed archive): the owner sees solid black. So two different ways of dimming both go straight to black, while the game has glowing materials at EV 0 with a white map and colors such as 88, 123, 165, which casts doubt on "a negative EV switches it off" and on dimming as the cause. The glow map in the archive is intact (the eight bands read 255 and 0 in turn). The control, at the owner's suggestion, in case another change interferes: strength 1 (EV 4) again, the same values as the first run: the light returned. So the hat, the archive and the other mods are fine, and the glow really goes from lit at EV 0 to black at a quarter of it, by the EV or the color. Step 4b, one launch for many levels: `--strength 0.0625 --ladder` (EV 0, full color, the map in stripes of six levels, full down to an eighth), to see where it dies and whether the map can dim what the EV and the color could not. Result: the whole hat dark, with the archive in the game folder read back as EV 0, full color, ladder map. So the full-level stripes, the same values as the earlier EV 0 run that glowed, are dark. Unexplained contradiction: that earlier run's archive was not read back at the time, so it may not have been EV 0 (unverified). New idea, unverified: EV 0 and below is simply off, whatever the map or color, for example if the shader uses 2^EV - 1. It fits every dark run (EV -4, -2, 0), metal_base's default of EV 0, and the survey: no material with a color sits between EV 0 and 1.45. **The ladder at EV 1 (`--strength 0.125 --ladder` under the old rule):** four screenshots; the archive read back from the game folder says EV 1, full color, the ladder map. All six levels show, on the crown and brim, in a dark room and in overcast daylight, with hard edges, no wide bloom and no tint on V's clothes. The top levels are pale, the lower ones hold their cyan, and the dimmest is close to the base. So EV 0 and below is off, and the map dims smoothly above it. The early EV 0 run was brighter than this confirmed EV 1, so it was probably still the EV 2 archive (its copy not read back). The rule became 1 + log2(strength), never below 1, with the color dimming below strength 1 (`glowDim`). Strengths earlier in this record use the old rule, 4 + log2. **`--strength 0.25 --ladder` (EV 1, the color at a quarter, 63, 124, 137; read back from the game folder):** five screenshots, a dark room, neon streets, and under a street light. The color dims it: the top stripes hold saturated cyan instead of going pale, and two to four levels show before fading into the base, so about an eighth of strength 1 is the limit. Under direct light the base's shine is stronger and the lower stripes wash out. The test's question is answered; left for later, not worth the busy work: the exact point between EV 0 and 1, the shader's formula, and how ray tracing changes it.

### Paint check

Added 2026-10-31 (owner's ask): can Tripo paint a garment from words, on the garment's own shape? Tripo's Texture task takes a model and a prompt and paints it in 3D, following seams and shape, where Generate tiles a flat picture. If Tripo keeps the garment's vertices and UVs, its paint goes straight onto the game's mesh and W2's patterns need no mask and no Generate. The design's open question "Paint a garment by words".

`npm run paint-check` exports an item's garment from your game as `.glb`, keeps the parts with layered materials (positions, normals and UVs only: no bones, shape keys or garment data), sends them to Tripo with your words, and compares what comes back with what went out. If the vertices and UVs are kept, it writes Tripo's color and roughness as a textured material with the garment's own normal map, puts it on the garment and packs the project. The Tripo key comes from `TRIPO_API_KEY`, else (on the dev PC) the shared key store through REDnode's checkout (`scripts/devKey.mjs`), and is never printed. One run is 10 credits (US$0.10). `--task <id>` reruns on a finished task without paying again. `--style <image>` sends a picture beside the words as Tripo's style image. With options, run it as `node extensions\edgemat\scripts\paint-check.mjs <folder> --task <id>`: PowerShell drops the `--` in `npm run paint-check -- ...`, and npm then refuses `--task` as one of its own flags.

Defaults: V's Pants (`Items.Q001_Pants`) on the feminine body (`l1_066_pwa_pants__rogue.mesh`, look `default`: its layered material on 2 chunks is painted, `pants_stitches` is kept), words "yellow with black polka dots". `--item`, `--body` and `--words` change them.

| # | Do | Expected |
|---|---|---|
| 1 | Make a Tripo API key: Tripo's developer console, **API Keys**. The account needs at least 20 credits. Tripo has two regions with their own accounts and keys, global (tripo3d.ai) and China (tripo3d.com); the check tries global, then China | A key |
| 2 | Save it in PowerShell (it asks for the key and does not show it): `New-Item -ItemType Directory -Force "$env:APPDATA\Edgemodders\keys" \| Out-Null; Read-Host 'Key' -AsSecureString \| ConvertFrom-SecureString \| Set-Content "$env:APPDATA\Edgemodders\keys\tripo.txt"` | `%APPDATA%\Edgemodders\keys\tripo.txt` exists |
| 3 | In the repo: `git pull`, `npm run build`, then `npm run paint-check -- "<your Projects folder>\EDGEmat_Paint"` (or ask Claude to run it) | "sent: 2 parts, 9701 vertices"; Tripo's task going from queued to success; its preview image saved in `source\raw\edgemat\tripo`. Then **KEPT** or **NOT KEPT**. KEPT: one line for the painted material and "packed ... EDGEmat_Paint.archive". NOT KEPT: Tripo's paint needs a bake onto the game's UVs, and the check ends here |
| 4 | Only after KEPT. With the game closed, copy `packed\archive\pc\mod\EDGEmat_Paint.archive` into `<game>\archive\pc\mod` | The archive is in the game |
| 5 | In the game, a feminine V: Cyber Engine Tweaks' console `Game.AddToInventory("Items.Q001_Pants", 1)`, equip them, photo mode front, back and each side | The pants painted as Tripo's preview shows, with their own folds. Note: dots that follow the legs or break at the seams; anything upside down (rerun with `--task <id> --flip`); stretched or smeared spots; how the shine looks. If the pants look unchanged, `WardrobeDesigner.archive` may hold the same mesh (from a Restore): move it out of `archive\pc\mod` for the test (which archive wins is unverified) |
| 6 | Screenshots, front and back | Shared with the session; kept outside the repo |

**Run 2026-10-31 by the owner on the laptop, steps 1 to 3: KEPT.** The first try got "Invalid API key": the script called Tripo China's API with a global key (fixed: global first). Then task `281f6bfd-…`: 45 s, 10 credits. The result: 2 parts, 9,694 vertices (7 duplicates merged), 15,490 triangles, scaled to 1 m tall and moved (Tripo returned no normalize values for a Texture task, so the check fits the result's box); 100% of its vertices on the garment's, 100% with the same UV. 2 materials and 6 images: **Tripo gives each part its own material and textures**, and the first build put the first part's on both. Fixed the same day: one game material over several parts gets one texture, each texel from the part that covers it (checked on a made-up two-color result: the second part is small islands, pockets or trims, about 5% of the texture). Also: file names shortened, since a long project path went past Windows' 260 characters. Rerun with `--task 281f6bfd-b6c2-4d7c-9620-038e02187d28` (no new credits) before steps 4 and 5. The rerun: Tripo's two parts' maps differ in size (fixed: the smaller scaled to 2048 px). Its preview and color texture (owner's images): every island of the pants' UV layout painted in place, folds and pocket flap following the shape; but the dots are **few and small** (scattered, mostly down the front of the legs, not an all-over pattern), and Tripo added its own details (a black object at the hip pocket, a tan buckle, dark smudges along the bottom strips). Everything outside the islands is black, which the game's smaller mip levels would blend into dark seams (and glossy ones, from the roughness map). Fixed: the islands' edge colors pushed 16 texels out (11 s at 2048 px). Rerun with every fix (owner, laptop): material 0 (2048 px) covers 53.0% of the texture, material 1 (Tripo made it 256 px, scaled up, so blurry) 2.2%; no black left between islands. Material 1's islands are the black object Tripo painted at the hip pocket, two dark buttons and a few spots near the buckle. In the game on the laptop, the inventory screen only (the install there had trouble): the pants "looked perfectly fine" (owner), the dots very tiny. The full look in the world (step 5) is to finish on the dev PC. To try after the game test: stronger words or `--quality detailed` for the pattern.

**On the dev PC, 2026-10-31 (Claude, with the owner's key saved there): the pattern.** The laptop's task rebuilt with `--task 281f6bfd-…` into `EDGEmat_Paint` (no credits; same numbers). Then two new tasks, 10 credits each, both KEPT (100% / 100%):

| Project | Words | Style image | What Tripo painted |
|---|---|---|---|
| `EDGEmat_PaintDots` | "bright yellow fabric covered all over in large, evenly spaced black polka dots, each dot about the size of a coin" | none | Plain yellow; about five scattered dots on the whole texture. Fewer than the first run |
| `EDGEmat_PaintStyle` | "yellow fabric with large black polka dots all over, like the style image" | a yellow swatch with large black dots in a grid (`--style`, new) | A warmer yellow, a black waistband, black buttons, belt loops and hems; no dots |

So **Tripo paints a believable garment (its colorway, a color per part, details at seams, buttons and hems) and does not lay a repeating pattern**, from words or from a style image. Patterns come from EDGEmat itself (design, W2 step 6). Not tried: `--quality detailed`, and Tripo's `image` mode (one picture of the whole garment as wanted, which would need such a picture). Each of the three projects replaces the same mesh: put one archive in the game at a time.

**Steps 4 to 6 passed 2026-10-31 (owner, dev PC, `EDGEmat_Paint`, task `281f6bfd-…`):** "It looks good to me". The owner's three screenshots, read closely: right way up (no `--flip`); the folds and pocket shapes from the garment's own normal map; the game's stitching (`pants_stitches`, kept) on top; no dark lines between UV islands (the padding works); a matte cloth shine. Tripo's own details show where its preview has them: the black object at the hip pocket, a tan buckle on a thigh strap. **The dots are on one leg only** (owner): the color texture has them on one leg's islands and none on the other's, so it is Tripo's paint, not the build. Tripo seems to paint from a few views and does not keep a garment's two sides alike.

**Dry run, 2026-10-31** (`--dry`: steps up to the upload, no key): V's Pants, feminine. 2 parts, 9,701 vertices, 15,490 triangles, 0.42 × 1.03 × 0.26 m. The UVs use 55% of the square, 2.8% of that twice (mirrored or stacked: those spots get one paint). The matching, run on the upload file itself: 100% found, 100% same UV. The masculine jeans (`l1_062_pma_pants__jeans.mesh`), measured the same way: 1.2% shared on the jeans; the stitching's UVs repeat about 40 times along a strip, so a stitching material is never painted.

### Find view

Built 2026-10-17. **Last run 2026-10-19 by the owner through F5: all 10 checks pass.** The walks behind it were also run outside VS Code on the test set (smoke test, and `mat_find` over stdio).

1. `npm run build`, then **F5** (**Run EDGEmat**).
2. In the development host, open EDGEmat's activity bar container. **Find** is the last view, a **FIND** header below **Game Materials**, often collapsed at the bottom of the sidebar: click its header to expand it, and collapse Game Materials (click its header) if Find is squeezed. The magnifier at the top of the Library is **Search Library**, not Find; Find's own magnifier shows only when you hover over Find's header.

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
2. In the development host, open EDGEmat's activity bar container, expand **FIND** below Game Materials, press **Find...** and type `sunny ammo`.
3. Expand "Sunny Ammo synthetic high-tops", then **Feminine body**. Under it is the mesh row `s1_055_pwa_shoe__converse.mesh`.

| # | Check | Expected |
|---|---|---|
| 1 | Hover the mesh row `s1_055_pwa_shoe__converse.mesh` | Two icons at its right end: an **eye** (View in 3D) and **copy** (Copy Game Path) |
| 2 | Click the **eye** | REDcode's editor opens the mesh in a new tab, on its **3D** view. The status bar (bottom of the window) says: EDGEmat: pick the look "red_yellow_graphic" in the 3D view |
| 3 | In the 3D view's toolbar, pick **red_yellow_graphic** in the appearance list | The sneaker shows its colors: black sole, red trim, an orange-brown upper, as in the setup editor's color map. The 3D view says "EDGEmat: approximate". Nothing shiny or bumpy yet: colors only |
| 4 | Rotate the sneaker (drag in the view) | The colors sit where they belong on the shoe: the sole is black, the laces area matches the map. If the colors look scrambled or upside down, tell me: it means the map's orientation is off |
| 5 | Find `t2_078 samurai`, expand **Meshes**, right-click `t2_078_ma_jacket__samurai.mesh` › **View in 3D** | The jacket opens in 3D. On its first look it is near-black (the Arasaka jacket is black), with the Arasaka decals and stitches showing as textures |
| 6 | Switch the 3D view's appearance list to **no_bags** | The bags change to a flat color or disappear (their material is `mesh_decal.mt` without a texture) |
| 7 | **Show Log** (the Game Materials `...` menu) | Lines like `3D view: 5 of 5 materials for base\...\t2_078_ma_jacket__samurai.mesh, look default, in 1055 ms` |

### M2 phase test

**Passed 2026-10-19.** The test in the design: a game jacket shows the same layers WolvenKit shows, and Claude describes it correctly; a setup from a mod archive outside any project opens and reads the same.

| Part | How | Result |
|---|---|---|
| The same layers as WolvenKit | The Arasaka samurai jacket's setup (`ml_t2_078_ma_jacket__samurai.mlsetup`, the material `ml_t2_078_ma_jacket__samurai_masksset` on `t2_078_ma_jacket__samurai.mesh`, look `default`), read by EDGEmat and compared field by field with WolvenKit's own JSON of the file (REDbridge's `toJson` runs WolvenKit's reader) | 20 of 20 layers; all 360 fields equal (surface, color, tiling, offsets, opacity, levels, microblend and its settings); no field EDGEmat ignores; ratio and useNormal equal |
| Claude describes it correctly | `mat_describe` over stdio, as Claude Code calls it, and Claude's description from it | 14 of 20 layers shown, with their surfaces, colors, finishes and shares. The owner: "100% accurate". The white stitching is not in the setup but a separate decal material on the mesh (`pasted__decal_stitches`, `garment_decals_d01.xbm`), which `mat_find` lists: a whole-garment description combines the two |
| A setup from a mod archive | The setup editor hand test, step 10 (2026-10-17) | Pass |

### The Desk

Added 2026-10-25: the Desk view, Open in EDGEmat from REDcode's views, saving on the Desk, and **+** to put it in a project. Reworked 2026-10-26: entries with their own edits, variations, a **+** per entry. In the development host (F5), with REDcode, and a WolvenKit project open in REDcode (a fresh one is best, such as one made with REDcode's New Project). The slim-fits mesh is a good one: `base\characters\garment\player_equipment\legs\l1_012_pants__jeans_tight\l1_012_pwa_pants__jeans_tight.mesh`. A Desk from before 2026-10-26 is moved over on the first start: each entry keeps its edits (an older pair that shared an edit now has a copy each; take one off and open it again for a fresh one).

| Step | Do | Expect |
|---|---|---|
| 1 | Click EDGEmat's icon in the activity bar (left edge); if the Desk has entries, hover its title bar › **Clear the Desk...** | Three views: **Desk** at the top, then Game Materials and Find. The Desk is empty and says how to put something on it |
| 2 | Click REDcode's icon in the activity bar › hover the **Game Assets** header › the funnel icon (**Filter Game Assets**; not the magnifier, whose pick list cannot be right-clicked) › type `l1_012_pwa_pants__jeans_tight.mesh`, Enter: the tree narrows to it (or browse to `base\characters\garment\player_equipment\legs\l1_012_pants__jeans_tight\`). That one file is "the slim-fits" in every step below (the feminine body's; `pwa`) › right-click it | **Open in EDGEmat** in the menu, beside Open in Editor |
| 3 | Choose **Open in EDGEmat** | EDGEmat's activity bar opens on the Desk. The mesh is there, selected and open: its looks, with the first look an item wears open on its materials (since 2026-10-26; on the slim-fits, **leather**) |
| 3b | EDGEmat's **Find** view: search `comfy rocker`, open the item and its body, right-click the slim-fits mesh › **Add to Desk** | The Desk comes forward with the mesh selected, its look **leather** open on its materials. The same line as step 3 when it has no edits yet (no second one) |
| 4 | Right-click a `.ent` or `.app` in Game Assets › **Open in EDGEmat** | The entry is there for now (REDcode #15); a message says it takes a mesh, a setup or a surface. Nothing goes on the Desk |
| 5 | **Open in EDGEmat** on the slim-fits again | The same line is selected; no second one (it has no edits yet) |
| 6 | On the Desk, click the multilayered material under the look **leather** (it opens unfolded; use **leather** in every later step, since step 18 checks the same look: on the Desk, a mesh line has looks under it, such as **leather**, each with a palette icon; click a look's arrow › to unfold it, and its materials show under it: the one whose grey text says **multilayered · ...mlsetup**, with a stacked-sheets icon) | The setup editor opens. Under the title: "on the Desk (l1_012_pwa_pants__jeans_tight.mesh), as in the game" and "Ctrl+S saves it on the Desk" |
| 7 | Change a layer's color (click a layer in the list, then a swatch), then press **Ctrl+S** | Saved with no question. The tab's unsaved dot goes. On the Desk the mesh line and the material read "edited on the Desk" |
| 8 | Hover the mesh line › the eye icon (**View in 3D**) | The pants show the new color. The tab's path runs through `EDGEmat\desk\items\` |
| 9 | REDcode's **Game Assets** view: double-click the same slim-fits `.mesh` (its 3D view) | The game's look: the Desk's edit does **not** show. Also with the setup editor still open and changed, not saved |
| 10 | First check the jeans line on the Desk reads **edited on the Desk** (step 7 saved; without an edit, EDGEmat reuses the line, as in step 5). Then REDcode's **Game Assets** › right-click `l1_012_pwa_pants__jeans_tight.mesh` › **Open in EDGEmat**, a third time (not the **+** or a right-click on the Desk's own line, which select that line) | A second line, **l1_012_pwa_pants__jeans_tight.mesh, variation 2**, selected and open; the status bar says it is a fresh copy. Its material opens with the game's colors, and its View in 3D shows the game's look |
| 11 | Recolor variation 2 differently: on the Desk, under the line **l1_012_pwa_pants__jeans_tight.mesh, variation 2**, unfold its look **leather** (the arrow › before it) and click the material line under it whose grey text says **multilayered · ...mlsetup** (a stacked-sheets icon). In the setup editor, click a layer in the list, pick another color than step 7's, Ctrl+S. Then right-click that top line itself, **l1_012_pwa_pants__jeans_tight.mesh, variation 2** (the mesh's own line, not a look or material under it) › **Rename...** › a box at the top titled "Rename l1_012_pwa_pants__jeans_tight.mesh on the Desk" › type `blue`, Enter | Both lines read "edited on the Desk"; the second now reads **..., blue**. Each line's View in 3D shows its own color |
| 12 | Close VS Code's development host and press F5 again; open EDGEmat | Both lines are still there with their edits and names |
| 13 | Hover the first line › its new-file icon (Add to Project...) | Project pick if REDcode has none open. A dialog: "Add l1_012_pwa_pants__jeans_tight.mesh to <project>?", with **Add to Project** and **Add and Take It Off the Desk**. With a project picked here (not open in REDcode), the dialog's last line: "Then <project> opens in REDcode, in this window, which reloads (the Desk stays as it is)" (or "in a new window" when this window has a folder open) |
| 14 | Choose **Add to Project** | When REDcode had the project open: "Added ... to <project>: 2 files written", with **Pack and Try**. When you picked a project in step 13: the window reloads (or a new one opens) on the project; REDcode's Project view comes forward, and the same message shows, saying under which folder the mesh is (until [REDcode #27](https://github.com/Edgemodders/REDcode/issues/27) lets EDGEmat select it), with **Pack and Try**. The Desk is as before. 2026-11-13: the project did not open (the owner), so EDGEmat now opens it. In REDcode's Project view: the setup beside the game's as `..._<project>.mlsetup` (under `citizen_casual\legs\...\textures`), and the slim-fits `.mesh` under `player_equipment\legs` |
| 15 | **Pack and Try** (or Pack and Install), then look at V in the slim-fits in the game | The pants in the first line's color, with no other mod |
| 16 | Hover the Desk's title bar (the word DESK) › the **+** (Add the Desk to Project...) | A pick first: "The Desk has 2 variations of l1_012_pwa_pants__jeans_tight.mesh", listing both and **Skip this one** |
| 17 | Pick **..., blue** › **Add to Project** | "1 file written" (the setup, now blue; the mesh already points at it). The project's slim-fits shows blue in its 3D view |
| 18 | Give the project's own jeans another material, so they differ from the Desk's. The project must be open in REDcode (it is since step 14). (a) In EDGEmat, the **FIND** view (below Game Materials) › hover its header › the magnifier (**Find...**) › type `comfy rocker`, Enter. (b) Unfold the item **Comfy rocker aramid-weave slim-fits** whose grey text ends `Items.Pants_01_basic_01` (arrow ›), then **Feminine body**, then the mesh line `l1_012_pwa_pants__jeans_tight.mesh` ("look leather"). Find shows the game's lines here, not the project's; the new material still goes onto the project's copy, since the project has one. (c) Hover the material line under it, **leather** (grey text **multilayered · leather.mlsetup**, a stacked-sheets icon): a sparkle icon shows at its right end (**New Material Here...**; or right-click the line › **New Material Here...**). Click it. (d) A **New Material** tab opens; its "Where it goes" names the project's jeans. Under **1. The image**, the tab **From an image file** › **Choose an image...** › any photo on your PC (no key needed). (e) Under **3. The material**, a name such as `test photo`, then **Add to Project**: "Saved ... and put on ... mesh materials". (f) Back on the **DESK**: hover the first jeans line (not **..., blue**) › its new-file icon (**Add to Project...**). The question comes only when the look you gave a new material is the one edited on the Desk in step 7 (**leather**); a material on another look is no clash | Before the confirm, a question: "<project> already has its own l1_012_pwa_pants__jeans_tight.mesh from the Desk, with other materials", with **Replace with the Desk's** and **Keep the Project's** |
| 19 | Choose **Keep the Project's**, then **Add and Take It Off the Desk** | "nothing new to write ... 1 mesh stayed on the Desk with its edits". The line is still on the Desk, still "edited on the Desk"; the project's slim-fits still wears the new material |
| 20 | Its new-file icon (Add to Project...) again › **Replace with the Desk's** › **Add to Project** | The mesh is written again and the log says the project's copy was replaced. The project's slim-fits wears the first line's color in its 3D view |
| 21 | REDcode's Project view: right-click the project's `.mesh` › **Open in EDGEmat** | It goes on the Desk as a new line marked **from <project>**. Close the project in REDcode and open another: the line still reads "from <project>" (it is still that project's file); rename or delete that project's folder and it reads "from <project>, not found" |
| 22 | Hover a line › the × icon (Take Off the Desk) | It asks first if the line has edits, then it comes off; the other lines stay |
| 23 | Hover the Desk's title bar › **Clear the Desk...** › **Clear the Desk** | The Desk is empty. The project keeps its files. If a setup tab or 3D view of a Desk file is still open, Windows may keep that file a moment: then a note says EDGEmat deletes it when it next starts, and the Desk is empty all the same. 2026-11-13 (owner): an error, ENOTEMPTY on `desk\items`; fixed the same day, rerun |
| 24 | Optional, with Claude Code connected: ask "put the slim-fits on EDGEmat's Desk, then list the Desk" | `mat_desk` adds it with an id, and the Desk view shows it within a second or two |

### Microblends and worn looks

Added 2026-10-26, after the owner's in-game check of a leather recolor on the slim-fits: the color map drew the leather maroon (a denim layer the game hides through its lint microblend), and the Desk opened the **default** look, which no item wears. In the development host (F5), with REDcode. Take the slim-fits off the Desk first (hover its line › ×), so it comes on fresh.

| Step | Do | Expect |
|---|---|---|
| 1 | REDcode's icon in the activity bar › hover the **Game Assets** header › the funnel icon (**Filter Game Assets**; not the magnifier, whose pick list cannot be right-clicked) › type `l1_012_pwa`, Enter. In the tree, unfold down to `l1_012_pwa_pants__jeans_tight.mesh` and right-click it › **Open in EDGEmat** | The Desk opens with the mesh. The first time builds the item index (about ten seconds): the looks show at once, then again with marks. Its look **leather** is open (the one most items wear, 2), not **default** or **green** (1 item) |
| 2 | Read the looks' descriptions on the Desk | **leather**: "worn by 2 items" (the Comfy rocker and a test item). **default**, **disco**, **npc_mama_welles**: "no item". Close and open the Desk's mesh line again: the marks show at once |
| 3 | Under **leather**, click its material **leather** | The setup editor: the color map at the right is mostly the leather's red, with solid black piping and waistband; no maroon cast. Layer 5 (denim clean, "cool dark grey") shows under 1% of the texture |
| 4 | Hover the mesh line › the eye (**View in 3D**) | The pants mostly the leather's red with black piping, close to the game's color under its lighting. With REDcode 0.10.4 or later (REDcode #16), no seam on the lower left leg; with 0.10.3 or earlier, the seam is still there |
| 5 | In the setup editor, click layer 5 › **Microblend** › pick `default` | Within a second or two its share stays near 0 (its mask is under the default's threshold). Ctrl+Z puts lint back |
| 6 | EDGEmat's **Find** view: search `comfy rocker`, open the item and its body, right-click the slim-fits › **Add to Desk** | It opens on **leather** (the look it was found under), as before |
| 7 | Take the slim-fits off the Desk (×). In **Find**, the same search: hover the slim-fits mesh line | A **+** beside the eye and the copy button; its tooltip says **Add to Desk**. Click it: the same as step 6 |

### Which item: In the game

Added 2026-10-26 (owner's ask): after changing a mesh's material, which game item to give V to see it, with REDnode's Console (CET until 2026-11-13, when the owner dropped it). In the development host (F5), with REDcode and a project open. The slim-fits mesh again: its **leather** look is the Comfy rocker aramid-weave slim-fits, `Items.Pants_01_basic_01`, worn on the feminine body.

| Step | Do | Expect |
|---|---|---|
| 1 | Put the jeans on the Desk: EDGEmat's **FIND** view › the magnifier (**Find...**) › `comfy rocker` › unfold the item ending `Items.Pants_01_basic_01` › **Feminine body** › hover `l1_012_pwa_pants__jeans_tight.mesh` › its **+** (**Add to Desk**). (Or REDcode's **Game Assets** › the funnel (**Filter Game Assets**) › `l1_012_pwa` › right-click the `.mesh` › **Open in EDGEmat**: Game Assets knows file paths, not in-game names.) On the Desk, open the look **leather** and click its multilayered material | The setup editor opens. Under the header, **In the game**, folded (▸). Click it: first "Finding the items that wear ... (about ten seconds)" the first time, then **In the game (1)** and "Comfy rocker aramid-weave slim-fits", `addItem("Items.Pants_01_basic_01")`, "feminine body", and **Copy**. The note above them says REDnode's Console (F10 › the launcher › Console) |
| 2 | Click **Copy**, and paste in any text box. Then change a layer's color, and close and reopen the setup | The command, exactly as shown. The section stays open after the edit; a setup opened later starts folded again |
| 3 | On the Desk, hover the look **leather** | The tooltip ends with "Worn in the game by:" and the item with its id. Hover **default**: "No clothing item in the game wears this look" |
| 4 | Right-click the look **leather** › **Copy REDnode Command** (there is no Copy CET Command any more) | Copied straight away (one item); the status bar says so. On the mesh line itself: a pick of the items for every look |
| 5 | In Find, search `slim-fits`, right-click an item › **Copy REDnode Command** | That item's command, such as `addItem("Items.Pants_01_basic_01")` |
| 6 | Edit the leather look's color on the Desk, put it in the project (+), **Pack and Try**. In the game, press **F10**, open REDnode's launcher › **Console**, paste the command, Enter, and put the pants on V (a feminine V) | V gets the slim-fits, in the Desk's color |

### Open Mesh in EDGEmat

Added 2026-10-23: from a mesh in 3D to its materials in EDGEmat, and the 3D view drawing them again after a save. In the development host (F5), with REDcode, and a WolvenKit project holding a game `.mesh` under `source\archive` (REDcode's Asset Browser › right-click a mesh › Add to Project). The Comfy rocker slim-fits' `l1_012_pwa_pants__jeans_tight.mesh` is a good one: its leather material is multilayered.

| Step | Do | Expect |
|---|---|---|
| 1 | VS Code's Explorer: right-click the project's `.mesh` › **Open in EDGEmat** | Since 2026-10-25: EDGEmat's Desk opens with the mesh on it, "from <project>" (since 2026-10-26), its looks listed under it (was: the Find view). Since 2026-11-13: the open look's layered material also opens in the setup editor (on the jeans, **leather**), or its tab comes forward if already open; a look with several layered materials says in the status bar to click one on the Desk |
| 2 | Open a look (its arrow ›) › hover the material whose grey text says **multilayered · ...mlsetup** (a stacked-sheets icon) | Its setup and mask in the tooltip, each path whole, wrapping onto a second line where it is long (none cut off at the right edge); a click opens the setup editor. 2026-11-13: the paths were cut off (the owner); fixed and passed the same day |
| 3 | Open the mesh in REDcode (click it in REDcode's Project view), switch to its 3D view, keep the tab open | The mesh in 3D with EDGEmat's colors |
| 4 | In the setup editor from step 2, change a layer's color, then **Save to Project** › **As a new setup** (recommended) › accept the game path › keep the project's mesh ticked › Enter | Saved, and the project's mesh pointed at the new setup. Within a few seconds the 3D view from step 3 draws its materials again with the new color. Unverified: how REDcode's open tab takes its mesh file changing on disk (redraws, asks to reload, or keeps its copy). *In place of the game's setup* needs the Material Texture Override mod in the game; *At a game path you choose* changes no mesh, so the 3D view would not change |
| 5 | In Find, right-click a look's material › **New Material Here...**, make a material (or From an image file), **Add to Project** | Saved and put on the mesh; the 3D view draws again with the new material's color |
| 6 | In Find, right-click the mesh › **View in 3D** | REDcode's 3D view opens the project's copy, not the game's |
| 4b | With the 3D view and the setup editor both open: change a color without saving, then Ctrl+Z, then Ctrl+Y | The 3D view follows each within about a second: the new color, back, and again. Close the editor tab, **Don't Save**: the 3D view goes back to the saved setup |
| 7 | When REDcode has the button: in the 3D view of a mesh, pick a look, press **Open in EDGEmat** | As step 1, with the look on screen open, and its layered material's setup tab in front. 2026-11-13: the mesh went on the Desk, but no tab came forward, so it looked as if nothing happened (the owner); changed and passed the same day |

### Open Material in EDGEmat

Added 2026-10-21, when REDcode marked `.mlsetup` files in its Project view for EDGEmat (REDcode `docs/api.md`, "Menus in the Project view"). In the development host (F5), with a WolvenKit project open that holds a `.mlsetup` under `source\archive`:

| Step | Do | Expect |
|---|---|---|
| 1 | VS Code's Explorer (`Ctrl+Shift+E`): click the `.mlsetup` once | It opens straight in EDGEmat's setup editor, since EDGEmat is VS Code's default editor for `.mlsetup` files: layers in plain words, the Save to Project button in the tab's title bar |
| 2 | Right-click the same `.mlsetup` in the Explorer | **Open Material in EDGEmat...**, the menu's first item. Choose it: the setup editor's tab comes forward. The entry is for bringing a file back into EDGEmat after another editor opened it (step 3) |
| 3 | Open the same file in REDcode's editor: in the Explorer, right-click the `.mlsetup` › **Open With...** › in the list at the top of the window, **REDcode CR2W Editor**. A second tab opens with the file's raw fields. Right-click that tab's name in the tab bar | **Open Material in EDGEmat...** in the tab's menu. Choose it: EDGEmat's setup editor tab comes forward |
| 4 | With REDcode 0.10.3 or later: REDcode's Project view, right-click the `.mlsetup` | **Open Material in EDGEmat...**; it opens the setup editor |
| 5 | Right-click a `.mltemplate` under `source\archive` (in the Explorer) › **Open Material in EDGEmat...** | Its surface page, when the surface is in the library; else "not in the library" |
| 6 | Right-click a `.mesh`, then an `.xbm` (in the Explorer or REDcode's Project view) | The `.mesh`: **Open in EDGEmat** (it goes on the Desk), and no **Open Material in EDGEmat...**. The `.xbm`: no EDGEmat entry at all. 2026-11-13: reworded; the step predated Open in EDGEmat for meshes (2026-10-24) |

### Wardrobe Designer W0

Added 2026-10-30: the first build of Wardrobe Designer, a REDnode app in `apps/wardrobe-designer` (design, "Wardrobe Designer"). It reads and plans, and changes nothing. It checks W0's open rows: its window over the inventory screen, EDGEmat's core on REDnode's REDbridge, and REDagent's plan. Needs REDnode 0.45.0 or later, REDbridge, and REDagent with its key. Build it first: `npm run wardrobe:build` in the EDGEmat folder (Claude does this).

| Step | Do | Expect |
|---|---|---|
| 1 | In the game, **F10** › the **REDNODE** tab at the lower left › the gear at the right of the Theme row. With **Developer mode** on, under **Development folders**, paste `E:\Modding\Cyberpunk 2077\EDGEmat\apps` and press **Enter** | **Wardrobe Designer** starts. The Mod Manager asks for its two permissions, REDbridge (`bridge`) and REDagent (`agent`): allow both |
| 2 | Look at its window, at the left of the screen | The status line says to pick a piece of clothing. The slot buttons name what V wears, such as **Legs: V's Pants**; empty slots say "none" and can't be pressed. The log says "V (feminine body) wears N item(s)" and lists them |
| 3 | Open the inventory (**I**), with V in view. Press **F10** until the window takes input, and press the **Legs** button | The window shows over the inventory screen and takes the click. Within about 10 s the log lists the pants' mesh and its layers (black leather first), and **Plan** turns on |
| 4 | Click **How should it look?**, type `red leather`, press **Plan** | "Asking REDagent for a plan...", then the recipe in the log: the setup, the layers to change with their new colors, and notes, with the time and cost. The status says the plan is ready and not applied |
| 5 | Plan again with `yellow denim`, then `yellow with black polka dots` | Denim: a new surface on the leather layers, in yellow. Polka dots: the notes say patterns are not supported yet |
| 6 | Tell Claude it's done | Claude reads the app's log through REDnode and records the times and recipes |

**Last result, 2026-10-30: passed** (the owner, every step; the log read from `red4ext\logs\rednode-mods.log`, since the game was closed by then).

| Step | Result |
|---|---|
| 1 | Started before the permissions were allowed: "Allow Wardrobe Designer to use REDbridge in the Mod Manager first". Once allowed, REDnode restarted it and it read. The log said "REDbridge  from REDnode" with a blank where a version goes (REDnode's `kernel.bridge()` gives none); fixed in the next build |
| 2 | 6 items, read in 4.6 s with the item index (2,074 clothing items): the PTFE helmet, the Blouie Blue infovisor, the chest holster, the netrunning suit, V's Pants, V's Sneakers. Feminine body |
| 3 | V's Pants, look `_q001__start_w`: `l1_066_pwa_pants__rogue.mesh`, look default; its setup's 12 shown layers (black leather standard 60.5% first), in 2.1 s. `pants_stitches` is textured, not layered |
| 4 | `red leather`: 6.2 s, $0.059. Layer 0 `1a5c5f_null` (red, #cf3030, distance 0.017 on that leather) with roughness "glossy to satin" (a real preset of it); layer 1 (the holed leather) "red" in words |
| 5 | `yellow denim`: 4.4 s, $0.021. Layer 0 to `denim_clean_01_30` with `6c74fa_null` (light yellow on denim, #d5d53d); layer 4 (the small denim layer) the same. The holed leather (layer 1, 12.7%) stayed black leather. `yellow with black polka dots`: 3.0 s, $0.011. Layer 0 "yellow" in words; the notes say patterns are not supported yet |

Findings for W1: REDagent reached EDGEmat's tools in the game (both preset names are real and right, and the context had only the black ones). Recipes mix preset names and words, which is what `mat_edit`'s word form (`layerFromWords`) takes, so W1 can apply them as they come. The brief should say that a material word ("denim") means every layer of the old material (the holed leather was left), and the recipe should name the surface whenever it uses a preset name, since preset names belong to one surface.

### Wardrobe Designer W1

Added 2026-10-30: Wardrobe Designer 0.1.0 restyles what V wears (design, "Wardrobe Designer", W1). **Restyle** asks REDagent for a recipe, applies it with `mat_edit`'s checks into the app's work project, packs it as `WardrobeDesigner.archive` and swaps it into the game. **Restore** puts the game's look back. Same setup as W0: the development folder is in place and REDagent has its key. Claude builds it (`npm run wardrobe:build`); a running app restarts with the new build.

| Step | Do | Expect |
|---|---|---|
| 1 | Load a save, **F10**. If Wardrobe Designer did not restart by itself: the **REDNODE** tab › **Mod Manager** › Wardrobe Designer › **Restart** | The Mod Manager asks for its new permission, **archives** (swap archives into the game): allow it. The window shows **Restyle**, **Restore** and **Refresh**; there is no **Plan** button now |
| 2 | Open the inventory (**I**), with V in view. Press **F10** until the window takes input, then press **Legs: V's Pants** | The pants' layers in the log, as in W0 (black leather 60.5% first). **Restyle** turns on; **Restore** stays off |
| 3 | Click **How should it look?**, type `red leather`, press **Restyle** | In the log: the plan, "Saved 2 file(s)", "Packed 2 file(s)", then "Swapped in", and (with the inventory open and no Equipment-EX) "Refreshed it on the inventory's preview (Legs)". The pants turn red on the inventory's preview of V, about 20 s after pressing. The status says "Restyled in N s" with REDagent's notes. The **Legs** button now ends in \*, and **Restore** turns on |
| 4 | Type `make the leather glossier`, press **Restyle** | The log lists the layers as "(restyled)": the second restyle starts from the red one. The pants stay red, with more shine. "Saved 1 file(s)" (the mesh already points at the copy) |
| 5 | Type `yellow denim`, press **Restyle** | Both leather layers become yellow denim: layer 0 and layer 1 (the holed leather, which W0's plan left). The pants turn yellow in the preview |
| 6 | Close the inventory and look down at V's legs (or use Photo mode) | The same yellow denim pants on V in the world |
| 7 | Open the inventory again, press **Legs**, press **Restore** | "Restore V's Pants: removed 2 file(s)", "the archive holds the game's own 1 mesh(es)", then swapped in. The pants are black leather again on the preview; the \* is gone and **Restore** turns off |
| 8 | Restyle them `red leather` again. Quit to the desktop, start the game and load the save | The pants are still red (the archive stays in `archive\pc\mod`). The **Legs** button ends in \*, and **Restore** works as in step 7 |
| 9 | Tell Claude it's done | Claude reads the app's log and records the times, the recipes and what was swapped |

**First run, 2026-10-30: stopped at step 3** (the owner). Steps 1 and 2 passed. Step 3: the plan (3.5 s, $0.050: both leather layers red, `1a5c5f_null`, glossy), the save (2 files, 0.8 s), the pack (0.1 s) and the swap (0.5 s) all worked, but the pants stayed black on the preview until the owner took them off and put them back on; then they were red. The cause, read through REDnode's MCP tools: with the inventory open, V's own base-slot items read `empty_appearance_default`, so REDnode 0.48.1 refreshed nothing on V and, since it refreshes the preview only in those slots, nothing on the preview (`refreshed 0 worn items`, `refreshed 0 items`). Earlier swap tests ran with Equipment-EX's `OutfitSlots.*`, which keep their appearance. Filed as [REDnode #28](https://github.com/Edgemodders/REDnode/issues/28). The next build resets the restyled item on the preview itself when REDnode did not. Rerun from step 4.

**Second run, 2026-10-30: steps 4 to 6 passed** (the owner). With the inventory open, the app refreshed the preview itself ("Refreshed it on the inventory's preview (Legs)") for `darker red leather`, `blue leather` and `yellow denim` (both leather layers, as the brief now asks), 3 s plans at $0.01 to $0.05; then `red denim` after a restart, where REDnode 0.49.1's own refresh did V and the preview. The owner went on to the chest holster (`dark red chrome`, `glossy yellow plastic`: 3 materials, 6 files) and the sneakers (`blue denim`, `blue leather`, `blue cotton`, `blue`), each swapped and refreshed in 0.4 s. REDagent's daily limit for the app ($0.25) ran out at the holster; the owner raised it to $2.00 (REDagent › **Chats** › **Mods**). Found, and fixed in the next build: the app read too early after a load ("The game gave no equipment data for V"; it now tries again for up to 30 s), and three kinds of words skipped a layer change: "medium blue" (now read, with deep, soft, rich, neon and others), a finish a surface has no preset named for ("glossy" on denim or brushed steel: now the closest finish, said in notes) and a material word that fits several surfaces ("denim": now the game's plain one, `denim_clean_01_30`).

**Step 7, 2026-10-30: failed** (the owner). Restore took V's Pants' 2 files out and swapped the archive (6 files, "6 dropped"), with V and the preview refreshed, but the pants kept the restyled look; the sneakers' Restore the same. REDswap 1.0.0 clears the game's cached copies only of the files the new archive holds, so the pants' mesh, left out, stayed cached as the restyled one (`native/redswap/swap.cpp`, step 6; suspected in REDnode's H2a). Filed as [REDnode #29](https://github.com/Edgemodders/REDnode/issues/29). The app's Restore now always puts the game's own meshes, unchanged, into the archive in their place, so REDswap clears them. A game restart shows the game's look too. Rerun: restyle the pants, then step 7.

**Steps 7 and 8, 2026-10-30: passed** (the owner). Restyled and restored again with the fix: the pants and the sneakers went back to the game's look on the preview with no restart. After quitting to the desktop and loading the save, the restyles were still there and Restore worked. **Wardrobe Designer W1 passed.**

### Wardrobe Designer W2 patterns

Added 2026-10-31: W2's first slice (design, "Wardrobe Designer", step 6 (a)). Words that ask for a print or pattern get a `patterns` entry in REDagent's plan; the app gets the player's Gemini key through REDnode's shared keys, Gemini makes the pattern as a seamless texture, and it goes over the whole material REDagent picked, with the garment's own folds. Same setup as W1. Claude builds it (`npm run wardrobe:build`). Gemini's image models may need billing turned on for the key's Google project: an error from Gemini in the log says so.

| Step | Do | Expect |
|---|---|---|
| 1 | With the game closed, take `EDGEmat_Paint.archive` and `EDGEmat_PaintStyle.archive` out of `<game>\archive\pc\mod` (the paint check's pants replace the same mesh) | Only `WardrobeDesigner.archive` of these is left, if you restyled before |
| 2 | Make a Gemini key if you have none: aistudio.google.com › **Get API key** › **Create API key**. Keep it at hand; don't paste it in chat | A key starting `AIza` |
| 3 | Start the game, load a save, **F10**. If Wardrobe Designer did not restart with the new build: the **REDNODE** tab › **Mod Manager** › Wardrobe Designer › **Restart** | The window as in W1 |
| 4 | Open the inventory (**I**). Press **F10** until the window takes input, press **Legs: V's Pants**. If it has a \*, press **Restore** first | The pants' layers in the log |
| 5 | In **How should it look?**, type `yellow with large black polka dots`, press **Restyle** | The log shows the plan with a line `...: the pattern "...", repeat N`. The first time, **REDnode's Key request window** opens over the game, naming Wardrobe Designer and Google Gemini: paste the key and press **Allow** (with a key already saved in REDnode's Keys, only **Allow**). Then "Gemini (...) made ... in N s", "Saved 8 file(s)", "Packed", "Swapped in"; the pants on the inventory's preview turn yellow with black dots on **both** legs, folds and stitching kept. About 20 to 40 s in all |
| 6 | Type `make the dots bigger`, press **Restyle** | A new pattern with a smaller repeat; the log says "the pattern before it was removed". Bigger dots on the preview |
| 7 | Close the inventory, look at V's legs in the world (photo mode: front, back and each side). Screenshots | The dots follow the pants; they break at seams (expected: a tiled texture breaks at UV island borders). Note anything stretched, smeared or upside down |
| 8 | Open the inventory, **Legs**, type `red leather`, press **Restyle** | The log says "the pattern came off ... its layers show again"; the pants are red leather |
| 9 | Press **Restore** | The game's look, as in W1 step 7 |
| 10 | Tell Claude it's done | Claude reads the app's log: Gemini's model and times, the repeats REDagent chose |

**First run, 2026-10-31** (the owner, dev PC; read from the app's log): "It worked great". Step 5: REDagent planned the pattern "bright yellow with large black polka dots", repeat 3, satin (4.4 s, $0.051); REDnode's Key request window took the Gemini key; Gemini (`gemini-3.1-flash-lite-image`, the newest the key lists) made it in 2.9 s; 8 files saved in 22 s (the texture imports), packed (13 files, 8.5 MB), swapped in 0.6 s with V and the preview refreshed. Step 6, `make the dots bigger`: bigger dots (repeat 2), but **the pants turned red**. REDagent had been told the pants wore *a* pattern, not which: it saw the layers under it (red leather, from an earlier W1 restyle the owner had not restored) and guessed "red leather with large black polka dots" (its note: "I guessed the red and black colors"). **Fixed:** the look now carries the pattern as it was made (`wears`: words, repeat and shine, from the record beside it), the log shows it, and the brief says the listed layers are hidden under it and a change starts from its words, changing only what is asked. Checked outside the game: after a pattern, the look reads `wears {"words":"yellow with large black polka dots","repeat":4,"shine":"matte"}`. Then Restore (16 files out, the game's mesh back). Steps 7 (the world look) and 8 (`red leather` taking the pattern off) not run yet. Rerun from step 4.

**Rerun from step 4, 2026-11-01** (the owner, dev PC, the development folder; read from the app's log): **passed**, "It all worked". Step 5: REDagent planned "bright yellow with large black polka dots", repeat 3, satin (3.0 s, $0.050); Gemini made it in 3.1 s; 8 files saved in 14.4 s. Step 6, `make the dots bigger`: the same words, repeat 2, "with the same yellow and black colors" (2.9 s, $0.012): the fix holds. Gemini's first answer had no image (it stopped with `IMAGE_RECITATION`, its check against reciting a known picture) and the app skipped the pattern with that reason; pressing Restyle again made it in 2.7 s, saved in 9.6 s, packed (15 files, 9.1 MB), swapped in 0.4 s. Step 7, two photo-mode shots, front and back: the dots follow the pants, right way up, with the garment's folds; dots cut at seams as expected. **Faded dots** near the tile edges (upper thighs, seat): EDGEmat's `makeSeamless` cross-fades each edge with a copy shifted by half, so where both copies show, dots from each show at part strength. A picture with sharp shapes shows it; a texture like leather hides it. Step 8, `red leather`: "the pattern came off ... its layers show again", six layers red (3.1 s, $0.013). Step 9, Restore: 12 files out, the game's mesh back.

**Outside the game, 2026-10-31** (Claude, no Gemini key on the dev PC, so a stand-in image for Gemini's; the rest as the app runs it): V's Pants, feminine, into a scratch project. The plan's pattern and a layer change on the same material: the layer change skipped ("the pattern replaces its layers"). A swatch of dots at repeat 4: 8 files (the textures, two `.mi`, the mesh), 6.5 s; the mesh's material on metal_base with the pants' own normal map (`l1_001_wa_pants__rogue_n01.xbm`). A tartan over it at repeat 3: the dots' files removed, the folds still the pants' own, 5.4 s. Then plain `red` on layer 0: the pattern came off, the mesh back on `multilayered.mt` with the restyled setup, red leather, the tartan's files removed: 2 files packed. Typecheck of every workspace clean.

### Wardrobe Designer W2 pattern fixes

Added 2026-11-01, from the W2 run's findings. Three changes: a picture that already tiles is used as it is (its edges were always blended, which faded copies of the dots into each other near the edges); "make the dots bigger" keeps the picture and changes only the repeat, with no new image; and Gemini is asked once more when it sends no image (`IMAGE_RECITATION`). The same setup as W2: the development folder, REDagent's key and the Gemini key. Claude builds it (`npm run wardrobe:build`).

| Step | Do | Expect |
|---|---|---|
| 1 | Start the game, load a save, **F10**. If Wardrobe Designer did not restart with the new build: the **REDNODE** tab › **Mod Manager** › Wardrobe Designer › **Restart** | The window as in W1 |
| 2 | Open the inventory (**I**). Press **F10** until the window takes input, press **Legs**. If it has a \*, press **Restore** first | The pants' layers in the log |
| 3 | Type `yellow with large black polka dots`, press **Restyle** | Yellow pants with black dots, as in W2. The log has "Gemini (...) made" and, only when Gemini's picture did not tile, "the picture did not tile across (or down), so its edges were blended that way" |
| 4 | Type `make the dots bigger`, press **Restyle** | Bigger dots in the same arrangement, still yellow, within a few seconds. The log says "the same picture as before, now repeat N; the image service was not asked", with no "Gemini (...) made" line |
| 5 | Type `make it glossy`, press **Restyle** | The same dots, shinier. The log: "the same picture as before, now glossy" |
| 6 | Close the inventory, look at V's legs in photo mode (front and back). Screenshots | Without the "did not tile" line in step 3: no faded dots. With it: faded dots only near the edges in that direction |
| 7 | Press **Restore** in the inventory, and tell Claude | The game's look. Claude reads the log |

**Result, 2026-11-02: passed** (owner, in the game; Claude read the log and the photo-mode shots). V's Pants, feminine. Step 3: REDagent's pattern "bright yellow with large black polka dots", repeat 3, satin; one Gemini picture (gemini-3.1-flash-lite-image, 5.7 s), "did not tile down, so its edges were blended that way". Step 4: repeat 2, "the same picture as before, now repeat 2; the image service was not asked". Step 5: glossy, the same line. Step 7: Restore put the game's mesh back. The shots: glossy yellow, sharp black dots, and a few faded dots in horizontal bands on both legs, where the tile's top and bottom edges meet: the blend down, as expected for this picture.

### Wardrobe Designer patterns with GPT Image

Added 2026-11-02 (owner): patterns and Reshape's pictures use one image service, OpenAI's GPT Image, so a player needs fewer keys; a button switches patterns to Gemini. The app's manifest now lists `keys:openai` beside `keys:gemini`. The development folder, as in W2; Claude builds it (`npm run wardrobe:build`).

| Step | Do | Expect |
|---|---|---|
| 1 | Start the game, load a save, **F10**. **REDNODE** tab › **Mod Manager** › Wardrobe Designer: allow its new permission (your OpenAI key) if it shows one, then **Restart** | The window has a new button under Restyle: **Patterns: GPT Image** |
| 2 | Open the inventory (**I**), **F10** until the window takes input, press **Legs**; if it has a \*, press **Restore** first | |
| 3 | Type `yellow with large black polka dots`, press **Restyle** | If the app is not allowed your OpenAI key yet, REDnode's **Key request** window asks: **Allow** (the key is saved already). Then yellow pants with large, sharp black dots. The log says "GPT Image (gpt-image-2.5-...) made ..." |
| 4 | Press **Patterns: GPT Image** | It reads **Patterns: Gemini**; the log says patterns are now made with Gemini |
| 5 | Close the window and **Restart** the app (Mod Manager) | The button still reads **Patterns: Gemini** (kept in `settings.json` in the app's data folder) |
| 6 | Press it again | **Patterns: GPT Image** |
| 7 | Photo mode, front and back; then **Restore**, and tell Claude | Screenshots; Claude reads the log |

**Result, 2026-11-02: passed** (owner, in the game; Claude read the log and two photo-mode shots). Step 3: REDnode's Key request window asked for the OpenAI key and the owner allowed it; GPT Image (`gpt-image-2.5-sunburst-2026-09-08`) made the pattern in 10 s; it tiled both ways, so nothing was blended, and the shots show sharp, even dots front and back with no faded ones (owner: "much better than Gemini"). Step 4: the button switched to Gemini and back. Step 5: the app was restarted with GPT Image chosen (the default too), so reading a saved Gemini choice after a restart was not seen; `settings.json` in the app's data folder (`%APPDATA%\@rednode\overlay\packages\wardrobe-designer`) holds the last choice. Step 7: Restore put the game's pants back. Saving the 8 files took 30.7 s.

### Wardrobe Designer Reshape and keys

Added 2026-11-02: W3's first version in the app, with the keys (owner: the missing keys asked for first, as the window's first view, not a separate window), and what V wears read from the slots on V's body, Equipment-EX's included (owner: with Equipment-EX the base slots are hidden). Reshape runs EDGEmat's core (`reshape.ts`) in the app; the manifest asks `keys:tripo` too (now `keys:openai`, `keys:tripo`, `keys:gemini`). The pictures show in the window with REDnode 0.55.0 or later (`ui.image`, [REDnode #37](https://github.com/Edgemodders/REDnode/issues/37); the dev PC has 0.55.1): as it is on the left, changed on the right, a click opens one larger. With an older REDnode the Reshape line gives each picture's path instead. The development folder; Claude builds it (`npm run wardrobe:build`). Costs: one GPT Image change (a few tens of US cents) and one Make it (about 60 Tripo credits).

| Step | Do | Expect |
|---|---|---|
| 1 | With the game closed, make sure `EDGEmat_ReshapeCheck.archive` and `EDGEmat_GlowCheck.archive` are not in `<game>\archive\pc\mod` (their hats would win over the app's). Start the game, load a save, **F10** › **REDNODE** tab › **Mod Manager** › Wardrobe Designer: allow its new permission (your Tripo key), then **Restart** | While the app is not allowed a key yet, its window opens on **Wardrobe Designer: your keys** (in the window's usual place at the left): OpenAI and Tripo, each **Ready** or **Needed**, with **Set...** on a needed one and **Continue without them** at the bottom |
| 2 | On each **Needed** line press **Set...**: REDnode's Key request window asks; **Allow** (the keys are saved already) | The line turns **Ready**. When both are, the window changes to the main view by itself, in the same place: **Patterns: GPT Image** and **Keys**, and a **Reshape** part with **Change its shape** and **Reshape**, **Change**, **Back**, **Make it**. (With both allowed already, it opens on the main view) |
| 3 | Wait for "V wears N item(s)" in the log. With Equipment-EX's outfit on: it says "in Equipment-EX's outfit (the base slots it hides left out)", and there is one button for each piece in the outfit only (not the base items it hides: take one off in Equipment-EX's wardrobe, press **Refresh**, and its button goes); with the outfit off, the base slots' items. One button for each piece V visibly wears, three to a row, named by its slot (**Head: ...**, **Torso outer: ...**). Put on the **Cowboy hat with hardened-leather band** through Equipment-EX (REDnode's Console: `addItem("Items.Hat_02_basic_01")` if it is gone), press **Refresh**, open the inventory (**I**), **F10** until the window takes input, press the hat's button. If it has a \*, press **Restore** first | The hat's button appears after Refresh; the log lists the hat's materials |
| 4 | Press **Reshape** | In a few seconds: "Cowboy hat with hardened-leather band, as it is ... Make it puts it on V (about 60 Tripo credits)". Both pictures show the hat from four sides (front and left above, back and right below), on a dark background like the window's |
| 5 | Type `make the brim twice as wide` in **Change its shape**, press **Change** | About half a minute; the line says "changed: "make the brim twice as wide"" and the right picture shows the wider brim, one brim only. Click it: a larger window opens with it; **Close** |
| 6 | Press **Make it** | It turns red: "Sure? About 60 Tripo credits", and the status line says to press again. Wait 10 s without pressing: it goes back to **Make it** |
| 7 | Press **Make it** twice | The status counts Tripo's progress ("making the model: 40%...", then "bringing it to the game's size"), then "Fitting it on V", "Packing and swapping it in", "Made and put on V in ...". About 4 to 5 minutes. V and the inventory's preview wear the wide-brimmed hat; **Head** has a \* |
| 8 | Close the inventory, photo mode: front, side, back. Screenshots | The hat as in the Reshape check: one wide brim, on the head, the badge in front |
| 9 | Inventory, **Head**, **Restore** | The game's hat again |
| 10 | Press the pants' button (**Legs ...: ...**), then **Reshape** | The pants drawn; the line says it can be changed in pictures but not made yet ("it moves with 31 bones..."); **Make it** stays off |
| 11 | Press **Keys** | The window changes to **your keys**, both **Ready**, and **Continue** goes back to the main view, in the same place |
| 12 | Close the window with its close button, then load a save (the app reads V again after a load) | It stays closed. Open it again from REDnode's launcher (**Wardrobe Designer**): it shows the main view. Then tell Claude, who reads the log |

### Wardrobe Designer install

Added 2026-10-30: the release zip in the game, as a player gets it (Vortex or extracted), not the development folder. Run it on each Wardrobe Designer release's zip before it goes to Nexus: the run's artifact **Wardrobe-Designer-build** from **Release Wardrobe Designer** without the ticks, or `npm run wardrobe:zip` (`dist/Wardrobe-Designer-<version>-draft.zip`).

| Step | Do | Expect |
|---|---|---|
| 1 | In the game: **F10** › the **REDNODE** tab › the gear › **Developer mode** › **Development folders**: remove `E:\Modding\Cyberpunk 2077\EDGEmat\apps`, so only the installed copy runs. Then close the game | |
| 2 | Install the zip with EDGEdeck (**Deploy**; the mod `wardrobe-designer`), Vortex, or extract it into the game folder | `red4ext\plugins\REDnode\apps\wardrobe-designer\` has `rednode-app.json`, `dist\mod.mjs`, `LICENSE.txt` and `THIRD-PARTY-NOTICES.txt` |
| 3 | Start the game, load a save, **F10** › **Mod Manager** › **Wardrobe Designer** | It is off, with its version, and needs REDnode 0.56.1 or later and its six permissions (REDbridge, REDagent, archives, the OpenAI, Tripo and Gemini keys) to allow. Allow them and switch it on |
| 4 | Open the inventory, press a slot, restyle it, then **Restore** | As in Wardrobe Designer W1, steps 2, 3 and 7 |
| 5 | Tell Claude | Claude reads the log and records the version and the result |

### Keys in VS Code

Added 2026-11-11 ([EDGEmat #10](https://github.com/Edgemodders/EDGEmat/issues/10)): the image service keys are in VS Code's secret storage again, as in 0.3.1, and the EDGE tools' shared key store is out of the extension and the MCP server. It replaces the test **Shared keys** (added 2026-10-30, never run). In the development host (F5), then a normal terminal with Claude Code.

| Step | Do | Expect |
|---|---|---|
| 1 | In the development host: Game Materials title bar › **New Material** (the sparkle). Type `red brick`, press **Generate** | With a key set in a build since 2026-10-30 (it went to the shared store), it asks once: a password box that says the key is kept in VS Code's secret storage, for EDGEmat only. With a key from 0.3.1, or `GEMINI_API_KEY` or `OPENAI_API_KEY` set in your environment, no question. Then a take |
| 2 | Command palette (`Ctrl+Shift+P`) › **EDGEmat: Set Image Service Key...** › **OpenAI** › type `abc` | Under the box: "OpenAI keys start with sk-". Press Escape: nothing saved |
| 3 | Command palette › **EDGEmat: Clear Image Service Key...** › the service from step 1 › **Clear It** | A warning first: "Generate asks for it again". Then **Generate** asks for the key again. Give it again for the next steps |
| 4 | Game Materials › **...** › **Connect an Assistant (MCP)...** › **Connect Claude Code** | A question: "Give the assistant your image service key too?" Choose **Yes**: "EDGEmat is connected to Claude Code" |
| 5 | A new Claude Code session: "Using EDGEmat, make just the image of a red brick material, don't apply it" | `mat_generate` with `imageOnly` returns an image file |
| 6 | Game Materials › **...** › **Connect an Assistant (MCP)...** › **Copy the Claude Code command**, paste it in Notepad | A message: "Copied. Put your key in place of <key>, or leave out that -e...". The line has `-e OPENAI_API_KEY=<key>` (or `GEMINI_API_KEY`, one for each key you set) before `--`, never your key. Close Notepad without saving. 2026-11-13: the line had no `-e` at all (the owner); fixed the same day, rerun |
| 7 | VS Code 1.101 or later: the editor's own agent chat, the same words as step 5 | EDGEmat's tools are listed, and `mat_generate` makes the image with the key from VS Code's secret storage |

### Connect an assistant

Added for 0.3.1, when the MCP server came into the extension. In a normal VS Code with EDGEmat installed from the Marketplace:

| Step | Do | Expect |
|---|---|---|
| 1 | Check `%LOCALAPPDATA%\EDGEmat\mcp\` | `edgemat-mcp.cjs` is there, made when EDGEmat started |
| 2 | Game Materials › **...** (top right of the view) › **Connect an Assistant (MCP)...** | Four choices; the hint at the top says whether agents inside this editor already see EDGEmat |
| 3 | **Connect Claude Code**; with a key set, answer the key question | "EDGEmat is connected to Claude Code" |
| 4 | In a terminal: `claude mcp list` | `edgemat` points at the file from step 1, connected |
| 5 | A new Claude Code session: "Which EDGEmat tools do you have?", then "Describe the Comfy rocker slim-fits' materials" | The 10 `mat_` tools; `mat_find` and `mat_describe` answer |
| 6 | VS Code 1.101 or later: open the editor's own agent chat and its tools list | EDGEmat and its tools are listed |

### Install of the release

Asked for by the owner on 2026-10-16 as the CLI install of the VSIX. **Last run 2026-10-19 by the owner on a test build's VSIX: pass.** F5 runs the source; this tests what a user installs. From 0.3.0 a release is on the VS Code Marketplace and Open VSX, so the test installs from there, in a normal VS Code with no development host open ([Dev setup, "Releasing"](dev-setup.html#releasing)):

1. Extensions view (`Ctrl+Shift+X`), search `EDGEmat`, pick EDGEmat by Edgemodders with the Preview badge, **Install**. Or `code --install-extension edgemodders.edgemat`.
2. Check the version on its page is the release's.
3. Click the EDGEmat icon in the activity bar: the [Game Materials view](#game-materials-view-in-vs-code) checks, then Find and New Material open.

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
| "Make me a brown leather material" (no key set) | `mat_generate` | Refused in words: set `GEMINI_API_KEY` or `OPENAI_API_KEY` in the server's environment (Connect an Assistant can include the key). Run 2026-10-20 over stdio; again 2026-11-11 with no key in the environment, no network call |
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
| The test archive deployed through EDGEdeck (called REDdeck until 2026-10-17), and listed in `archive\pc\mod\modlist.txt` | The game reads `modlist.txt`; earlier archives win |
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
