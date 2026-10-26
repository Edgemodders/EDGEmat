# Progress <span class="y">log</span>

What has been done on EDGEmat, what was decided and why, and what is open. Newest first within each section. Read this to catch up without asking. The [design](design.html) and the [behavior spec](design/behavior.html) hold the full detail.

Last updated 2026-10-26.

## At a glance

| | |
|---|---|
| Phase | **M3 Edit done 2026-10-20**, with Generate's first slice, and **0.3.0 released** the same day: the first preview, on the VS Code Marketplace, Open VSX and GitHub. Next: M4 Make |
| Extension | 0.3.1: the EDGEmat icon in the activity bar; the Library of every surface and microblend in your game; a page for each surface with its colors as named swatches; the setup editor, editing and Save to Project; Find; View in 3D; New Material |
| MCP server | `mat_library`, `mat_templates`, `mat_microblends`, `mat_colors`, `mat_describe`, `mat_find`, `mat_edit`, `mat_generate`, `mat_from_image`, `mat_apply`, `mat_desk` |
| Spec | Behavior spec draft 0.2, checked against the game and in-game tests, agreed 2026-10-16 |
| Next up | Your hand tests of Which item: In the game (new), the Desk (steps 3b, 4, 12, 15, 18 to 20, the rest of 21, 22 to 24), Open Mesh in EDGEmat (from step 3) and Open Material in EDGEmat (F5), your install of 0.3.1 from the Marketplace and the Connect an Assistant test. Then M4 Make: materials for new meshes, for EDGEfab |
| Roadmap | M3 Edit with Generate's first slice, released as the 0.3.0 preview; **M4 Make** (materials for new meshes: from a model's textures, **Generate** from words or a photo, game materials on new meshes, the Looks editor), M5 Preview, M6 Beyond mlsetup, M7 Ship. Revised 2026-10-19 so EDGEfab gets materials sooner |

## Your to-dos

