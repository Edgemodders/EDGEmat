// EDGEmat's core: everything that is not UI. No VS Code imports, so the MCP server and the smoke test
// bundle it as they are.

export { BridgeClient, type BridgeOptions } from "./bridgeClient";
export { findGames, isGameFolder } from "./gameFinder";
export { defaultCacheDir, resolveBridge, resolveGame, vscodeUserSettings, type BridgeChoice, type GameChoice, type OtherTools, type SettingsReader } from "./config";
export {
  buildLibrary, byCategory, gameKey, isCurrent, jsonValue, libraryFile, loadLibrary, searchMicroblends, searchTemplates, templatesFrom, thumbnailFile,
  LibraryVersion, PresetKinds, type Library, type Microblend, type Progress, type Template,
} from "./library";
export { colorDistance, fromLab, isBright, parseColor, plainColorName, swatchHex, toLab, toLch, type Lab, type Rgb } from "./colors";
export {
  describeSurface, findSurface, flatTextureValue, nearestColors, plainBumps, plainContrast, plainMetal, plainRoughness,
  type ColorInfo, type PresetInfo, type SurfaceInfo, type TextureInfo,
} from "./surface";
export { imageFile, textureImage, wholeTexture } from "./images";
export { describeSetup, layerDefault, parseSetup, LayerFields, PathFields, type LayerInfo, type Setup, type SetupInfo, type SetupLayer } from "./setup";
export {
  applyLayerEdit, patchFromWords, presetNames, sameSetup, setupToJson, templateOf, DefaultMicroblend, PresetWhat, type EditResult, type LayerPatch, type LayerWords,
} from "./edit";
export { isGameFile, meshesToPoint, meshesUsing, meshUses, newPathFor, projectArchive, projectAt, saveToProject, suffixFor, type MeshSearch, type MeshUse, type Project, type SaveRequest, type SaveResult } from "./project";
export { compositeSetup, coverage, loadMaskSet, maskSetsBeside, rankMaskSets, MaskSize, PickSize, type Composite, type MaskSet, type MaskSource } from "./masks";
export { loadMicroblends, readMicroblend, type MicroblendMask } from "./microblend";
export { bakeColor, BakeSize, loadSurfaceTextures } from "./bake";
export { gamePathInProject, openSetup, readSetup, withSetup, type OpenedSetup, type SetupSource } from "./openSetup";
export { addToInventory, isFilePath, itemMaterials, itemsWearing, loadItems, meshMaterials, namedMaterials, searchItems, type ItemEntry, type ItemLook, type ItemMaterials, type MaterialUse, type MeshLook, type WornBy } from "./find";
export { Desk, deskLabel, deskProjectName, type DeskConflict, type DeskEntry, type DeskResult } from "./desk";
export { renderMaterials, type RenderedMaterial, type RenderRequest } from "./render";
export { blendNormals, makeSeamless, normalMap, readPng, repeat, resize, roughnessMap, seamScore, squareCrop, tilesAlready, tiling, writePng, type Image } from "./maps";
export { editImage, errorText, generateImage, generateTexture, listModels, texturePrompt, ImageServiceError, Services, type CallOptions, type DetailSize, type GeneratedImage, type ImageModel, type ImageSize, type ImageUsage, type Quality, type ServiceId, type ServiceInfo } from "./imageServices";
export { imageAsPng, makeMaterial, materialSlug, type MadeBy, type MaterialResult, type MaterialTarget, type NewMaterial, type Shine } from "./material";
export { applyMaterial, texturedMaterialJson, uvTestPattern, writeTexture, writeTexturedMaterial, MetalBase, TextureTemplates, WhiteTexture, type TexturedMaterial, type TextureKind } from "./apply";
export { glowDim, glowEV, materialsFromModel, GlowEV, type FromModelMaterial, type FromModelRequest, type FromModelResult, type ModelGlow, type ModelMaterialFiles, type TextureSlot } from "./fromModel";
export { checkKey, envKey, KeyEnv, type KeyService } from "./keys";
export { installedRedcodeDirs, KeyCaller, KeysBridge, keysBridgeExe, KeysTooOld, McpKeyCaller, type KeyInfo, type KeyRead } from "./keyStore";
export { bridgeOver, type BridgeCall } from "./kernelBridge";
export { accessor, bbox, imageOf, primitives, readGlb, worldMatrices, writeGlb, type Box, type Glb, type GlbPart } from "./glb";
export { Tripo, type TripoTask } from "./tripo";
export {
  axis, loadReshape, reshapeAddPicture, reshapeBack, reshapeChange, reshapeFit, reshapeModel, reshapePrompt, reshapeViews, ReshapeDefaults,
  type ReshapeChange, type ReshapeFit, type ReshapeMesh, type ReshapeModel, type ReshapeViews, type ViewName,
} from "./reshape";
export {
  AnyMask, backToGame, backToModel, deskPartFolder, dropPartFiles, gameMaterials, layeredMaterialJson, materialOf, loadGameMaterials, materialFit, partFolder, partsOf, propRecord, searchGameMaterials, useGameMaterial, useSurface, SurfaceRepeat,
  type GameMaterial, type GameMaterialList, type MaterialFit, type Part, type PartResult, type PartWear, type PropRecord, type SurfaceChoice,
} from "./parts";
export { applyPatterns, applyRecipe, describeLook, RestyleBrief, type Look, type LookLayer, type LookMaterial, type PatternImage, type PatternPlan, type PatternResult, type Recipe, type RestyleResult } from "./restyle";
