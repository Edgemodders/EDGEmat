// Small square thumbnails from the PNGs REDbridge decodes. Pure JavaScript (pngjs), no native image
// library. Template diffuse maps are mostly near-grey detail (behavior spec, section 3), so the levels
// are stretched to show the surface; microblends keep their mask in alpha, so that is what is shown.

import * as fs from "node:fs";
import { PNG } from "pngjs";

/** color: the image; alpha: its alpha channel (microblends); relief: a normal map's X channel, as shading. */
export type ThumbnailSource = "color" | "alpha" | "relief";

/**
 * full: the levels stretched to black and white, to show detail at icon size. soft: stretched onto
 * light greys, for larger images and for tinting, so a near-white detail map stays light. none: the
 * values as they are, greyscale from the red channel (masks); a flat image is written too.
 */
export type ThumbnailContrast = "full" | "soft" | "none";

/**
 * Reads a PNG, crops it to a centred square, scales it to `size` (a box filter down, bilinear up) and
 * writes it. Returns false, and writes nothing, when the image is flat: one tone with no detail to show.
 */
export function writeThumbnail(srcFile: string, outFile: string, size = 96, source: ThumbnailSource = "color", contrast: ThumbnailContrast = "full"): boolean {
  const src = PNG.sync.read(fs.readFileSync(srcFile));
  const side = Math.min(src.width, src.height);
  const x0 = Math.floor((src.width - side) / 2);
  const y0 = Math.floor((src.height - side) / 2);
  const out = new PNG({ width: size, height: size });
  const step = side / size;

  // Alpha only when it carries something: a microblend whose alpha is flat shows its colour instead.
  let useAlpha = source === "alpha";
  if (useAlpha) {
    let lo = 255, hi = 0;
    for (let i = 3; i < src.data.length; i += 4 * 97) { lo = Math.min(lo, src.data[i]); hi = Math.max(hi, src.data[i]); }
    useAlpha = hi - lo > 8;
  }

  const sample = (x: number, y: number, c: number): number => {
    const i = (y * src.width + x) * 4;
    return useAlpha ? src.data[i + 3] : source === "relief" ? src.data[i] : src.data[i + c];
  };
  const acc = new Float64Array(size * size * 3);
  if (step < 1) {
    // Enlarging: bilinear, so a small texture is smooth rather than blocky.
    for (let ty = 0; ty < size; ty++) {
      for (let tx = 0; tx < size; tx++) {
        const fx = Math.min(side - 1, Math.max(0, (tx + 0.5) * step - 0.5)), fy = Math.min(side - 1, Math.max(0, (ty + 0.5) * step - 0.5));
        const xa = Math.floor(fx), ya = Math.floor(fy), xb = Math.min(side - 1, xa + 1), yb = Math.min(side - 1, ya + 1), wx = fx - xa, wy = fy - ya;
        for (let c = 0; c < 3; c++) {
          const top = sample(x0 + xa, y0 + ya, c) * (1 - wx) + sample(x0 + xb, y0 + ya, c) * wx;
          const bottom = sample(x0 + xa, y0 + yb, c) * (1 - wx) + sample(x0 + xb, y0 + yb, c) * wx;
          acc[(ty * size + tx) * 3 + c] = top * (1 - wy) + bottom * wy;
        }
      }
    }
  }
  for (let ty = 0; ty < size && step >= 1; ty++) {
    for (let tx = 0; tx < size; tx++) {
      const sx0 = x0 + Math.floor(tx * step), sx1 = Math.max(sx0 + 1, x0 + Math.floor((tx + 1) * step));
      const sy0 = y0 + Math.floor(ty * step), sy1 = Math.max(sy0 + 1, y0 + Math.floor((ty + 1) * step));
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = sy0; y < sy1; y++) {
        for (let x = sx0; x < sx1; x++) {
          const i = (y * src.width + x) * 4;
          if (useAlpha) { r += src.data[i + 3]; g += src.data[i + 3]; b += src.data[i + 3]; }
          else if (source === "relief") { r += src.data[i]; g += src.data[i]; b += src.data[i]; }
          else { r += src.data[i]; g += src.data[i + 1]; b += src.data[i + 2]; }
          n++;
        }
      }
      const o = (ty * size + tx) * 3;
      acc[o] = r / n; acc[o + 1] = g / n; acc[o + 2] = b / n;
    }
  }

  if (contrast === "none") {
    for (let i = 0; i < size * size; i++) {
      const v = Math.max(0, Math.min(255, Math.round(acc[i * 3])));
      out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = v;
      out.data[i * 4 + 3] = 255;
    }
    fs.writeFileSync(outFile, PNG.sync.write(out));
    return true;
  }

  // A near-grey texture (most template diffuse maps) shows as grey: stretching its levels would turn
  // the compression's faint colour noise into speckle.
  let chroma = 0;
  for (let i = 0; i < size * size; i++) chroma += Math.abs(acc[i * 3] - acc[i * 3 + 1]) + Math.abs(acc[i * 3 + 1] - acc[i * 3 + 2]);
  if (chroma / (size * size) < 8) {
    for (let i = 0; i < size * size; i++) {
      const l = (acc[i * 3] + acc[i * 3 + 1] + acc[i * 3 + 2]) / 3;
      acc[i * 3] = acc[i * 3 + 1] = acc[i * 3 + 2] = l;
    }
  }

  // Stretch the levels between the 2nd and 98th percentile of brightness.
  const lum = Array.from({ length: size * size }, (_, i) => (acc[i * 3] + acc[i * 3 + 1] + acc[i * 3 + 2]) / 3).sort((a, b) => a - b);
  const lo = lum[Math.floor(lum.length * 0.02)], hi = lum[Math.floor(lum.length * 0.98)];
  if (hi - lo <= 4) return false;
  const floor = contrast === "soft" ? 150 : 0;
  const scale = (255 - floor) / (hi - lo), bias = lo;
  for (let i = 0; i < size * size; i++) {
    for (let c = 0; c < 3; c++) out.data[i * 4 + c] = Math.max(0, Math.min(255, Math.round(floor + (acc[i * 3 + c] - bias) * scale)));
    out.data[i * 4 + 3] = 255;
  }
  fs.writeFileSync(outFile, PNG.sync.write(out));
  return true;
}