| To-do | Why | Since |
|---|---|---|
| Update to 0.3.1 from the Marketplace in a normal VS Code (not the development host), check the Library, Find and New Material open, then run Connect an Assistant | The release's install test and the new one ([Tests](testing.html#install-of-the-release), [Connect an assistant](testing.html#connect-an-assistant)) | 2026-10-21 |
| Decide whether the 0.3 preview goes on Nexus, after reviewing the roadmap to M7 | The page is ready in `nexus/` (description, form fields, the download zip from each release); the design planned Nexus for M7 | 2026-10-19 |
| Screenshots: the Nexus page has the owner's nine. Screenshots 1 to 5 and 8 show a Windows user name in VS Code's Output panel (`C:\Users\...`); replace them on Nexus if that matters. Still open: the placeholders in the EDGEmat wiki ([edgemodders.ai/wiki/edgemat](https://edgemodders.ai/wiki/edgemat/)). The tutorials' in-game shots are in (2026-10-20); their UI shots still wait | The pages say what each should show; drop wiki shots in EDGEweb's `docs/assets/shots/inbox/` | 2026-10-19, tutorials 2026-10-20 |
| Report back when the other sessions finish the requests below | EDGEmat's design and EDGEfab's brief get updated to the shapes that shipped; then the EDGEfab session starts | 2026-10-16 |
| Record Neurolinked's reply, if one comes | Design, "Prior art" | 2026-10-16 |
| Try RED Hot Tools on the dev PC | Answered on the laptop: RED Hot Tools is installed there and Pack and Try went hot on 2026-10-20 (log). On the dev PC, use the [Edgemodders build](https://github.com/CyberbuildsAI/cp2077-red-hot-tools/releases) (`v1.3.0+edgemodders.1`): the official 1.3.0 can end the game when it replaces an archive in a mod folder with names in capitals, such as `EDGEmat_M3.archive` (design, "Hot-loading archives") | 2026-10-16 |

## Waiting on other repos

| Request | What | Status |
|---|---|---|
| [REDbridge #4](https://github.com/Edgemodders/REDbridge/issues/4) | `tweakdb.records`: from an item ID to its appearance | **Shipped** in REDbridge 0.8.0, 2026-10-15. Used in M0 to find the sneakers' items |
| [REDcode #6](https://github.com/Edgemodders/REDcode/issues/6) | REDcode's mesh viewer asks EDGEmat for rendered materials; appearance switching; a GLB's own textures | **Shipped** in REDcode 0.10.0, 2026-10-16. Appearance switching and GLB textures hand-tested. EDGEmat provides `renderMaterials` since 2026-10-19 (colors only, for View in 3D); the full bake is M5 |
| [REDcode #7](https://github.com/Edgemodders/REDcode/issues/7) | "Pack and try" (hot load) and "Edit in Blender" | **Shipped** in REDcode 0.10.0, 2026-10-16, hand-tested. Without Red Hot Tools, Pack and Try falls back to Pack and Install; the hot path is untested |
| [REDbridge #5](https://github.com/Edgemodders/REDbridge/issues/5) | Mesh import for a new asset, from a GLB | **Shipped** in REDbridge 0.9.0, 2026-10-16. A GLB is imported over a template mesh (WolvenKit cannot make one from a GLB alone). The result names the GLB's materials per submesh but does not apply them: assigning materials is EDGEmat's Looks editor (M4). Not yet loaded in the game |
| [REDcode #13](https://github.com/Edgemodders/REDcode/issues/13) | The mesh viewer's **Open in EDGEmat** button: runs `edgemat.openMesh` with `{ mesh, appearance }`; optionally a `.mesh` kind in the Project view | Open, filed 2026-10-23. EDGEmat's side is built (`50b38bc`) |
| [REDcode #15](https://github.com/Edgemodders/REDcode/issues/15) | Kinds on Game Assets files (`assetFile.mesh`, `.mlsetup`, `.mltemplate`), and a `.mesh` kind in the Project view, so **Open in EDGEmat** shows only where it applies | Open, filed 2026-10-25. Until then the entry shows on every non-texture game file and says what it takes. #13 was told the mesh now goes on the Desk (same arguments) |
| [REDcode #16](https://github.com/Edgemodders/REDcode/issues/16) | The mesh viewer repeats textures past the 0 to 1 UV square, as the game does (one line: `RepeatWrapping` in `texture()`) | Open, filed 2026-10-26. Until then EDGEmat's colors show a seam and a border-colored patch where a garment's UVs run past the square (the slim-fits' left leg) |
| [REDbridge #8](https://github.com/Edgemodders/REDbridge/issues/8) | `project.import` takes a texture setup (color, normal, grayscale) for a new `.xbm` | **Built** on REDbridge's main, closed 2026-10-23; not in a release yet (0.10.0 is the latest). Not blocking: EDGEmat copies a game texture of the right kind to the target first |
| [EDGEbuilder #1](https://github.com/Edgemodders/EDGEbuilder/issues/1) | Index the user's mod archives, so custom objects can be placed | Open. Planned as EDGEbuilder's phase B2c, its plan to be agreed |
| [REDnode #12](https://github.com/Edgemodders/REDnode/issues/12) | Hot-load archives into the running game | Open, mostly shipped: REDnode 0.26.0 and later swap archives into the running game through RED Hot Tools (`archives.reload`, MCP `archives_reload`), and since 0.26.20 the clothing V wears shows the new version at once (unverified for a material change). A world object may keep the old look until the game loads it again |

## Log

### 2026-10-26

| What | Detail |
|---|---|
| **Microblends in the color map; the Desk opens a worn look** | The owner's ask after the in-game check below. (1) A layer's microblend now cuts its mask in the color map: it shows where its mask plus the microblend's alpha is over 1 (behavior spec, section 5, measured on the slim-fits' leather). Core `microblend.ts` exports each microblend's alpha once through REDbridge and caches it (`microblends\`, a flat one as one pixel); `compositeSetup` samples it tiled by `mbTile`, several samples a pixel when it is finer than the map. The leather's map: base 87%, the denim with lint 0.5% (was 24%), piping 6.7%; about 140 ms a redraw after an edit. The setup editor loads a newly picked microblend and redraws; `mat_describe` and `mat_edit` get the same map. Not used yet: `microblendContrast`, `ratio`. (2) The Desk opens a mesh on the first look an item wears and marks each look "worn by N items" or "no item" (Find's Meshes too); the first time the looks show at once and again with marks once the index is built. Smoke (a new microblend check) passes. Hand test: "Microblends and worn looks" |
| **The 3D view against the game** | The owner's in-game check of a leather recolor on the slim-fits (`EDGEmat_Desk` project): the game shows even salmon leather; View in 3D shows dark maroon with a bright red lower left leg and a seam. Three causes. (1) The seam and patch: 1,517 of the mesh's 4,612 vertices have u outside 0 to 1 (-0.475 to 1.526); the game repeats the texture, REDcode's viewer clamps it: [REDcode #16](https://github.com/Edgemodders/REDcode/issues/16). (2) The darker color: the color map lays each layer by mask × opacity only; the denim layer 5 (dark grey, full opacity, 24% of the texture, microblend `lint_01` at contrast 0) darkens the whole garment in the map but hardly shows in the game, so the microblend cut (behavior spec, section 5) matters for the color too. (3) No grain or shine: the map is colors only. (2) and (3) are the M5 bake. Also found: the Desk opens a mesh on its first look, and the slim-fits' first look (**default**) is worn by no item, so the owner's first edit went on an NPC-only look |
| **Add to Desk in Find** | The owner's ask: Game Assets searches file paths, so "comfy rocker" is found only in Find, which had no way onto the Desk. **Add to Desk** on a mesh's right-click in Find puts it on the Desk with the look it was found in, as Open in EDGEmat does. Hand test: the Desk, step 3b |
| **Which item: In the game** | The owner's ask: after editing a mesh's material, the setup editor showed only mesh and material paths, so it was hard to know which item to give V with CET's `Game.AddToInventory`. Built: an index of every clothing item's meshes and mesh appearances (core `itemsWearing` in `find.ts`: 1,997 items through 193 `.app` files, about ten seconds once per game version, cached as `worn.json`); the setup editor's **In the game** section lists the items that wear the mesh look it was opened under, each with its command and Copy; a look's tooltip on the Desk and in Find lists them; **Copy CET Command** on a look, material or item. MCP `mat_find` with a mesh gives each appearance's `worn_by` with `cet`, and an item's `cet`. Smoke (the slim-fits' leather look is `Items.Pants_01_basic_01`) and an stdio probe pass. Hand test: "Which item: In the game" |
| **The Desk: hand test, first part** | The owner ran the reworked Desk test's steps for the day's changes (1 to 3, 5 to 11, 13, 14, 16, 17, the first part of 21): all pass. Still open before a release: the Desk's steps 4, 12, 15, 18 to 20, the rest of 21 and 22 to 24; Open Mesh in EDGEmat (from step 3), Open Material in EDGEmat, Connect an Assistant, and the install from the Marketplace |
| **The Desk: entries and variations** | The owner's second run: a second pair of slim-fits opened from Game Assets showed the first pair's edit, and a project file kept reading "the project's copy" after the project was closed. Cause: the Desk kept one edit per setup for every entry. The owner asked for duplicates as variations, a **+** per entry, and chose (2026-10-26): Open in EDGEmat reuses a copy with no edits, else starts **variation 2**, 3...; the title bar's **+** asks which variation of a twice-held file goes in, or to skip it. Built: each entry has an id and its own project-shaped folder (`desk\items\<id>\source\archive`) for its edits and its mesh copy, so the render reads it like a project (then the project a project entry came from); setup editor URIs carry the entry id; **Rename...**; a project entry reads "from <project>" ("not found" when its folder is gone); `toProject` takes `ids`, refuses two variations of one file, and gives two meshes that edited one setup differently setups of their own (`_<project>_2`). A Desk from 2026-10-25 is moved over on first start, every edit copied into each entry. MCP `mat_desk` lists ids, renames, removes by id, takes `ids` and reports variations; `mat_edit` takes `desk_id`. Type check, build, smoke (six Desk checks) and an stdio probe pass |
| **The Desk: two fixes from the owner's test** | (1) **+** said "0 files written" in a project that already had its own slim-fits pointed at other materials: the edit was "left on the Desk" with only a log line, the mesh skipped as already there, and **Add and Clear the Desk** would have deleted the edit. Now `Desk.conflicts` finds such meshes first and the modder picks **Replace with the Desk's** or **Keep the Project's**; the result says what stayed on the Desk (`kept`), the toast says "nothing new to write" or how many edits stayed, and Add and Clear takes off only what went in (`clear(kept)`). MCP `mat_desk` `to_project` writes nothing and lists the conflicts until `replace` is given, and takes `clear`. (2) After the add, the game's mesh in Game Assets showed the Desk's edit in 3D: the render read the Desk's copy of a setup for any mesh. Now **View in 3D** on the Desk opens the Desk's own copy of the mesh (`Desk.meshFile`, extracted into `desk\source\archive`), only that copy (or a project file on the Desk) reads the Desk's edits, and the live preview matches an editor to meshes from the same place (Desk, project, game). Type check, build and the smoke test pass (two new Desk checks: the game's mesh keeps its colors; keep, clear and replace on a conflicting project). Not yet seen by hand: REDcode's 3D view opening the Desk's mesh copy |

### 2026-10-25

| What | Detail |
|---|---|
| **The Desk** | Asked for by the owner: **Open in EDGEmat** on a `.mesh` in REDcode's Game Assets and Project views puts it on a new **Desk** view above the Library, revealed and open, and the Desk keeps meshes and edited setups across restarts until **+** puts them in a project (with a confirm). Core `desk.ts` (no VS Code): `desk.json` and a project-shaped `desk\source\archive` in EDGEmat's folder, so the edited setups are read like a project's copies; the 3D render reads them after a project's own. A setup opened from the Desk saves there with Ctrl+S; `toProject` saves each edited setup as a new setup with the Desk's meshes that use it pointed at it, and copies the other meshes. The Desk view is the Find view's tree with Desk entries at the top (`deskView.ts`); `edgemat.openMesh` (REDcode #13's command) now lands there instead of Find. MCP `mat_desk`, and `mat_edit` with `save: "desk"`. REDcode's Game Assets gives no file kinds but textures, so the entry shows on every other game file for now: [REDcode #15](https://github.com/Edgemodders/REDcode/issues/15). Also fixed: a material of a project's mesh opened the game's setup even when the project held its own copy. Type check, build, smoke (three new Desk checks) and an stdio probe of `mat_desk` pass; the hand test is next |
| **Nexus through the API** | From the REDnode session, at the owner's ask: the Nexus page (35422, live at 0.3.0) is kept as REDnode's is. `tools/nexus/` copied from REDnode, `nexus/nexus.json` (Mod Manager Download off: an extension), `npm run nexus:pull` and `nexus:status`, and the release workflow's **Update Nexus Mods** box (check before building, upload, changelog and description after the GitHub release; `NEXUS_KEY` is visible to this repo). `nexus/description.bbcode` is now the live page's text: the owner's Nexus text is still 0.2's, with seven screenshots uploaded there, while the repo had 0.3's with placeholders. Merge the newer text into it, keeping the screenshots, before the next release with Nexus ticked. 0.3.1 never reached Nexus |
| Nexus description merged | `nexus/description.bbcode` brought up to the next release: 0.3's text plus the Unreleased changes (the Desk, Open in EDGEmat, Open Material in EDGEmat, the live 3D preview, Connect an Assistant and the MCP server inside the extension), with the owner's nine Nexus screenshots kept where they sit on the live page and the eight placeholders dropped. The STATUS box says version 0.4 (the version is still the owner's call) and game 2.5, which this PC runs since 2026-10-23 and the smoke test read; the in-game checks were on 2.31, and the box says so. The live caption's project path held a Windows user name; the text no longer does, but screenshots 1 to 5 and 8 show it in VS Code's Output panel. `check-bbcode` passes. Not pushed to Nexus: that happens with the release |
| **Release held** | The REDnode session asked for a release with Nexus. The gate in `docs/testing.md` is not met: the Desk, Open Mesh in EDGEmat, Open Material in EDGEmat and Connect an Assistant are not run by hand yet. No version picked, no run started |
| Stray control characters | Three spots in `docs/testing.md` and two comments in `findView.ts` held a BEL character where `source\archive` was meant (a `\a` turned into BEL by a shell edit on 2026-10-23/24). Fixed |

### 2026-10-24

| What | Detail |
|---|---|
| **Live preview in the 3D view** | In the retest the owner saved green, undid to blue in the editor, and the 3D view stayed green: right (it showed the saved file), but confusing. Now `renderMaterials` takes a setup open in the setup editor as it is now (`SetupEditor.liveColorMap`, by the setup's game path or where Save to Project last wrote it), and edits, undo, redo and closing fire `onDidChangeMaterials` (debounced 300 ms). The shape REDcode's API notes already expected ("while a setup is being edited"). Type check and build pass; test step 4b |
| **Two bugs from the Open Mesh hand test** | The owner's test (EDGEquest_Q2, the slim-fits' project copy, its default material): (1) switching tabs and back showed the setup as opened, losing the edit from view while the tab stayed unsaved. VS Code throws a hidden webview away and rebuilds it from its first html; the editor now sends the current setup when the tab shows again. (2) **As a new setup** pointed 10 citizen_casual game meshes at the new setup, copied into the project, and not the project's own mesh: the slim-fits in `player_equipment` use the citizen jeans' setup, and the search only looked in the setup's folder. `meshesUsing` now reads every mesh in the project first and marks it; `meshesToPoint` ticks only the project's meshes when any use the setup (the setup editor and `mat_edit`). Checked read-only on EDGEmat_Tiling: both project bodies ticked, the 11 game meshes listed and not ticked |

### 2026-10-23

| What | Detail |
|---|---|
| **Open Mesh in EDGEmat** | The owner found no way from a mesh in REDcode's 3D view to its materials in EDGEmat. Built EDGEmat's half: the command `edgemat.openMesh` (`{ mesh, appearance }`, also on a `.mesh`'s right-click) shows the mesh in Find with the look on screen open, reading a project's copies; `onDidChangeMaterials` now fires after a setup save and after New Material puts a material on a mesh (it never fired before), so REDcode's 3D view draws again; View in 3D opens a project's copy as the file. REDcode's button is requested ([REDcode #13](https://github.com/Edgemodders/REDcode/issues/13)). Adding a look is M4's Looks editor; the same command will open it. Type check and build pass; the hand test is next |

### 2026-10-22

| What | Detail |
|---|---|
| **Release workflow as REDnode's** | `.github/workflows/release.yml` replaces `publish.yml`. **Run workflow** alone builds the VSIX, the MCP file, the Nexus zip and the notices as the run's artifact; with **Make a release** ticked it checks the version is new and the run is on `main`, publishes to the Marketplace, Open VSX, GitHub (tagging `v<version>`) and npm. `tools/version.mjs` sets the version in both packages and the lock file, and `--check` stops a run where they differ. Steps in [dev setup](dev-setup.html), "Releasing" |

### 2026-10-21

| What | Detail |
|---|---|
| **Open Material in EDGEmat...** | A right-click entry on `.mlsetup`, `.mlsetup.json` and `.mltemplate` files: in the Explorer, on an editor tab, and in REDcode's Project view, where REDcode 0.10.3 marks `.mlsetup` files for EDGEmat (`viewItem` `projectFile.mlsetup`; REDcode's `docs/api.md`). A setup opens in the setup editor, a surface on its page. Asked for by the owner ahead of REDcode's request: clicking a `.mlsetup` in REDcode's Project view opens REDcode's own editor ("Multilayer_Setup"), not EDGEmat's. REDcode 0.10.3 is not released yet (0.10.2 is the latest), so the Project view entry shows only then. Type check and build pass; the hand test is next |
| **EDGEchat uses `@edgemodders/edgemat-mcp`** | EDGEchat gives the npm package to Claude Code, with `EDGEMAT_GAME_PATH`, `REDBRIDGE_EXE`, `GEMINI_API_KEY` and `OPENAI_API_KEY` from its own settings form, as it does for edgedeck-mcp and redcode-mcp. 0.3.1 is on npm (`latest`), and the variables already win over VS Code's settings (an empty one counts as unset). The package README said the reverse: fixed 2026-10-21, on npm with the next release |
| **0.3.1: the MCP server comes with the extension** | Another session saw that 0.3.0's server was only a file on the GitHub release, so a Marketplace install had no assistant tools. Now the VSIX carries it and copies it to `%LOCALAPPDATA%\EDGEmat\mcp\edgemat-mcp.cjs` (one path for every version); **Connect an Assistant (MCP)...** registers it with Claude Code; VS Code 1.101+ sees it with no setup (guarded, so editors without that API, such as EDGEkit without Copilot, just skip it); and it is on npm as `@edgemodders/edgemat-mcp`. Checked here: the bundled server answers under Node and under VS Code's own binary, all 10 tools |

### 2026-10-20

| What | Detail |
|---|---|
| **0.3.0 released** | The first preview, on your go: the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=edgemodders.edgemat) and [Open VSX](https://open-vsx.org/extension/edgemodders/edgemat) (your call: not only GitHub, as REDcode), and the [GitHub release](https://github.com/Edgemodders/EDGEmat/releases/tag/v0.3.0) with the VSIX, the MCP server file and the Nexus zip. The wiki's install page now starts from the Marketplace. Your six in-game shots fill the two tutorials |
| Docs for 0.3 | The EDGEmat wiki in EDGEweb: editing and Save to Project in the setup editor page; new pages New Material and Your mod in the game (packing, the hot folder and REDmod pitfalls, CET); two tutorials from your tests, worn leather in the editor and snakeskin by asking Claude, with screenshot placeholders; the assistant's new tools and the key; settings, troubleshooting, install. The Nexus description and form for 0.3, with eight screenshot slots. The extension's and the repo's READMEs |
| **Generate seen in the game** | Your New Material hand test passed, all 9 steps, with your own key: the first live calls to an image service. Then the round trip: worn leather from the page and a dark green snakeskin asked of Claude, on the two slim-fits, both in the game on your V. The pants keep their own folds at their normal size; the texture is fine and even, with no repeat seen; the panel lines read as stitching. M3's tests are all done ([Tests](testing.html#generate-round-trip)) |
| **New Material built** | The page (Library title bar, or New Material Here on a material in Find, which targets both bodies): words or your own image, takes tiled 3 × 3, name, Repeat, Bumps, Shine, Metal, Add to Project. Keys in VS Code's secret storage (Set and Clear Image Service Key commands); a Cancel; the chosen model remembered. MCP `mat_generate`, `mat_from_image`, `mat_apply` (keys from the server's environment). Your hand test and the Generate round trip are next |
| Generate's core | Behind the New Material page: the Gemini and OpenAI clients (models listed from your key's account, a time limit and cancel, errors in plain words, the texture prompt); an image made seamless, with bumps and shine maps derived; a material written into a project and put on mesh materials, with the repeat baked in on a garment. The smoke test runs both services against a stand-in server, so it needs no key |
| **Tiling check done** | Your screenshots of the slim-fits pants: the garment keeps a texture upright and at one even scale; one leg is mirrored; the pattern breaks at the island borders. `LayerTile` repeats the texture that many times each way, and the garment's folds too (you saw finer wrinkles down the legs). Proposed for Generate: on a garment, bake the repeat into the texture and keep LayerTile 1 and the garment's own normal map; on objects, LayerTile is the repeat; no text in generated textures (design, "Generate a material") |
| Tiling check ready | Generate's groundwork in the core: a texture written into a project from a PNG (a game texture of the kind copied first, so it takes the right settings), a textured `.mi` on `metal_base.remt`, and one material of a mesh pointed at it. `npm run tiling-check` uses them to put a numbered UV test pattern on the slim-fits pants, at LayerTile 1 on one look and 4 on another, for your in-game test |
| **Seen in the game** | Your hand test of editing and Save to Project passed, all 14 checks. Then the round trip: the jacket from the editor, the jeans Claude recolored and the sneakers showed their new materials in the game, on your V. The sneakers were saved both as a new setup and in place (with Material Texture Override); the game showed the new setup, which the project's mesh copies name |
| Deploying | Two things kept the mod out of the game, neither in EDGEmat. Red Hot Tools is installed on the laptop, so Pack and Try sent the archive to `archive\pc\hot`, which Red Hot Tools reads only while the game runs; the game was not running, so the archive stayed there. A Deploy from REDcode put it in the game. You are asking the REDcode session to make that path clearer. And the project packs as a REDmod (`redcode.pack.redmod` on), into `mods\`, which needs `redMod.exe deploy` (EDGEdeck's deploy runs it) and a game started with `-modded`. A material mod needs neither: unticking the setting packs to `archive\pc\mod` |
| **Editing built** | Click a layer in the setup editor and change its surface, color (the surface's own swatches, filtered by words such as "blue"), finish, tiling, opacity and microblend. Each change shows at once; Ctrl+Z undoes. A new surface resets the layer's color and finish to that surface's defaults, and says so |
| **Save to Project built** | Saves the setup into your project (REDcode's open one, or one you pick). By default as a new setup beside the original, with every mesh that uses it copied into the project and pointed at it, so it shows in the game with no other mod: on the Arasaka jacket that is three meshes, found in half a second. REDcode's Pack and Try is offered right after. Ctrl+S on a game file opens it; a project's own file saves in place |
| **`mat_edit`** | Claude recolors in words ("dark red", "glossy", "leather standard clean"): EDGEmat picks the surface's closest preset, says how close it is, and saves the same way, or only previews |
| Find fixed | Jackets and other outer wear showed no looks: their appearances also name first and third person (`&Male&TPP`). Find now walks them |
| Mask sets named by meshes | Your first test: Claude's jeans setup opened from the project showed no color map. The feminine jeans keep their masks in `citizen_casual`, not beside the setup in `player_equipment`. A setup now takes the mask set its meshes' materials name (the project's meshes for a project file), then one beside it. The 3D colors were already right in a test on the dev PC; your 3D view result is being looked at |
| Saving a setup again | Your step 10: "No mesh beside ... uses it". Your project zip showed why: the jacket was saved into it once already, and EDGEmat reads the project's copy of a mesh before the game's, which pointed at the first save. Those meshes now count, and only the setup is written again. The dialog and `mat_edit` also say why when no mesh is found |
| EDGEdeck's name | EDGEmat still looked for REDdeck (`edgemodders.reddeck`), EDGEdeck's old name, so it never used EDGEdeck's game folder. The code, the `edgemat.gamePath` setting and the design now say EDGEdeck (`edgemodders.edgedeck`, same API) |
| Test garments | The Arasaka jacket is an NPC garment, so V cannot wear it. The in-game test uses the Rocker's Heart crystaljock bomber, the punk jeans and the Sunny Ammo sneakers |

### 2026-10-19

| What | Detail |
|---|---|
| Two early checks for Generate | **A new texture from a PNG works**: REDbridge makes it, but with the wrong settings for anything but plain color, so EDGEmat copies a game texture of the right kind in first; asked REDbridge for a cleaner way ([#8](https://github.com/Edgemodders/REDbridge/issues/8)). **A textured material on a garment**: the game does it already, on Dawn's pants' stitching, with `metal_base`, which has a tiling setting. How a tiled texture looks across a garment's unwrapped parts is checked in the game with EDGEmat's first written mesh, so no hand-made test is needed from you |
| **The first preview becomes 0.3.0** | Your call: no 0.2 release. The first preview waits for M3, so it edits with a full round trip (recolor in EDGEmat, save into a REDcode project, pack and deploy with REDcode, see it in game), and it takes Generate's first slice from M4, so it has AI generation. A generated material replaces a whole material, so the preview shows it on objects and simple parts ([design, "Phases"](design.html#phases)) |
| A long-term goal recorded | Asking an AI agent to redesign a garment. It needs every material and how each maps onto the item; it starts small with `mat_find`, `mat_describe` and M3's `mat_edit` ([design, "Later ideas"](design.html#redesign-a-garment-by-asking-an-ai)) |
| **M2 done** | The phase test passed: the Arasaka jacket's 20 layers match WolvenKit's own reading of the file in all 360 fields, and you judged Claude's description from `mat_describe` accurate. The white stitching you saw is a separate decal material on the mesh, not part of the setup ([Tests](testing.html#m2-phase-test)) |
| Wiki | EDGEmat's user manual on [edgemodders.ai](https://edgemodders.ai/wiki/edgemat/), ten pages on EDGEdeck's template with screenshot placeholders; EDGEmat's cards and the wiki home now say preview |
| Nexus page ready | `nexus/description.bbcode` in REDnode's style, with six screenshot placeholders, and `nexus/README.md` with the form fields. Each release now also makes `EDGEmat-<version>-nexus.zip` (the VSIX, the MCP server, an install README, the licenses). Not posted: your call |
| Licenses shipped | The extension and the MCP server bundle 10 npm packages (MIT, ISC, BSD-3-Clause). Their notices now travel in the VSIX, the release and the Nexus zip (`THIRD-PARTY-NOTICES.txt`, made from the builds) |
| View in 3D and CLI install passed | Your hand test of View in 3D (all 7 checks), and the packaged VSIX installed from the command line into a normal VS Code. Every M2 hand test has now passed |
| Changelog and release notes | Kept as REDnode keeps them: [Changelog](changelog.html) on the docs site is the one changelog, with each change under **Unreleased** as it is made. The GitHub release notes, the extension's Changelog tab in VS Code and later the Nexus changelog are made from it by a script; the release stops if the version has no section. Steps in [Dev setup, "Releasing"](dev-setup.html#releasing) |
| **View in 3D built** | Your idea. An eye on each mesh in Find opens it in REDcode's 3D view, and EDGEmat now gives that view the colors: a layered material's color map, or a textured material's own texture. Colors only for now, marked approximate; bumps and shine come with M5. REDcode's side already existed. The smoke test checks it on the sneakers and the jacket. Your hand test is next ([Tests](testing.html#view-in-3d)), then the 0.2.0 release |
| Find hand test passed | All 10 checks, through F5. The test steps now say where Find is: a header below the Library, and the Library's magnifier is Search Library, not Find |
| **Roadmap revised** | A new **M4 Make** ahead of the preview: materials for new meshes, which EDGEfab needs for the clothes and objects it makes. The preview moves to M5, Beyond mlsetup to M6, Ship to M7. Make holds materials from a model's textures, **Generate a material**, game materials on a new mesh and the Looks editor ([design, "Phases"](design.html#phases)) |
| Generate a material designed | Your idea: a non-artist types "brown leather" and gets a material. An AI image service (Nano Banana, Nano Banana Pro, GPT Image), opt-in with your own key, or your own photo. EDGEmat makes it seamless, derives bumps and shine, and writes a textured `.mi`. One general prompt prefix plus your words; presets only if tests show the need. The UI follows EDGEwave's generation dialog, with a tiled preview to show seams ([design](design.html#generate-a-material)) |
| Why not a layer | A layer of a game garment has no color texture, only a surface and a color preset, so recoloring a game garment stays a surface plus a color (no AI needed). Generated images go into textured `.mi` materials |
| EDGEfab's brief extended | Clothing fitted to the body: the game's body types, the body dummies and refitters in WolvenKit's Blender add-on, and Blender MCP servers so an assistant can model in Blender. EDGEfab gets materials from EDGEmat: generated, or picked from the game ([EDGEfab design](https://edgemodders.github.io/EDGEfab/design.html)) |
| Network rule changed | No network calls except to an AI service you chose, only when you press Generate, with your own key. Still no telemetry |

### 2026-10-18

| What | Detail |
|---|---|
| Release plan | The first preview is **0.3.0**, at the end of M3: the VS Code Marketplace and Open VSX, and a GitHub release with the VSIX, the MCP server as one file and the Nexus zip. The release workflow makes it from a `v*` tag. npm for the MCP server waits for M7 |
| Test build sent | `edgemat-0.1.0-m2-preview.vsix` (everything through M2), for your laptop. It shows as 0.1.0; 0.2.0 installs over it |
| EDGEchat | Its design plans an `edgemat` server. `edgemat-mcp` now treats an empty setting as unset, so EDGEchat needs no wrapper script for it. It needs the npm package (M7, or earlier if you want) |

### 2026-10-17

| What | Detail |
|---|---|
| Find built | A new **Find** view under the Library: type an item's in-game name ("punk jeans") or part of a mesh path. An item opens into its looks per body, then meshes, then materials; clicking a multilayered material opens its setup with the exact mask set its material names, no guessing. On the jeans it shows the feminine body wearing other pants (`l1_066`) than the masculine (`l1_062`). Assistants get the same through MCP `mat_find` |
| Setup editor hand test passed | All 13 checks, including a setup opened from REDcode's Game Assets. Buttons got a clearer outline along the way, and the test steps now say where each control is |
| Setup editor built (read-only) | Open any setup: from the game by name, a file, a project, a mod archive, or REDcode's Game Assets. Each layer in plain words, and a color map of where each layer goes on the garment's texture; click a spot to find its layer, and the selected layer's area lights up. It flags what looks wrong: on our M0 test setup it points at layer 4's unknown color ("shows white") and layer 9's all-None presets. Assistants get the same through MCP `mat_describe` |
| Surface page hand test passed | Your run through F5: all 13 checks, and the Library view checks again (including the new log line naming the bridge) |
| Surface page built | Click a surface in the Library: a larger image tinted with the color you pick, every color as a swatch with a plain name, a filter ("red") and "closest to" a typed or picked color, roughness, metal and bumps in plain words, the textures, raw values one click away. Microblends get a page too. One tab is reused until you press Keep open. Assistants get the same through MCP `mat_colors` ("the closest dark red on this leather") |
| Open question found | Preset colors may be linear rather than screen colors; if so, swatches should be brighter. Checked in M5 (design, "Open questions") |
| EDGEfab's social preview | Uploaded by you |
| Three requests shipped | REDcode #6 and #7 in REDcode 0.10.0, REDbridge #5 in REDbridge 0.9.0 (latest is 0.10.0). REDnode #12 and EDGEbuilder #1 still open. EDGEmat's design and EDGEfab's brief get updated to the shipped shapes once you report all done |

### 2026-10-16

| What | Detail |
|---|---|
| Tests page | [Tests](testing.html): every test so far, with steps to rerun it, expected results and the test project's contents. The log now names REDcode's bridge when EDGEmat uses it |
| **M1 done** | Smoke test passes, and your hand test through F5 passed: the icon, the Library with thumbnails and hover cards, search, rebuild |
| Surface page planned for M2 | Clicking a surface opens a read-only page: big image, every color as a named swatch, presets in plain words, texture paths. Game surfaces are never edited in place, because every item using one would change. "Use on this layer" (M3) and "Make a custom copy" (M6) come later |
| CLI install test noted | In M7's test and in [Your to-dos](#your-to-dos) |
| M1 built | The extension, the library built from the game (386 surfaces, 131 microblends, 155,099 color presets, 343 thumbnails, about 22 s, 4 s with thumbnails cached), the MCP server, `npm run smoke`. Thumbnails: near-grey textures shown grey to avoid speckle; flat ones shown as relief from the normal map |
| EDGEfab created | The EDGE asset maker: "make it a game thing" for new items and objects. You created the repo; this session scaffolded it with branding and its cube activity icon. Its own session starts after the requests above |
| Custom-asset goals added | Import a textured model (GLB first), view it with its looks, the whole asset workflow, hot-loading archives. Requests filed to REDcode, REDbridge, REDnode and EDGEbuilder |
| **M0 done** | You agreed the behavior spec draft 0.2 |
| Neurolinked contacted | You sent the memo by Discord DM |

### 2026-10-15

| What | Detail |
|---|---|
| In-game tests done | On the "Sunny Ammo synthetic high-tops". See [what we learned](#what-we-learned-about-the-game) |
| The override mystery solved | The first round showed no change. After ruling out the appearance, archive mounting, hashes, load order and `modlist.txt`, WolvenKit's own warning named the cause: a replaced game `.mlsetup` needs the Material Texture Override mod. REDdeck's `modlist.txt` bug, found along the way, was fixed by its session |
| Preview split agreed | REDcode shows meshes; EDGEmat renders materials and hands them to REDcode's viewer. A shared viewer component is for later |
| Runtime materials | Changing materials in the running game through REDagent is a key long-term goal (design, "Later ideas") |
| Game folder and bridge | EDGEmat takes the game folder and the running bridge from REDcode, so a REDcode user configures nothing |
| Activity bar and Open any file | EDGEmat gets its own icon. Opening a file from anywhere, then Save to Project, is a supported workflow |

### 2026-10-14

| What | Detail |
|---|---|
| Spec checked against the game | Through REDcode's MCP server: the chain from an item to its layers, every `.mlsetup` field, templates, masks. Rows marked confirmed or corrected |
| Test set chosen | The Arasaka samurai jacket, the s1_055 sneakers, the l1_062 jeans |
| Spec draft 0.1 | Written in a cloud session from a study of MlsetupBuilder's behavior (never its code) |
| Design 0.2 agreed | A standalone extension, `.mlsetup` first, an MCP server with every feature, the library built from your game and never shipped |
| Scaffold | README, license, docs site, brand |

## Decisions

| Decision | Why | Date |
|---|---|---|
| Game surfaces are read-only; custom colors come from a custom copy | A surface is shared by every item that uses it | 2026-10-16 |
| The bridge client is copied from REDcode for now | A shared npm package for the EDGE tools stays the goal | 2026-10-16 |
| The library is built from the user's game, never shipped | The EDGE repos never ship data extracted from the game; it also stays current after patches | 2026-10-14 |
| REDcode shows meshes, EDGEmat renders materials | No second mesh viewer; loose coupling through an API | 2026-10-15 |
| EDGEfab owns new assets; EDGEmat owns materials and looks | Keeps each tool to one job | 2026-10-16 |
| MlsetupBuilder is studied, never copied | It is GPL-3.0; EDGEmat is MIT | 2026-10-14 |
| Releases use REDnode's workflow: **Run workflow**, with **Make a release** ticked to release; unticked gives a test build | The owner wants one release flow across the EDGE tools. `publish.yml` (a pushed `v*` tag) became `release.yml`; `tools/version.mjs` raises the version, as in REDnode | 2026-10-22 |
| The MCP server comes with the extension, and goes to npm from 0.3.1 | A Marketplace install must get every feature, the assistant's included; npm serves clients without VS Code. Was M7 | 2026-10-21 |
| The preview goes to the Marketplace and Open VSX, not only GitHub | It edits and makes materials now, so a store install gets what the page promises; you install it from the store, as REDcode and EDGEdeck. Was M7 | 2026-10-20 |
| M4 Make comes before the preview | EDGEfab needs materials for new meshes; a textured `.mi` is seen without the layered bake | 2026-10-19 |
| Generated images become textured `.mi` materials, not layers | A layer has no color texture | 2026-10-19 |
| AI generation follows EDGEwave's idiom; keys in VS Code's secret storage, environment variables for MCP | One look across the EDGE tools; the MCP server cannot read VS Code's secrets | 2026-10-19 |
| The Nexus page is prepared now, posted when the owner decides | The owner reviews the roadmap to M7 first | 2026-10-19 |
| Every EDGE repo commits as `CyberbuildsAI`, EDGEweb too | Edgemodders is the organization; the CyberbuildsAI account owns it (the owner, 2026-10-19). EDGEweb's CLAUDE.md fixed | 2026-10-19 |
| On a garment, Generate bakes the repeat into the texture and keeps LayerTile 1 and the garment's normal map; on objects LayerTile is the repeat | The tiling check: LayerTile repeats every map, folds included | 2026-10-20 |
| Image models are listed from the key's own account, not hard-coded | Both services renamed and retired models within months (GPT Image 1.5 retires 2026-12-01) | 2026-10-20 |
| A recolor saves as a new setup with mesh copies pointed at it, by default | Shows in the game with no other mod; how most recolor mods ship. In place stays an option, with an MTO warning | 2026-10-20 |
| The first preview is 0.3.0 at the end of M3, with Generate's first slice from M4 | The owner wants the preview to edit with an in-game round trip, and to have AI generation | 2026-10-19 |
| ~~A 0.2.0 preview on GitHub only, at the end of M2~~ Replaced by 0.3.0 | Something real to show; the stores wait for editing (M7). Still GitHub only, no stores until M7 | 2026-10-18 |

Settled 2026-10-20: a recolor is saved as a new setup with its meshes pointed at it by default; in place stays an option that warns about MTO. Other open questions are in the [design](design.html#open-questions).

## What we learned about the game

The facts that shape the editor. Each is in the [behavior spec](design/behavior.html) with its evidence.

| Finding | What it means for EDGEmat |
|---|---|
| A replaced game `.mlsetup` only shows with the Material Texture Override mod | Saving in place must check for MTO; a new path avoids it |
| Mask *i* drives layer *i* | Clicking a mask region selects the right layer |
| A color name the surface does not have renders white | EDGEmat only offers the surface's own colors, and warns on unknown ones |
| All preset names `None` hides the layer | A way to switch a layer off |
| `ratio` changes how the microblend maps onto the item | Shown as a setting with a plain description |
| Level presets are pairs: out = scale × in + bias | Shown in plain words, raw values one click away |
| The running game shows a setup's `ratio` to scripts, not its layers | Runtime recoloring needs another route than the script API |
| A layer shows where its mask plus its microblend's alpha is over 1: masks are painted around that threshold (0.65 shows with the default microblend, 0.55 does not) | The color map applies it since 2026-10-26; a preview without microblends tints garments with layers the game hides |
| Many mesh looks are worn by no item (NPC looks, and often `default`) | The Desk opens a look an item wears and marks the others "no item" |
| A garment keeps a texture upright and at one even scale; some islands are mirrored; a pattern breaks at island borders | A generated texture must be seamless and have no text; fine textures hide the borders |
| `metal_base`'s `LayerTile` repeats its textures that many times each way, the normal map too | On a garment the repeat is baked into the texture, so the garment's folds keep their scale (proposed) |
| An item reaches its layers through TweakDB, the `.ent`, the `.app`, the mesh appearance and its materials | M2's "find an item's materials" follows this chain |

## Try it

| What | How |
|---|---|
| Run the extension from source | Open this repo in VS Code, `npm run build`, then F5 ("Run EDGEmat") |
| Check the library against the game | `npm run smoke` |
| Use the MCP tools from Claude Code | [Dev setup](dev-setup.html), section 4 |
