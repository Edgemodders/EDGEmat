# @edgemodders/edgemat-core

EDGEmat's core as a library. [EDGEmat](https://github.com/Edgemodders/EDGEmat) is the EDGE material editor for Cyberpunk 2077. This package is everything in it that is not UI: reading, editing and making materials (`.mlsetup`, `.mi`, `.xbm`) from your own game, through REDbridge. Other EDGE tools use it in their own extensions and MCP servers, as EDGEfab does for `materialsFromModel`.

**Making a mod?** You want the [EDGEmat extension](https://marketplace.visualstudio.com/items?itemName=edgemodders.edgemat) or the [MCP server](https://www.npmjs.com/package/@edgemodders/edgemat-mcp), not this.

## Use

```ts
import { bridgeOver, materialsFromModel, type BridgeCall } from "@edgemodders/edgemat-core";

// Your own REDbridge (or REDnode's shared one), so EDGEmat starts no second one.
const call: BridgeCall = (method, params) => myBridge.call(method, params);
const result = await materialsFromModel(bridgeOver(call), request);
```

Or `BridgeClient` with `resolveBridge` and `resolveGame` to start a REDbridge of its own. The exports are those of [`core/index.ts`](https://github.com/Edgemodders/EDGEmat/blob/main/extensions/edgemat/src/core/index.ts), with their types.

| Facts | |
|---|---|
| Format | One CommonJS file with types; `import` works too (Node 20 or later) |
| Version | The same as EDGEmat's, released with it |
| Dependencies | `pngjs`, `vscode-jsonrpc`; no VS Code |
| Needs | Windows, the game, and REDbridge (from REDcode, or REDnode's) for anything that reads game files |
| Network | None, except the image and model services (`generateImage`, `Tripo`) when called, with the key passed in or `GEMINI_API_KEY`, `OPENAI_API_KEY`, `TRIPO_API_KEY` |

## Versions

Pin a range such as `~0.3.2`. Before 1.0, a change to an export's request or result raises at least the middle number and is named in [EDGEmat's changelog](https://edgemodders.github.io/EDGEmat/changelog.html). `materialsFromModel`, `bridgeOver` and `BridgeCall` are the ones other tools rely on: they change only that way.

## License

MIT. The source is in [EDGEmat's repository](https://github.com/Edgemodders/EDGEmat), `extensions/edgemat/src/core`.
