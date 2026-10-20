# Change<span class="y">log</span>

What changed in each EDGEmat release, for modders. Each release takes its notes from its section here: the GitHub release (written by the release workflow), the Changelog tab of the extension in VS Code (written when the extension is packaged), and later the changelog on the Nexus Mods page (pasted by hand).

How to keep it (the same way as [REDnode's](https://edgemodders.github.io/REDnode/changelog.html)):

- With each change a modder would notice, add a line under **Unreleased**, in its group: **New**, **Changed**, **Fixed** or **Other**. One change per line. Leave out what only the tests see.
- Before a release, rename **Unreleased** to `## <version> (<date>)` and start a new empty **Unreleased** above it. The release workflow stops if the version has no section.
- Links are full URLs, since the same text goes to GitHub, VS Code and Nexus.
- `npm run release:notes` prints the GitHub notes of the extension's current version (or `-- <version>`); `npm run release:notes -- --nexus` prints plain lines for Nexus's changelog field, one per change. The steps of a release are in [Dev setup](https://edgemodders.github.io/EDGEmat/dev-setup.html#releasing).

## Unreleased

The first preview: EDGEmat reads a garment's materials, shows them in plain words and in 3D, and recolors them into your mod project, in the editor or by asking an assistant.

**New**

- The surface page: click a surface or microblend in the Library to open it in an editor tab. One tab is reused as you click around; **Keep Open** detaches it. A larger image tinted with the color you pick; every color as a swatch with a plain name ("dark muted blue"); a filter by words, and the closest color to one you type or pick; roughness, metal and bumps in plain words; the textures; raw values one click away.
- The setup editor, read-only: open any `.mlsetup` or `.mlsetup.json` (from the game, a file, a project, a mod archive, or REDcode's Game Assets) and see each layer in plain words, a color map of where each layer goes on the garment, and what looks wrong. **Open Setup** in the Library's title bar finds a game setup by name, or takes a file or a mod archive.
- The Find view: a garment by its in-game name ("punk jeans") or a mesh by part of its path, down to its looks per body, meshes and materials. A layered material opens its setup with the exact mask set it names.
- **View in 3D**: the eye on a mesh in Find opens it in [REDcode](https://github.com/Edgemodders/REDcode)'s 3D view, with its colors from EDGEmat: a layered material's color map, or a textured material's own color texture. Colors only for now, marked approximate. Needs REDcode.
- MCP tools for assistants: `mat_colors` (a surface's colors, and the closest to a color you name), `mat_describe` (a setup's layers in plain words) and `mat_find` (a garment's or mesh's materials).
- Editing in the setup editor: click a layer and change its surface, its color (from the surface's own, filtered by words such as "blue"), roughness, metal, bumps, tiling, offset, opacity and microblend. Each change shows at once; Ctrl+Z and Ctrl+Y undo and redo. A new surface resets the layer's color and finish to that surface's defaults, and says so.
- **Save to Project**: saves a setup into your WolvenKit project (REDcode's open project, or one you pick). **As a new setup** writes it beside the original under a new name and copies the meshes that use it into the project, pointed at it: it shows in the game with no other mod. Or in place of the game's setup (needs the Material Texture Override mod), or at a path you choose. Then REDcode's Pack and Try is one click away. Ctrl+S on a game file, or on a file outside a project, opens Save to Project; a project's own file saves in place.
- MCP `mat_edit`: an assistant recolors a setup in words ("dark red", "glossy", "leather standard clean") and saves it into a project the same way, or only previews the result.

**Fixed**

- Find showed no looks for jackets and other outer wear, whose appearances also name first and third person. It now walks them (third person when both exist).
- A setup opened from a project, or one whose masks sit in another folder (such as the feminine punk jeans), showed no color map: "The color map needs the mask set". EDGEmat now takes the mask set the meshes' materials name, and only then looks beside the setup.
- Saving a game setup into a project a second time (As a new setup) found no mesh that uses it, because the project's meshes already pointed at the first save. They now count, and only the setup is written again. When no mesh is found, the message says why.
- The game folder: EDGEmat looked for REDdeck, EDGEdeck's old name, so it never used EDGEdeck's folder. It now asks EDGEdeck, and the `edgemat.gamePath` setting says so.

**Changed**

- The MCP server treats an empty option or environment variable as unset, as a Claude Code plugin passes an unset setting, so the VS Code settings behind it still apply.

**Other**

- The log names REDcode's bridge when EDGEmat uses it.
- The extension, the release and the Nexus zip carry the licenses of the open-source packages EDGEmat bundles (`THIRD-PARTY-NOTICES.txt`).
- A user manual on the EDGEmodders wiki: https://edgemodders.ai/wiki/edgemat/

## 0.1.0 (2026-10-16), M1 Library

Not released; built and tested from source.

**New**

- The EDGEmat activity bar container and its Library view: surfaces by category and microblends, with thumbnails from the game, searchable by plain words.
- The library is built from your own game through REDbridge (REDcode's bridge when REDcode runs the same game) and cached; rebuilt when the game's archives change.
- Settings: `edgemat.gamePath`, `edgemat.bridgePath`, `edgemat.dotnetRoot`; empty means REDcode's.
- MCP tools for assistants: `mat_library`, `mat_templates`, `mat_microblends`.
