# Changelog

## Unreleased (M2 Read, in progress)

- The surface page: click a surface or microblend in the Library to open it in an editor tab. One tab is reused as you click around; Keep Open detaches it. It shows a larger image, tinted with the color you pick; every color as a swatch with a plain name ("dark muted blue"); a filter by words and "closest to" a typed or picked color; roughness, metal and bump presets in plain words; the textures; raw values one click away.
- The setup editor, read-only: open any `.mlsetup` or `.mlsetup.json` (from the game, disk, a project, a mod archive, or REDcode's Game Assets) and see each layer in plain words, a color map of where each layer goes, and what looks wrong. **Open Setup** in the Library's title bar finds a game setup by name, or takes a file or a mod archive.
- The Find view: a garment by its in-game name ("punk jeans") or a mesh by path, down to its looks per body, meshes and materials. A multilayered material opens its setup with the exact mask set it names.
- The log names REDcode's bridge when EDGEmat uses it.

## 0.1.0 (2026-10-16), M1 Library

- The EDGEmat activity bar container and its Library view: surfaces by category and microblends, with thumbnails from the game, searchable by plain words.
- The library is built from your own game through REDbridge (REDcode's bridge when REDcode runs the same game) and cached; rebuilt when the game's archives change.
- Settings: edgemat.gamePath, edgemat.bridgePath, edgemat.dotnetRoot; empty means REDcode's.
