# <span class="y">Tests</span>

Every test run on EDGEmat so far: how to run it again, what to expect, and what it showed. Each phase ends with a test on the dev PC ([design, "Phases"](design.html#phases)); new tests are added here when they are first run.

Last updated 2026-10-17.

## At a glance

| Test | Kind | Phase | Last run | Result |
|---|---|---|---|---|
| [Type check and build](#type-check-and-build) | Automated | M1 | 2026-10-16 | Pass |
| [Smoke test](#smoke-test-the-library-against-the-game) | Automated, needs the game | M1, M2 | 2026-10-17 | Pass |
| [MCP server](#mcp-server) | By hand, over stdio | M1, M2 | 2026-10-17 | Pass |
| [Library view](#library-view-in-vs-code) | By hand, F5 | M1 | 2026-10-16 | Pass |
| [Surface page](#surface-page) | By hand, F5 | M2 | Not run | Rendered outside VS Code with real data on 2026-10-17 |
| [CLI install of the VSIX](#cli-install-of-the-vsix) | By hand | M6 at the latest | Not run | |
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
| Page images (M2) | 3 of 3 for `leather_bull_01_30`: the first in about 1.6 s while the bridge warms up, the rest in well under half a second, then instant from the cache |

The counts change after a game patch. A patch that adds surfaces is fine as long as "read" matches "listing".

## By hand in VS Code

### Library view in VS Code

Run 2026-10-16 by the owner: **all pass.**

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

Built 2026-10-17; **not yet run in VS Code.** Before the hand test it was rendered in headless Chrome with real library data and a stand-in for VS Code, to catch layout and script errors.

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

### CLI install of the VSIX

Not run yet. Asked for by the owner on 2026-10-16; part of M6's test at the latest. F5 runs the source; this tests what a user installs.

```powershell
npm run edgemat:package
code --install-extension dist\edgemat-<version>.vsix
```

Then **Developer: Reload Window** (this restarts a Claude panel in the same window) and repeat the [Library view](#library-view-in-vs-code) checks. Uninstall with `code --uninstall-extension edgemodders.edgemat`.

### MCP server

Run 2026-10-16 (M1 tools) and 2026-10-17 (`mat_colors`): **pass.** Register the server ([dev setup](dev-setup.html), section 4), start a new Claude Code session, and ask:

| Ask | Tool | Expected |
|---|---|---|
| "Is the EDGEmat library built?" | `mat_library` status | The counts above and the build date |
| "Which leather surfaces are there?" | `mat_templates` `leather` | 7 surfaces |
| "Find logo microblends" | `mat_microblends` `logos` | 6 microblends |
| "What's the closest dark red on leather bull?" | `mat_colors` `leather_bull_01_30`, near `dark red` | The surface's dark reds, closest first, each with its preset name, a plain name, RGB and distance; roughness, metal and bumps in words. Run 2026-10-17 over stdio: `c2162c_69039f` first, distance 0.032 |
| "Colors of leather" | `mat_colors` `leather` | Several surfaces fit: the 7 candidates, asking for one path |

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
