# EDGE<span class="y">mat</span> docs

EDGEmat is the EDGEmodders material editor for Cyberpunk 2077, a VS Code extension with an MCP server: pick a garment, click a layer, choose a color and see it on the model, or ask an assistant to do it.

| Document | What it covers |
|---|---|
| [Design](design.html) | The mission, what EDGEmat edits, its shape, the material library, the MCP server, prior art, phases M0 to M6. Draft 0.2 |
| [Behavior spec](design/behavior.html) | What EDGEmat must understand about multilayered materials: the chain from item to layers, every `.mlsetup` field, templates, masks, how layers blend, saving, bridge needs, features, the test set, in-game tests and the checklist for the local session. Draft 0.2, checked against the game (2026-10-15) |
| [Dev setup](dev-setup.html) | What a PC needs to work on EDGEmat |
| [REDcode docs](https://edgemodders.github.io/REDcode/) | The editor extensions and the bridge EDGEmat builds on |

## Roadmap status

As of 2026-10-15.

| Phase | Status |
|---|---|
| M0 Spec | In progress. The [behavior spec](design/behavior.html) is at draft 0.2 (2026-10-15): every checklist item checked against the game, the open questions tested in game, one bridge request filed and shipped ([REDbridge #4](https://github.com/Edgemodders/REDbridge/issues/4)). Next: the owner agrees the spec and contacts Neurolinked |
| M1 Library | Not started |
| M2 Read | Not started |
| M3 Edit | Not started |
| M4 Preview | Not started |
| M5 Beyond mlsetup | Not started |
| M6 Ship | Not started |

Source code and issues: [github.com/Edgemodders/EDGEmat](https://github.com/Edgemodders/EDGEmat)
