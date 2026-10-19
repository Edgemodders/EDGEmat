# EDGEmat

The EDGE material editor for Cyberpunk 2077. Part of the EDGE modding platform by [EDGEmodders](https://github.com/Edgemodders).

**Version 0.2 (M2, Read): a preview that reads materials, and does not edit them yet.** EDGEmat adds its own place in the activity bar:

| Part | What it does |
|---|---|
| **Library** | Every surface (multilayered material template) in your game with its colors, and every microblend, each with a thumbnail, searchable by plain words such as *leather*, *denim* or *dirt*. Built from your own game on first use, in well under a minute, and rebuilt after a game update. Nothing from the game ships with EDGEmat |
| **Surface page** | Click a surface: a larger image tinted with the color you pick, every color as a swatch with a plain name ("dark muted blue"), the closest color to one you type or pick, and roughness, metal and bumps in plain words |
| **Setup editor** | Open any `.mlsetup` from the game, a file, a project, a mod archive, or REDcode's Game Assets: each layer in plain words, a map of where each layer goes on the garment, and warnings for what looks wrong. **Open Setup** is in the Library's title bar |
| **Find** | Type a garment's in-game name ("punk jeans") or part of a mesh path: its looks per body, its meshes and materials. Click a layered material to open its setup with the right masks |

Next: recoloring (M3), then making new materials, from a model's textures or from words through an AI image service you choose (M4).

### For AI assistants

The same features are in EDGEmat's MCP server, so Claude or another assistant can find a garment's materials, describe its layers and pick colors. Each GitHub release carries the server as one file, `edgemat-mcp-<version>.cjs`. It needs Node.js 20 or later, and finds the game and REDbridge as the extension does. For Claude Code, with the file's full path:

```
claude mcp add edgemat -- node "<folder>\edgemat-mcp-<version>.cjs"
```

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
