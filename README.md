<p align="center">
  <img src="docs/assets/brand/banner.png" alt="EDGEmat: the EDGEmodders material editor for Cyberpunk 2077. Edit Cyberpunk 2077 materials and see the result. Edits .mi, .mt and .mlsetup files, engine REDbridge, MIT." width="100%">
</p>

<p align="center">
  <a href="https://edgemodders.github.io/EDGEmat/"><img src="docs/assets/brand/badges/docs.svg" alt="docs: read the docs"></a>
  <img src="docs/assets/brand/badges/status.svg" alt="status: scaffold">
  <img src="docs/assets/brand/badges/game.svg" alt="game: Cyberpunk 2077">
  <img src="docs/assets/brand/badges/files.svg" alt="edits: .mi .mt .mlsetup">
  <a href="LICENSE"><img src="docs/assets/brand/badges/license.svg" alt="license: MIT"></a>
</p>

The EDGEmodders material editor for Cyberpunk 2077. Open a material instance (`.mi`), see every parameter it inherits from its template (`.mt`), change colors, textures and values, and see the result on a preview. Multilayered materials (`.mlsetup`, `.mltemplate`, `.mlmask`) get a layer editor. Game files are read and written through [REDbridge](https://github.com/Edgemodders/REDbridge), the same engine [REDcode](https://github.com/Edgemodders/REDcode) uses.

**[Read the docs](https://edgemodders.github.io/EDGEmat/)** &middot; [Design](docs/design.md) &middot; [Dev setup](docs/dev-setup.md)

> [!NOTE]
> **Status: scaffold.** The repository, the branding, the docs site and a draft design exist; there is no code yet. Next: M0, decisions with the user.

## Repository layout

| Path | Contents |
|---|---|
| `docs/` | Documentation site: the design and dev setup |
| `tools/brand/` | Renders the banner, icon and badges |

## Legal

EDGEmat is MIT. Like REDcode, it talks to REDbridge (GPL-3.0, because it links WolvenKit) only as a separate process and never links it. This repository contains no game files and no data extracted from them. Single-player modding only. EDGEmat is not affiliated with CD Projekt RED.

## License

[MIT](LICENSE)
