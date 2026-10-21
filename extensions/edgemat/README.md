# EDGEmat

The EDGE material editor for Cyberpunk 2077. Part of the EDGE modding platform by [EDGEmodders](https://github.com/Edgemodders).

**Version 0.3, a preview: read, recolor and make materials, and save them into your mod project.** Each was tested in the game. EDGEmat adds its own place in the activity bar:

| Part | What it does |
|---|---|
| **Library** | Every surface (multilayered material template) in your game with its colors, and every microblend, each with a thumbnail, searchable by plain words such as *leather*, *denim* or *dirt*. Built from your own game on first use, in well under a minute, and rebuilt after a game update. Nothing from the game ships with EDGEmat |
| **Surface page** | Click a surface: a larger image tinted with the color you pick, every color as a swatch with a plain name ("dark muted blue"), the closest color to one you type or pick, and roughness, metal and bumps in plain words |
| **Setup editor** | Open any `.mlsetup` from the game, a file, a project, a mod archive, or REDcode's Game Assets: each layer in plain words, a map of where each layer goes on the garment, and warnings for what looks wrong. Click a layer to change its surface, color, finish, tiling, opacity and microblend, with undo. **Open Setup** is in the Library's title bar |
| **Save to Project** | Saves a setup into your WolvenKit project (REDcode's open one): as a new setup, with the garment's meshes for both bodies pointed at it, so it shows in the game with no other mod. Then REDcode's Pack and Try |
| **New Material** | A material from words, through Google Gemini or OpenAI with your own key, or from a photo of your own: made seamless, with bumps and shine, and put on a garment, which keeps its own folds. The sparkle in the Library's title bar, or on a material in Find. Nothing is sent until you press Generate |
| **Find** | Type a garment's in-game name ("punk jeans") or part of a mesh path: its record id, its looks per body, its meshes and materials. Click a layered material to open its setup with the right masks |
| **View in 3D** | The eye on a mesh opens it in [REDcode](https://github.com/Edgemodders/REDcode)'s 3D view, with its colors from EDGEmat. Colors only for now: bumps and shine come later |

Next: materials for brand-new clothes and objects (M4). The manual, with two tutorials: [edgemodders.ai/wiki/edgemat](https://edgemodders.ai/wiki/edgemat/).

### For AI assistants

The same features are in EDGEmat's MCP server, which comes with the extension, so Claude or another assistant can find a garment's materials, describe and recolor its layers, and make new materials, saving into your project.

| Assistant | How |
|---|---|
| Claude Code | **EDGEmat: Connect an Assistant (MCP)...** (the Library's **...** menu, or the command palette) registers it, with your image service key if you want materials from words. Then start a new Claude Code session |
| Agents inside VS Code 1.101 or later | Nothing to do: they see EDGEmat's tools |
| Other MCP clients | The same command copies a JSON entry. Without VS Code: `@edgemodders/edgemat-mcp` on npm |

The server finds the game and REDbridge as the extension does, and shares its material library.

## Setup

EDGEmat runs on Windows and reads the game through REDbridge 0.8.0 or later, the engine [REDcode](https://github.com/Edgemodders/REDcode) uses. With REDcode set up, EDGEmat needs no configuration: it uses REDcode's game folder and bridge. Otherwise set:

| Setting | What |
|---|---|
| `edgemat.gamePath` | The Cyberpunk 2077 folder |
| `edgemat.bridgePath` | REDbridge.exe, or its folder |
| `edgemat.dotnetRoot` | DOTNET_ROOT, when .NET 10 is installed per user |

## Links

[Docs](https://edgemodders.github.io/EDGEmat/) · [Design](https://edgemodders.github.io/EDGEmat/design.html) · [Source](https://github.com/Edgemodders/EDGEmat)

EDGEmat is MIT. It talks to REDbridge (GPL-3.0) only as a separate process. Single-player modding only. Not affiliated with CD Projekt RED.
