// Larger images of game textures, made on demand for the surface page and cached beside the library:
// REDbridge decodes the texture to PNG, writeThumbnail scales it. Nothing here ships with EDGEmat.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { BridgeClient } from "./bridgeClient";
import { writeThumbnail, type ThumbnailContrast, type ThumbnailSource } from "./thumbnail";

const ImagesFolder = "images";

export function imageFile(dir: string, name: string): string {
  return path.join(dir, ImagesFolder, name);
}

/**
 * An image of a game texture, `size` pixels square, in the cache's images folder. Returns its file
 * name, or undefined when the texture is flat (one tone, nothing to show). Cached, flat results too.
 */
export async function textureImage(bridge: BridgeClient, dir: string, texture: string, size: number, source: ThumbnailSource, contrast: ThumbnailContrast = "full"): Promise<string | undefined> {
  const name = crypto.createHash("sha1").update(`${source}:${size}:${contrast}:${texture}`).digest("hex").slice(0, 20) + ".png";
  const out = imageFile(dir, name);
  if (fs.existsSync(out)) return name;
  if (fs.existsSync(out + ".flat")) return undefined;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const png = path.join(path.dirname(out), `tmp-${process.pid}-${name}`);
  try {
    await bridge.toPng(texture, png);
    if (writeThumbnail(png, out, size, source, contrast)) return name;
    fs.writeFileSync(out + ".flat", "");
    return undefined;
  } finally {
    fs.rmSync(png, { force: true });
  }
}
