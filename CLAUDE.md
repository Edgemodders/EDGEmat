# EDGEmat: notes for Claude sessions

EDGEmat is the EDGEmodders material editor for Cyberpunk 2077: a standalone VS Code extension in the EDGE family (`edgemodders.edgemat`) and an MCP server, so a modder edits materials in the UI or tells REDagent or Claude "make this jacket red". Multilayered setups (`.mlsetup`, `.mltemplate`, `.mlmask`) first, then `.mi` and `.mt`. Read [docs/design.md](docs/design.md) first. It reads and writes game files through REDbridge, like REDcode.

## Status and next step

- Scaffold created 2026-10-14: README, license, docs site (HUD layout, dev setup), brand sources and images, Pages workflow. No code.
- **Design draft 0.2 agreed in chat on 2026-10-14:** standalone extension, `.mlsetup` first, an MCP server beside the UI with every feature in both, the material library built from the user's game (never shipped), MlsetupBuilder studied for behavior and never copied. Phases M0 Spec to M6 Ship.
- **M0 Spec done on 2026-10-16** (spec draft 0.2 agreed by the owner). `docs/design/behavior.md` draft 0.1 was written on 2026-10-14 in a cloud session (no game install) from a study of MlsetupBuilder 1.6.9, commit `4271e8c`. **Draft 0.2 on 2026-10-15:** checked against the game, in-game tests done (with the Material Texture Override mod, which replaced game `.mlsetup` files need).
- **Checked on the dev PC on 2026-10-14** through `redcode-mcp` (setup in `docs/dev-setup.md`): checklist items 1 to 6, 8 and 10 done, rows marked confirmed or corrected. Test set: t2_078 Arasaka jacket, s1_055 sneakers, l1_062 jeans. One bridge request filed: REDbridge #4 `tweakdb.records`, shipped in REDbridge 0.8.0 on 2026-10-15. REDcode 0.9.0 exports `REDcodeApi` (extension `edgemodders.redcode-cyberpunk`); the design uses it for the game folder, the bridge and the project. Local checkouts of sibling repos can lag: check GitHub before calling something missing.
- **Neurolinked contacted on 2026-10-16** by Discord DM from the owner (design, "Prior art"). Record any reply there.
- **EDGEfab** (github.com/Edgemodders/EDGEfab), the EDGE asset maker, was scaffolded from this session on 2026-10-16: it owns "make it a game thing" for new items and objects and calls EDGEmat for materials and looks (design, "Custom assets"). Custom-asset requests filed: REDcode #6 (updated) and #7, REDbridge #5, REDnode #12, EDGEbuilder #1.
- **M1 Library done on 2026-10-16** (smoke test, and the owner's hand test through F5): extension 0.1.0 (`extensions/edgemat`: activity bar container, Library view with thumbnails, plain-words search), MCP skeleton (`packages/edgemat-mcp`: `mat_library`, `mat_templates`, `mat_microblends`), the bridge client copied from REDcode `9f54c80`, the library cached in `%LOCALAPPDATA%\EDGEmat`. `npm run smoke` builds it from the game and checks counts (386 surfaces, 131 microblends, ~22 s). Build steps: `docs/dev-setup.md` section 4.
- **M2 Read in progress.** Surface page and MCP `mat_colors` built 2026-10-17 (core `colors.ts`, `surface.ts`, `images.ts`; `surfacePage.ts` with its webview script `src/webview/surface.ts`); the owner's hand test passed the same day.
- **Setup editor (read-only) and MCP `mat_describe` built 2026-10-17** (core `setup.ts`, `masks.ts`, `openSetup.ts`; `setupEditor.ts` with `src/webview/setup.ts`); the owner's hand test passed the same day.
- **Find view and MCP `mat_find` built 2026-10-17** (core `find.ts`; `findView.ts`; a found setup opens with its material's mask set through `edgemat-game:` URI options), hand test pending.
- **Next:** the owner's hand test of Find (`docs/testing.md`); then M2's phase test (design, "Phases") and M3 Edit (design, "In VS Code" and "Phases"). **Owner asked on 2026-10-16:** test the CLI install of the packaged VSIX too, before release at the latest (in M6's test).

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
- **Progress log:** `docs/progress.md` is how the owner catches up without asking. Update it in the same commit as any status change: the log, decisions, findings, requests and the owner's to-dos.
- **Tests:** `docs/testing.md` lists every test with steps to rerun it, expected results and the last result. Add a test there when it is first run.
- **Docs site:** `docs/` is published by GitHub Pages through `.github/workflows/pages.yml`. `docs/index.md` is the landing page (document ledger and roadmap status); add every page to `nav` in `docs/_config.yml`. Brand images come from `tools/brand/render.ps1`. Record every tool install in `docs/dev-setup.md`, with versions and exact commands.
