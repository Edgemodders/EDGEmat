# EDGEmat

The EDGE material editor for Cyberpunk 2077. Part of the EDGE modding platform by [EDGEmodders](https://github.com/Edgemodders).

**Version 0.1 (M1, Library).** EDGEmat adds its own place in the activity bar with a **Library**: every surface (multilayered material template) in your game with its colors, and every microblend, each with a thumbnail, searchable by plain words such as *leather*, *denim* or *dirt*. The library is built from your own game on first use, in well under a minute, and rebuilt after a game update. Nothing from the game ships with EDGEmat.

Recoloring garments comes in the next versions: reading a garment's layers (M2) and editing them (M3).

## Setup

EDGEmat reads the game through REDbridge, the engine [REDcode](https://github.com/Edgemodders/REDcode) uses. With REDcode set up, EDGEmat needs no configuration: it uses REDcode's game folder and bridge. Otherwise set:

| Setting | What |
|---|---|
| `edgemat.gamePath` | The Cyberpunk 2077 folder |
| `edgemat.bridgePath` | REDbridge.exe, or its folder |
| `edgemat.dotnetRoot` | DOTNET_ROOT, when .NET 10 is installed per user |

## Links

[Docs](https://edgemodders.github.io/EDGEmat/) · [Design](https://edgemodders.github.io/EDGEmat/design.html) · [Source](https://github.com/Edgemodders/EDGEmat)

EDGEmat is MIT. It talks to REDbridge (GPL-3.0) only as a separate process. Single-player modding only. Not affiliated with CD Projekt RED.
