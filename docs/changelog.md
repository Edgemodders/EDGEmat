# Change<span class="y">log</span>

What changed in each EDGEmat release, for modders. Each release takes its notes from its section here: the GitHub release (written by the release workflow), the Changelog tab of the extension in VS Code (written when the extension is packaged), and later the changelog on the Nexus Mods page (pasted by hand).

How to keep it (the same way as [REDnode's](https://edgemodders.github.io/REDnode/changelog.html)):

- With each change a modder would notice, add a line under **Unreleased**, in its group: **New**, **Changed**, **Fixed** or **Other**. One change per line. Leave out what only the tests see.
- Before a release, rename **Unreleased** to `## <version> (<date>)` and start a new empty **Unreleased** above it. The release workflow stops if the version has no section.
- Links are full URLs, since the same text goes to GitHub, VS Code and Nexus.
- `npm run release:notes` prints the GitHub notes of the extension's current version (or `-- <version>`); `npm run release:notes -- --nexus` prints plain lines for Nexus's changelog field, one per change. The steps of a release are in [Dev setup](https://edgemodders.github.io/EDGEmat/dev-setup.html#releasing).

## Unreleased

**New**

- `mat_from_model` (for assistants, and `materialsFromModel` in EDGEmat's API for EDGEfab): game materials from a textured 3D model. Give it a .glb (or texture files per material) and a project: each of the model's materials becomes game textures and a material, put on the mesh's material of the same name. Its color, roughness, metal and bump maps come along, and so does **glow**: parts that light up, by the model's glow map or all over, in a color and a strength. What the game's material cannot take (see-through parts, ambient occlusion) is named. Strength 1 is a soft glow for small lit details and 8 is white-hot, set per material.
- `mat_reshape` (for assistants, a first version): changes a clothing item's shape by words, a step at a time into your project. It draws the item from four sides, an image service changes the picture ("make the brim twice as wide"; OpenAI's GPT Image by default, your own key), and each change can build on the last or be taken back. Then Tripo makes a 3D model from it (your own Tripo key, about 60 credits), and it is fitted onto the garment and put in your project with Tripo's texture. Only garments that move with one bone (hats, helmets, glasses) can be fitted so far; others say so before anything is paid.
- `mat_restyle` takes `patterns`: a print such as "yellow with large black polka dots" or "woodland camo", made by your image service (Gemini or OpenAI, your own key) and put over the whole material, the garment's folds kept, as Wardrobe Designer does in the game.
- **The Desk**, a new view above Game Materials: the meshes and setups you are working on before they go into a project. It keeps them, and your edits, across restarts. Put a mesh on it with **Open in EDGEmat** in REDcode, or **Add to Desk** on a mesh in EDGEmat's Find view (the **+** beside it, or its right-click; so an item found by its in-game name, such as "comfy rocker", goes there in two clicks). Each line on it keeps its own edits: open a mesh again once you have edited it and it comes in fresh as **variation 2**, so you can try versions side by side; **Rename...** names one. A setup opened from the Desk saves on that line with Ctrl+S, and **View in 3D** on the line shows it; the game's own mesh keeps the game's look. The new-file icon (**Add to Project...**) on a line puts that one into a project, the **+** in the Desk's title bar all of them (asking which variation, when a mesh is there twice): each edited setup as a new setup with the mesh copied in and pointed at it. When your project already has its own copy of the mesh with other materials, it asks first: replace it with the Desk's, or keep it. **Add and Clear** takes off only what went in. An × takes one line off; **Clear the Desk** empties it. Assistants get `mat_desk`, and `mat_edit` can save on the Desk.
- **Which item to try it on:** a setup opened from a mesh on the Desk or in Find has an **In the game** section (folded; click to open): the game's items that wear that mesh look, each with its REDnode Console command (`addItem("Items....")`, typed in the game in REDnode's Console: F10 › the launcher › Console) and a **Copy** button, so you can give V the item once your project is installed. Hover a look on the Desk or in Find for the same list; right-click a look, a material or an item › **Copy REDnode Command**. The first time reads every clothing item, about ten seconds, once per game version. Assistants get it from `mat_find` with a mesh (`worn_by`, each item's `rednode` command).
- **Open Material in EDGEmat...** on a right-click: on a `.mlsetup`, `.mlsetup.json` or `.mltemplate` in the Explorer or on its editor tab, and on a `.mlsetup` in REDcode's Project view (with REDcode 0.10.3 or later). A setup opens in EDGEmat's setup editor, a surface on its page.
- **Open in EDGEmat** on a right-click on a `.mesh` in REDcode's Game Assets and Project views, in the Explorer and on its editor tab, and from REDcode's 3D view once REDcode adds its button: the mesh goes on the Desk with a look open, and each material opens its setup or offers **New Material Here**. A mesh in your project shows the project's copy. On a game `.mlsetup` in Game Assets it puts the setup on the Desk and opens it; on a `.mltemplate`, its surface page. Until REDcode marks file kinds in Game Assets, the entry shows on every game file there except textures, and says what it takes.

- **`mat_restyle`**, for assistants: restyle a clothing item in one call, as Wardrobe Designer does in the game. Name the item (`Items.Q001_Pants`, or "V's Pants") and it returns its look: the meshes, and each layered material's layers in plain words. Give it the layer changes in words ("red", "denim", "glossy") and a project, and it saves each changed setup under a new name with the item's meshes copied in and pointed at it; a change that cannot be made is skipped and named. Run it again and it starts from the restyled copy. Pack and install the project to see it in the game.

**Changed**

- The Desk's **Add to Project** into a project that is not open in REDcode opens that project afterwards (the window reloads, or a new window opens when this one has a folder open), brings REDcode's Project view forward and says where the mesh went, with **Pack and Try**. Before, the files went in out of sight.
- **Set Image Service Key...** checks a key looks right before saving it (an OpenAI key starts with `sk-`), and **Clear Image Service Key...** asks first. Keys stay in VS Code's secret storage, as in 0.3; a key you set in a development build since 2026-10-30, which went to the EDGE tools' shared key store, is asked for once more.
- The **Library** view is now **Game Materials**, with **Search Game Materials** and **Rebuild Game Materials**, because **Library** now means the EDGE Library, the folder of your own work that the EDGE tools share. It holds the same list as before, and assistants still call `mat_library`.
- Inside REDnode, EDGEmat's tools for in-game assistants use REDnode's own REDbridge instead of starting a second one, so less memory goes to it while you play (once REDnode passes it on; REDnode #40). Elsewhere (Claude Code, VS Code) nothing changes.
- Assistants' words go further in `mat_edit` and `mat_restyle`: colors such as "medium blue", "deep red" or "neon green" are read; a finish the surface has no preset named for ("glossy" on denim) takes the closest one it has, and the notes say which; and a material word that fits several surfaces ("denim", "leather") takes the game's plain version (`denim_clean_01_30`) instead of failing.
- Colors in the setup editor and in REDcode's 3D view come closer to the game: a layer's microblend now cuts its mask, as in the game, so a layer painted to show only through its microblend (such as lint or dirt specks) no longer tints the whole garment. On the Comfy rocker slim-fits' leather look, a dark denim layer had turned the whole pair maroon; now the leather's own color shows, with solid black piping. A layer's share of the texture in the setup editor follows. Still flat colors: no grain, shine or game lighting yet.
- The Desk opens a mesh on the look the most items in the game wear (the slim-fits open on **leather**, not **default**), and marks each look **worn by 1 item**, or **no item** for a look only NPCs wear, so an edit goes on a look you can give V. The look you found it under in Find still opens first.
- REDcode's 3D view draws the materials again after you save a setup or put a new material on a mesh, so the change shows without reopening it.
- A live preview in REDcode's 3D view: while a setup is open in EDGEmat's setup editor, the 3D view shows it as edited, before you save, and follows each edit, undo and redo. Close the editor without saving and the 3D view goes back to the saved setup. It shows on meshes from the same place as the setup: opened from the Desk, on the Desk's meshes; a project's file, on that project's; a game file, on the game's.
- **View in 3D** on a mesh in your project opens the project's copy.
- Hovering a microblend in **Game Materials** shows its picture, name and game path, as a surface does; before, only its path.

**Fixed**

- **Clear the Desk...** could stop with an error (ENOTEMPTY, "Directory not empty") when Windows still held one of the Desk's files, such as a setup or 3D view still open, and leave the Desk half cleared. The Desk now empties first and retries the files; any Windows still holds are deleted when EDGEmat next starts, and a note says so. The same for taking a line off and Add and Clear.
- **Connect an Assistant (MCP)...** › **Copy the Claude Code command** left out your image service key's `-e`, though its message said to put your key in place of `<key>`. The copied line now has `-e OPENAI_API_KEY=<key>` (or Gemini's) for each key you set, never the key itself.
- A material of a mesh in your project opened the game's setup even when your project held its own copy, such as one saved with Save to Project. It now opens your project's copy.
- The setup editor lost its unsaved edits from view when you switched to another tab and back (the edits were kept, and the tab still showed them as unsaved).
- **Save to Project** › **As a new setup** looked for the meshes that use the setup only in the setup's own folder. A garment that uses a setup kept with another garment (V's slim-fits use the citizen jeans' setup) had the other garment's game meshes copied into the project instead of its own. It now looks at every mesh in your project too, and ticks only your project's meshes when any of them use the setup. The MCP server's `mat_edit` does the same.
- **New Material** blended the edges of every picture so it would tile, which showed faded copies of sharp shapes near the edges (ghost dots on a polka-dot print). A picture that already tiles, as the image services are asked to make, is now used as it is, and one that tiles only one way is blended only the other way. The seamless preview shows the same.
- When Google Gemini sent no image because its answer came too close to a picture it knows (`IMAGE_RECITATION`), Generate stopped. It now asks once more with slightly changed words before saying why.
- With Google Gemini, Generate's first choice of model was always the "Lite" one, because the check for small models also matched the "mini" in "Gemini". It now picks the newest full model the key can use (Nano Banana 2 today), which follows the words better and costs a little more; the model list still offers the others.

**Other**

- EDGEmat's core is on npm as `@edgemodders/edgemat-core`, for other tools: EDGEfab uses it to give a new item its materials from a model. The same version as EDGEmat. Modders don't need it.

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
