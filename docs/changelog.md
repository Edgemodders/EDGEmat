# Change<span class="y">log</span>

What changed in each EDGEmat release, for modders. Each release takes its notes from its section here: the GitHub release (written by the release workflow), the Changelog tab of the extension in VS Code (written when the extension is packaged), and later the changelog on the Nexus Mods page (pasted by hand).

How to keep it (the same way as [REDnode's](https://edgemodders.github.io/REDnode/changelog.html)):

- With each change a modder would notice, add a line under **Unreleased**, in its group: **New**, **Changed**, **Fixed** or **Other**. One change per line. Leave out what only the tests see.
- Before a release, rename **Unreleased** to `## <version> (<date>)` and start a new empty **Unreleased** above it. The release workflow stops if the version has no section.
- Links are full URLs, since the same text goes to GitHub, VS Code and Nexus.
- `npm run release:notes` prints the GitHub notes of the extension's current version (or `-- <version>`); `npm run release:notes -- --nexus` prints plain lines for Nexus's changelog field, one per change. The steps of a release are in [Dev setup](https://edgemodders.github.io/EDGEmat/dev-setup.html#releasing).

## Unreleased

**New**

- **The Desk**, a new view above the Library: the meshes and setups you are working on before they go into a project. It keeps them, and your edits, across restarts. A setup opened from the Desk saves on the Desk with Ctrl+S, and REDcode's 3D view shows it. The **+** in the Desk's title bar puts everything on it into a project after you confirm: each edited setup as a new setup, with the Desk's meshes that use it copied in and pointed at it, and the other meshes as they are. An × takes one thing off; **Clear the Desk** empties it. Assistants get `mat_desk`, and `mat_edit` can save on the Desk.
- **Open Material in EDGEmat...** on a right-click: on a `.mlsetup`, `.mlsetup.json` or `.mltemplate` in the Explorer or on its editor tab, and on a `.mlsetup` in REDcode's Project view (with REDcode 0.10.3 or later). A setup opens in EDGEmat's setup editor, a surface on its page.
- **Open in EDGEmat** on a right-click on a `.mesh` in REDcode's Game Assets and Project views, in the Explorer and on its editor tab, and from REDcode's 3D view once REDcode adds its button: the mesh goes on the Desk with a look open, and each material opens its setup or offers **New Material Here**. A mesh in your project shows the project's copy. On a game `.mlsetup` in Game Assets it puts the setup on the Desk and opens it; on a `.mltemplate`, its surface page. Until REDcode marks file kinds in Game Assets, the entry shows on every game file there except textures, and says what it takes.

**Changed**

- REDcode's 3D view draws the materials again after you save a setup or put a new material on a mesh, so the change shows without reopening it.
- A live preview in REDcode's 3D view: while a setup is open in EDGEmat's setup editor, the 3D view shows it as edited, before you save, and follows each edit, undo and redo. Close the editor without saving and the 3D view goes back to the saved setup.
- **View in 3D** on a mesh in your project opens the project's copy.

**Fixed**

- A material of a mesh in your project opened the game's setup even when your project held its own copy, such as one saved with Save to Project. It now opens your project's copy.
- The setup editor lost its unsaved edits from view when you switched to another tab and back (the edits were kept, and the tab still showed them as unsaved).
- **Save to Project** › **As a new setup** looked for the meshes that use the setup only in the setup's own folder. A garment that uses a setup kept with another garment (V's slim-fits use the citizen jeans' setup) had the other garment's game meshes copied into the project instead of its own. It now looks at every mesh in your project too, and ticks only your project's meshes when any of them use the setup. The MCP server's `mat_edit` does the same.

## 0.3.1 (2026-10-21)

EDGEmat's MCP server now comes with the extension, so an assistant needs no separate download.

**New**

- **Connect an Assistant (MCP)...** in the Library's **...** menu: registers EDGEmat with Claude Code in one step, with your image service key if you say so, or copies the command or a JSON entry for other clients. The server lives at `%LOCALAPPDATA%\EDGEmat\mcp\edgemat-mcp.cjs`, the same path for every version, and each update of the extension refreshes it, so the registration keeps working.
- In VS Code 1.101 or later, agents inside VS Code see EDGEmat's tools with no setup, with your image service keys from EDGEmat. Where the editor has no MCP support, nothing changes.
- The MCP server on npm, for clients that run without VS Code: `@edgemodders/edgemat-mcp` (https://www.npmjs.com/package/@edgemodders/edgemat-mcp).

## 0.3.0 (2026-10-20)

The first preview: EDGEmat reads a garment's materials, shows them in plain words and in 3D, recolors them into your mod project, and makes new materials from words or a photo, in the editor or by asking an assistant.

**New**

- The surface page: click a surface or microblend in the Library to open it in an editor tab. One tab is reused as you click around; **Keep Open** detaches it. A larger image tinted with the color you pick; every color as a swatch with a plain name ("dark muted blue"); a filter by words, and the closest color to one you type or pick; roughness, metal and bumps in plain words; the textures; raw values one click away.
- The setup editor, read-only: open any `.mlsetup` or `.mlsetup.json` (from the game, a file, a project, a mod archive, or REDcode's Game Assets) and see each layer in plain words, a color map of where each layer goes on the garment, and what looks wrong. **Open Setup** in the Library's title bar finds a game setup by name, or takes a file or a mod archive.
- The Find view: a garment by its in-game name ("punk jeans") or a mesh by part of its path, down to its looks per body, meshes and materials. A layered material opens its setup with the exact mask set it names.
- **View in 3D**: the eye on a mesh in Find opens it in [REDcode](https://github.com/Edgemodders/REDcode)'s 3D view, with its colors from EDGEmat: a layered material's color map, or a textured material's own color texture. Colors only for now, marked approximate. Needs REDcode.
- MCP tools for assistants: `mat_colors` (a surface's colors, and the closest to a color you name), `mat_describe` (a setup's layers in plain words) and `mat_find` (a garment's or mesh's materials).
- Editing in the setup editor: click a layer and change its surface, its color (from the surface's own, filtered by words such as "blue"), roughness, metal, bumps, tiling, offset, opacity and microblend. Each change shows at once; Ctrl+Z and Ctrl+Y undo and redo. A new surface resets the layer's color and finish to that surface's defaults, and says so.
- **Save to Project**: saves a setup into your WolvenKit project (REDcode's open project, or one you pick). **As a new setup** writes it beside the original under a new name and copies the meshes that use it into the project, pointed at it: it shows in the game with no other mod. Or in place of the game's setup (needs the Material Texture Override mod), or at a path you choose. Then REDcode's Pack and Try is one click away. Ctrl+S on a game file, or on a file outside a project, opens Save to Project; a project's own file saves in place.
- MCP `mat_edit`: an assistant recolors a setup in words ("dark red", "glossy", "leather standard clean") and saves it into a project the same way, or only previews the result.
- **New Material**: a new material from words, through Google Gemini (Nano Banana) or OpenAI (GPT Image) with your own key and credits, or from your own photo with no service. Each Generate adds a take, shown tiled 3 × 3 so seams show; the one you pick is made seamless, gets bumps and shine from its light and dark, and is written into your project as textures and a material. Open it from the Library's title bar, or from a material in Find (**New Material Here**) to put it on that material for both bodies; on a garment the garment keeps its own folds. Your key stays in VS Code's secret storage, and nothing is sent until you press Generate. How each material was made (service, model, words) is kept beside it.
- MCP `mat_generate`, `mat_from_image` and `mat_apply`: an assistant makes a material from words (with a key in the server's environment) or from an image file, and puts it on a garment's materials.

**Fixed**

- Find showed no looks for jackets and other outer wear, whose appearances also name first and third person. It now walks them (third person when both exist).
- A setup opened from a project, or one whose masks sit in another folder (such as the feminine punk jeans), showed no color map: "The color map needs the mask set". EDGEmat now takes the mask set the meshes' materials name, and only then looks beside the setup.
- Saving a game setup into a project a second time (As a new setup) found no mesh that uses it, because the project's meshes already pointed at the first save. They now count, and only the setup is written again. When no mesh is found, the message says why.
- The game folder: EDGEmat looked for REDdeck, EDGEdeck's old name, so it never used EDGEdeck's folder. It now asks EDGEdeck, and the `edgemat.gamePath` setting says so.

**Changed**

- Open Setup › From the game finds setups as you type, in place of a box that searched only after Enter.
- The MCP server treats an empty option or environment variable as unset, as a Claude Code plugin passes an unset setting, so the VS Code settings behind it still apply.

**Other**

- The log names REDcode's bridge when EDGEmat uses it.
- The extension, the release and the Nexus zip carry the licenses of the open-source packages EDGEmat bundles (`THIRD-PARTY-NOTICES.txt`).
- On the VS Code Marketplace and Open VSX: search for EDGEmat in VS Code's Extensions view. The MCP server is a file on the GitHub release.
- A user manual on the EDGEmodders wiki, with two tutorials (worn leather pants from words, snakeskin pants by asking Claude): https://edgemodders.ai/wiki/edgemat/

## 0.1.0 (2026-10-16), M1 Library

Not released; built and tested from source.

**New**

- The EDGEmat activity bar container and its Library view: surfaces by category and microblends, with thumbnails from the game, searchable by plain words.
- The library is built from your own game through REDbridge (REDcode's bridge when REDcode runs the same game) and cached; rebuilt when the game's archives change.
- Settings: `edgemat.gamePath`, `edgemat.bridgePath`, `edgemat.dotnetRoot`; empty means REDcode's.
- MCP tools for assistants: `mat_library`, `mat_templates`, `mat_microblends`.
