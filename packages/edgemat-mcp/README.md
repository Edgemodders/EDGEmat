# @edgemodders/edgemat-mcp

EDGEmat for AI assistants, over MCP. [EDGEmat](https://github.com/Edgemodders/EDGEmat) is the EDGE material editor for Cyberpunk 2077. This server lets Claude Code, or any other MCP client, do what EDGEmat's buttons do: find a garment's materials by its in-game name, describe its layers in plain words, recolor them, and make new materials from words or an image, saving into your WolvenKit project.

**Have the EDGEmat extension?** You don't need this package. The extension carries the same server: run **EDGEmat: Connect an Assistant (MCP)...** in VS Code. This package is for clients that run without VS Code, such as EDGEchat or REDagent.

## Use

```powershell
claude mcp add --scope user edgemat -- cmd /c npx -y @edgemodders/edgemat-mcp
```

On Windows, Claude Code runs `npx` through `cmd /c`. Other clients: the command is `npx`, the arguments `-y @edgemodders/edgemat-mcp`.

To make materials from words (`mat_generate`), it uses your own image service key from the EDGE tools' shared key store on your PC (`%APPDATA%\Edgemodders\keys`, encrypted for your Windows account): set it once with the EDGEmat extension's **Set Image Service Key...**, or with any EDGE tool that asks for it. Or add `-e GEMINI_API_KEY=<key>` or `-e OPENAI_API_KEY=<key>` before `--`, which wins over the store.

## What it needs

| Need | Notes |
|---|---|
| Windows, Node.js 20 or later | |
| Cyberpunk 2077 | `--game` or `EDGEMAT_GAME_PATH`; else found as the extension finds it, from VS Code's `edgemat.gamePath` or `redcode.gamePath` setting |
| REDbridge 0.8.0 or later | `--bridge` or `REDBRIDGE_EXE` (the exe or its folder); else from `edgemat.bridgePath` or `redcode.bridgePath`. [REDcode](https://github.com/Edgemodders/REDcode)'s Install REDbridge sets it up |

An option or variable you pass wins over VS Code's settings; an empty one counts as unset. So a client with its own settings form, such as EDGEchat, passes the four variables and needs nothing else:

| Variable | For |
|---|---|
| `EDGEMAT_GAME_PATH` | The Cyberpunk 2077 folder |
| `REDBRIDGE_EXE` | REDbridge |
| `GEMINI_API_KEY`, `OPENAI_API_KEY` | `mat_generate` only; else the shared key store |

The material library is built from your own game the first time, and kept in `%LOCALAPPDATA%\EDGEmat` (`--cache` or `EDGEMAT_CACHE` to move it), shared with the extension.

## Tools

| Tool | Does |
|---|---|
| `mat_library` | Whether the library is built and current; builds it |
| `mat_templates`, `mat_microblends` | Search the game's surfaces and detail textures |
| `mat_colors` | A surface's colors in plain words, and the closest to one you name |
| `mat_find` | A garment or mesh, down to its looks per body, meshes and materials; for a mesh, the items that wear each look, with the CET command that gives V one |
| `mat_describe` | A setup's layers in plain words |
| `mat_edit` | Recolor a setup's layers in words, and save it into a project |
| `mat_generate` | A material from words, through Google Gemini or OpenAI with your key |
| `mat_from_image` | A material from an image file, no key |
| `mat_apply` | Put a material on a garment's mesh materials |
| `mat_desk` | EDGEmat's Desk: meshes and edited setups kept outside a project until you add them to one; each entry has its own edits, so one mesh can be there as variations |

It sends no telemetry. Its only network calls are `mat_generate`'s, to the image service whose key you gave it.

Docs: the [EDGEmat manual](https://edgemodders.ai/wiki/edgemat/assistants.html). MIT. Not affiliated with CD PROJEKT RED.
