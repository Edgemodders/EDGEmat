# Wardrobe Designer on Nexus Mods

The source of Wardrobe Designer's own Nexus Mods page, beside EDGEmat's (`nexus/` at the repo root), the way REDnode keeps its app packs' pages. **The page: [mod 36636](https://www.nexusmods.com/cyberpunk2077/mods/36636)**, made by the owner on 2026-10-30 with Nexus's starter text and no files; the first release fills it. It is kept through Nexus's v3 API with `tools/nexus/` (copied from REDnode; keep the copies the same), as EDGEmat's page is.

| File | What it is |
|---|---|
| `description.bbcode` | The page's description, in Nexus's BBCode. The release workflow pushes it; check it first with `node tools/check-bbcode.mjs apps/wardrobe-designer/nexus/description.bbcode` |
| `nexus.json` | The page (36636), its internal mod id, how a release uploads (Mod Manager Download on, the old version archived), and the hash of the description last pulled. The first release adds the main file's id on the next pull |
| `README.md` | This page |

The brand images are in `docs/assets/wardrobe-designer/`, drawn by `tools/brand/render-wardrobe.ps1` from `tools/brand/wardrobe.html`:

| Image | Use |
|---|---|
| `banner.png` | 2560 x 640, at the top of the description (loaded from GitHub) and of the docs page |
| `nexus.png` | 1280 x 640, the page's primary image: the social layout 55 px lower, with the top left empty for the EDGEmodders header, which the owner adds by hand (as on REDnode's and its packs' Nexus images). Rendering it again clears the header: add it again after |
| `social.png` | 1280 x 640, for links shared on social sites |
| `icon.png` | 256 x 256 |

## Releasing

The release workflow `.github/workflows/release-wardrobe.yml` (Actions tab, **Release Wardrobe Designer**), with **Make a release** and **Update Nexus Mods** ticked, or `npm run wardrobe:release -- -f nexus=true`. Steps in `docs/dev-setup.md`, "Releasing Wardrobe Designer". Only after every test of the builds since the last release has passed (`docs/testing.md`).

Edits made on the Nexus page itself: `npm run wardrobe:nexus:pull` writes the live description here, then merge and commit before the next release, or the release stops before it uploads anything.

**Known limit:** `tools/nexus/nexus.mjs` recognizes a description pushed by an earlier release only at `v*` tags, which are EDGEmat's. Wardrobe Designer's tags are `wardrobe-designer-v*`. So after a release that pushed the description, run `npm run wardrobe:nexus:pull` and commit, or the next release that changes the description stops (it cannot tell the release's push from an edit on Nexus). Asked of REDnode, which owns the tool, as [REDnode #30](https://github.com/Edgemodders/REDnode/issues/30).

## Before posting: the placeholders

| In `description.bbcode` | Replace with |
|---|---|
| `Screenshot 1` and `Screenshot 2` (cyan italics) | Upload each picture to the page's Images tab, then replace its line with `[img]<the image's Nexus URL>[/img]` and a one-line caption. Before publishing a picture, check it for personal data |
| `0.48.1` (REDnode) | The REDnode the app needs, from `requires` in `apps/wardrobe-designer/rednode-app.json`, when it changes |

## The Nexus form

| Field | Value |
|---|---|
| Mod name | Wardrobe Designer |
| Version | The app's version, from `apps/wardrobe-designer/rednode-app.json` (0.1.0) |
| Category | Utilities (or Appearance, the owner's choice) |
| Brief overview | Restyle what V wears in your own words: pick a piece of clothing on the inventory screen, type "red leather" or "yellow denim", and see it change in seconds. A REDnode app, with an AI that plans the materials. (255 characters at most; this is 211) |
| Author | Edgemodders |
| Language | English |
| Primary image | `docs/assets/wardrobe-designer/nexus.png`, with the EDGEmodders header added by hand |
| Requirements | On Nexus: REDnode (35419), REDagent (35670). REDbridge from REDnode's Mod Manager. Game version 2.5 |
| Permissions | MIT: open source, free to modify and redistribute with the license notice. Bundled packages keep their licenses (`THIRD-PARTY-NOTICES.txt` in the zip) |
| Tags | Clothing, utility, AI |
