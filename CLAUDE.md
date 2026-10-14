# EDGEmat: notes for Claude sessions

EDGEmat is the EDGEmodders material editor for Cyberpunk 2077: material instances (`.mi`), templates (`.mt`) and multilayered setups (`.mlsetup`, `.mltemplate`, `.mlmask`), with a preview. Read [docs/design.md](docs/design.md) first. It reads and writes game files through REDbridge, like REDcode.

## Status and next step

- Scaffold created 2026-10-14: README, license, docs site (HUD layout, design draft 0.1, dev setup), brand sources and images, Pages workflow. No code.
- **Next: M0 Decide** with the user (open questions in the design), starting with the form of the tool and its place beside REDcode. Agree the plan in chat before any code.

## Conventions

- Same as the sibling repos (see REDcode's and REDnode's CLAUDE.md): commit straight to `main` in small commits and push; plain, short sentences; tables for facts; mark anything unverified.
- **Git identity:** per repo, `CyberbuildsAI` with the GitHub no-reply email (`340969962+CyberbuildsAI@users.noreply.github.com`). Never change the global identity.
- **Never commit game files**, WolvenKit binaries, or data extracted from the game.
- **License boundary:** this repo is MIT. Talk to REDbridge (GPL-3.0) only as a separate process; never link it or copy WolvenKit code here. Needs from the bridge go to REDbridge as issues labelled `request`, with the shape that would work.
- **Do not change REDcode or REDbridge from here**; other sessions work in them.
- **House style** is the HUD look from REDnode's design doc, and the REDnode HUD theme in REDcode is the default theme for any VS Code UI.
- **Docs site:** `docs/` is published by GitHub Pages through `.github/workflows/pages.yml`. `docs/index.md` is the landing page (document ledger and roadmap status); add every page to `nav` in `docs/_config.yml`. Brand images come from `tools/brand/render.ps1`. Record every tool install in `docs/dev-setup.md`, with versions and exact commands.
