# EDGEmat: notes for Claude sessions

EDGEmat is the EDGEmodders material editor for Cyberpunk 2077: a standalone VS Code extension in the EDGE family (`edgemodders.edgemat`) and an MCP server, so a modder edits materials in the UI or tells REDagent or Claude "make this jacket red". Multilayered setups (`.mlsetup`, `.mltemplate`, `.mlmask`) first, then `.mi` and `.mt`. Read [docs/design.md](docs/design.md) first. It reads and writes game files through REDbridge, like REDcode.

## Status and next step

- Scaffold created 2026-10-14: README, license, docs site (HUD layout, dev setup), brand sources and images, Pages workflow. No code.
- **Design draft 0.2 agreed in chat on 2026-10-14:** standalone extension, `.mlsetup` first, an MCP server beside the UI with every feature in both, the material library built from the user's game (never shipped), MlsetupBuilder studied for behavior and never copied. Phases M0 Spec to M6 Ship.
- **M0 Spec in progress.** `docs/design/behavior.md` draft 0.1 was written on 2026-10-14 in a cloud session (no game install) from a study of MlsetupBuilder 1.6.9, commit `4271e8c`. **Draft 0.2 on 2026-10-15:** checked against the game, in-game tests done (with the Material Texture Override mod, which replaced game `.mlsetup` files need).
- **Checked on the dev PC on 2026-10-14** through `redcode-mcp` (setup in `docs/dev-setup.md`): checklist items 1 to 6, 8 and 10 done, rows marked confirmed or corrected. Test set: t2_078 Arasaka jacket, s1_055 sneakers, l1_062 jeans. One bridge request filed: REDbridge #4 `tweakdb.records`, shipped in REDbridge 0.8.0 on 2026-10-15. REDcode 0.9.0 exports `REDcodeApi` (extension `edgemodders.redcode-cyberpunk`); the design uses it for the game folder, the bridge and the project. Local checkouts of sibling repos can lag: check GitHub before calling something missing.
- **Neurolinked contacted on 2026-10-16** by Discord DM from the owner (design, "Prior art"). Record any reply there.
- **Next:** the user agrees spec draft 0.2; then M1 (extension and MCP skeletons, activity bar container, bridge client, material library). Open for M3: save recolors in place (needs MTO) or at a new path (no MTO); see the spec's section 6. In-game checks can read the running game through REDnode's MCP server (`rednode` in Claude Code). Test archives go in the test project's `tests` folder, never `packed` (WolvenKit clears it).

## Conventions

- Same as the sibling repos (see REDcode's and REDnode's CLAUDE.md): commit straight to `main` in small commits and push; plain, short sentences; tables for facts; mark anything unverified.
- **Git identity:** per repo, `CyberbuildsAI` with the GitHub no-reply email (`340969962+CyberbuildsAI@users.noreply.github.com`). Never change the global identity.
- **Never commit game files**, WolvenKit binaries, or data extracted from the game.
- **License boundary:** this repo is MIT. Talk to REDbridge (GPL-3.0) only as a separate process; never link it or copy WolvenKit code here. Needs from the bridge go to REDbridge as issues labelled `request`, with the shape that would work.
- **Do not change REDcode or REDbridge from here**; other sessions work in them.
- **MlsetupBuilder (GPL-3.0) is studied, never copied.** Only the M0 spec session reads its source, and writes what it learns in its own words in `docs/design/behavior.md`. Build sessions work from that spec and never open MlsetupBuilder's source. No code, text or data from it in this repo. GPL logic worth reusing as code goes into REDbridge with attribution.
- **The mission decides UI questions:** modding for everyone, especially non-coders; easy, fun, fast. Plain words first, raw values one click away. Every feature ships in the UI and the MCP server together. AI is optional: no network calls or telemetry until an assistant connects.
- Keep `extensions/edgemat/src/core` free of VS Code imports; the MCP server bundles it.
- **House style** is the HUD look from REDnode's design doc, and the REDnode HUD theme in REDcode is the default theme for any VS Code UI.
- **Docs site:** `docs/` is published by GitHub Pages through `.github/workflows/pages.yml`. `docs/index.md` is the landing page (document ledger and roadmap status); add every page to `nav` in `docs/_config.yml`. Brand images come from `tools/brand/render.ps1`. Record every tool install in `docs/dev-setup.md`, with versions and exact commands.
