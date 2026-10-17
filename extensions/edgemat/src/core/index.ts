// EDGEmat's core: everything that is not UI. No VS Code imports, so the MCP server and the smoke test
// bundle it as they are.

export { BridgeClient, type BridgeOptions } from "./bridgeClient";
export { findGames, isGameFolder } from "./gameFinder";
export { defaultCacheDir, resolveBridge, resolveGame, vscodeUserSettings, type BridgeChoice, type GameChoice, type OtherTools, type SettingsReader } from "./config";
export {
  buildLibrary, byCategory, gameKey, isCurrent, jsonValue, libraryFile, loadLibrary, searchMicroblends, searchTemplates, thumbnailFile,
  LibraryVersion, PresetKinds, type Library, type Microblend, type Progress, type Template,
} from "./library";
export { colorDistance, fromLab, isBright, parseColor, plainColorName, swatchHex, toLab, toLch, type Lab, type Rgb } from "./colors";
export {
  describeSurface, findSurface, flatTextureValue, nearestColors, plainBumps, plainContrast, plainMetal, plainRoughness,
  type ColorInfo, type PresetInfo, type SurfaceInfo, type TextureInfo,
} from "./surface";
export { imageFile, textureImage } from "./images";
export { describeSetup, parseSetup, type LayerInfo, type Setup, type SetupInfo, type SetupLayer } from "./setup";
export { compositeSetup, loadMaskSet, maskSetsBeside, rankMaskSets, MaskSize, PickSize, type Composite, type MaskSet, type MaskSource } from "./masks";
export { gamePathInProject, openSetup, readSetup, type OpenedSetup, type SetupSource } from "./openSetup";
