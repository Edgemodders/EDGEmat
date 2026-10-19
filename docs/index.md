# EDGE<span class="y">mat</span> docs

EDGEmat is the EDGEmodders material editor for Cyberpunk 2077, a VS Code extension with an MCP server: pick a garment, click a layer, choose a color and see it on the model, or ask an assistant to do it.

| Document | What it covers |
|---|---|
| [Progress log](progress.html) | Where EDGEmat stands: what was done day by day, decisions, findings from the game, open requests to other repos, and the owner's to-dos. Start here to catch up |
| [Tests](testing.html) | Every test run so far, automated, by hand and in the game: how to run it again, what to expect, and what it showed |
| [Design](design.html) | The mission, what EDGEmat edits, its shape, the material library, the MCP server, prior art, phases M0 to M7. Draft 0.2 |
| [Behavior spec](design/behavior.html) | What EDGEmat must understand about multilayered materials: the chain from item to layers, every `.mlsetup` field, templates, masks, how layers blend, saving, bridge needs, features, the test set, in-game tests and the checklist for the local session. Draft 0.2, checked against the game (2026-10-15) |
| [Dev setup](dev-setup.html) | What a PC needs to work on EDGEmat |
| [REDcode docs](https://edgemodders.github.io/REDcode/) | The editor extensions and the bridge EDGEmat builds on |

## Roadmap status

As of 2026-10-16.

| Phase | Status |
|---|---|
| M0 Spec | **Done 2026-10-16.** The [behavior spec](design/behavior.html) draft 0.2 is checked against the game and agreed; one bridge request filed and shipped ([REDbridge #4](https://github.com/Edgemodders/REDbridge/issues/4)); the viewer hook requested ([REDcode #6](https://github.com/Edgemodders/REDcode/issues/6)); Neurolinked contacted |
| M1 Library | **Done 2026-10-16** (smoke test and hand test in VS Code pass). The extension (0.1.0) with its activity bar container and Library view, the MCP server skeleton (`mat_library`, `mat_templates`, `mat_microblends`), the bridge client, and the library built from the game: 386 surfaces and 131 microblends in about 22 s, matching the game's counts (`npm run smoke` passes) |
| M2 Read | **In progress.** The surface page and MCP `mat_colors` done 2026-10-17 (hand test passed). The read-only setup editor and MCP `mat_describe` done 2026-10-17 (hand test passed). The Find view and MCP `mat_find` built 2026-10-17, hand test passed 2026-10-19 |
| M3 Edit | Not started |
| M4 Make (materials for new meshes, Generate) | Not started |
| M5 Preview | Not started |
| M6 Beyond mlsetup | Not started |
| M7 Ship | Not started |

Source code and issues: [github.com/Edgemodders/EDGEmat](https://github.com/Edgemodders/EDGEmat)
