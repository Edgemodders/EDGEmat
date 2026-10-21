// The AI image services Generate a material can use (design, "Generate a material", "Services"): the
// modder's own key and credits, nothing called until they ask. Plain fetch, with a time limit and
// cancel. The models come from the key's own account, so new ones show without an update.

export type ServiceId = "gemini" | "openai";

export interface ServiceInfo {
  id: ServiceId;
  name: string;
  base: string;
  /** The environment variable the MCP server reads the key from. */
  env: string;
  /** Where a modder makes a key, in words. */
  keyFrom: string;
}

export const Services: Record<ServiceId, ServiceInfo> = {
  gemini: { id: "gemini", name: "Google Gemini", base: "https://generativelanguage.googleapis.com", env: "GEMINI_API_KEY", keyFrom: "aistudio.google.com > Get API key" },
  openai: { id: "openai", name: "OpenAI", base: "https://api.openai.com", env: "OPENAI_API_KEY", keyFrom: "platform.openai.com > API keys" },
};

export interface ImageModel {
  id: string;
  name: string;
}

export interface CallOptions {
  key: string;
  /** Another server, for tests. */
  base?: string;
  /** 0 or less: no limit. Default 3 minutes: a 2K image can take a while. */
  timeoutMs?: number;
  signal?: AbortSignal;
}

export type Quality = "low" | "medium" | "high";

export interface GeneratedImage {
  bytes: Buffer;
  mime: string;
  service: ServiceId;
  model: string;
  prompt: string;
}

export class ImageServiceError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

/** A service's error body in plain words: its message when it has one, else the start of the text. */
export function errorText(status: number, body: string): string {
  try {
    const j = JSON.parse(body) as { error?: { message?: unknown; status?: unknown } | string; message?: unknown };
    const e = j.error;
    if (typeof e === "string") return e;
    if (e && typeof e.message === "string") return e.message;
    if (typeof j.message === "string") return j.message;
  } catch {
    // Not JSON.
  }
  return body.trim().slice(0, 300) || `HTTP ${status}`;
}

/** What a status means to a modder, before the service's own words. */
function statusWords(service: ServiceInfo, status: number): string {
  if (status === 401 || status === 403) return `${service.name} refused the key`;
  if (status === 429) return `${service.name} says too many requests, or the credits ran out`;
  if (status >= 500) return `${service.name} had a problem on its side`;
  return `${service.name} refused the request`;
}

async function call(service: ServiceInfo, path: string, opts: CallOptions, init: { method?: string; body?: unknown; headers: Record<string, string> }): Promise<any> {
  const limit = opts.timeoutMs ?? 180_000;
  const signals = [opts.signal, limit > 0 ? AbortSignal.timeout(limit) : undefined].filter(Boolean) as AbortSignal[];
  const url = new URL(path, (opts.base ?? service.base).replace(/\/+$/, "") + "/");
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: { ...init.headers, ...(init.body === undefined ? {} : { "content-type": "application/json" }) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: signals.length ? AbortSignal.any(signals) : undefined,
    });
  } catch (e) {
    if (opts.signal?.aborted) throw new ImageServiceError("Cancelled.");
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) throw new ImageServiceError(`No answer from ${service.name} in ${limit < 10_000 ? (limit / 1000).toFixed(1) : Math.round(limit / 1000)} s. Try again, or a faster model.`);
    throw new ImageServiceError(`Could not reach ${service.name}: ${e instanceof Error ? e.message : String(e)}. Check the internet connection.`);
  }
  const text = await res.text();
  if (!res.ok) throw new ImageServiceError(`${statusWords(service, res.status)}: ${errorText(res.status, text)}`, res.status);
  try {
    return JSON.parse(text);
  } catch {
    throw new ImageServiceError(`${service.name} sent something EDGEmat cannot read (not JSON).`);
  }
}

const geminiHeaders = (o: CallOptions) => ({ "x-goog-api-key": o.key });
const openaiHeaders = (o: CallOptions) => ({ authorization: `Bearer ${o.key}` });

/** Newest-looking first: names with higher version numbers sort ahead; "preview" and "lite" after the rest. */
function byPreference(a: ImageModel, b: ImageModel): number {
  const rank = (m: ImageModel) => (/preview|exp/i.test(m.id) ? 2 : 0) + (/lite|mini/i.test(m.id) ? 1 : 0);
  return rank(a) - rank(b) || b.id.localeCompare(a.id, undefined, { numeric: true });
}

/** The image models the key can use. */
export async function listModels(id: ServiceId, opts: CallOptions): Promise<ImageModel[]> {
  const s = Services[id];
  if (id === "gemini") {
    const models: ImageModel[] = [];
    let page: string | undefined;
    for (let i = 0; i < 10; i++) {
      const j = await call(s, `v1beta/models?pageSize=1000${page ? `&pageToken=${encodeURIComponent(page)}` : ""}`, opts, { headers: geminiHeaders(opts) });
      for (const m of j.models ?? []) {
        const mid = String(m.name ?? "").replace(/^models\//, "");
        // Image output through generateContent: the Nano Banana family. Imagen answers another method.
        if (/image/i.test(mid) && (m.supportedGenerationMethods ?? ["generateContent"]).includes("generateContent")) models.push({ id: mid, name: m.displayName ?? mid });
      }
      page = j.nextPageToken;
      if (!page) break;
    }
    return models.sort(byPreference);
  }
  const j = await call(s, "v1/models", opts, { headers: openaiHeaders(opts) });
  return (j.data ?? [])
    .map((m: { id: string }) => String(m.id))
    .filter((mid: string) => /^gpt-image/i.test(mid))
    .map((mid: string) => ({ id: mid, name: mid }))
    .sort(byPreference);
}

/** The first image in a Gemini answer, wherever it sits (camel or snake case). */
function findInline(j: any): { data: string; mime: string } | undefined {
  for (const c of j?.candidates ?? []) {
    for (const p of c?.content?.parts ?? []) {
      const d = p.inlineData ?? p.inline_data;
      if (d?.data) return { data: d.data, mime: d.mimeType ?? d.mime_type ?? "image/png" };
    }
  }
  return undefined;
}

/** Why a Gemini answer has no image, in words. */
function noImageWhy(j: any): string {
  const block = j?.promptFeedback?.blockReason;
  if (block) return `the prompt was blocked (${block}). Change the words and try again`;
  const c = j?.candidates?.[0];
  const said = (c?.content?.parts ?? []).map((p: { text?: string }) => p.text).filter(Boolean).join(" ").trim();
  if (said) return `it answered in words instead: "${said.slice(0, 200)}"`;
  return c?.finishReason ? `it stopped (${c.finishReason})` : "no reason given";
}

/** One square image from words. */
export async function generateImage(id: ServiceId, model: string, prompt: string, opts: CallOptions & { quality?: Quality }): Promise<GeneratedImage> {
  const s = Services[id];
  if (id === "gemini") {
    const body = (size: boolean, modalities: string[]) => ({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: modalities, imageConfig: { aspectRatio: "1:1", ...(size ? { imageSize: "2K" } : {}) } },
    });
    const path = `v1beta/models/${encodeURIComponent(model)}:generateContent`;
    let j: any;
    try {
      j = await call(s, path, opts, { headers: geminiHeaders(opts), body: body(true, ["IMAGE"]) });
    } catch (e) {
      // Older models take no image size, or want text beside the image: ask once more without.
      if (!(e instanceof ImageServiceError) || e.status !== 400) throw e;
      j = await call(s, path, opts, { headers: geminiHeaders(opts), body: body(false, ["TEXT", "IMAGE"]) });
    }
    const img = findInline(j);
    if (!img) throw new ImageServiceError(`${s.name} sent no image: ${noImageWhy(j)}.`);
    return { bytes: Buffer.from(img.data, "base64"), mime: img.mime, service: id, model, prompt };
  }
  const j = await call(s, "v1/images/generations", opts, {
    headers: openaiHeaders(opts),
    body: { model, prompt, size: "1024x1024", n: 1, quality: opts.quality ?? "medium", output_format: "png" },
  });
  const b64 = j?.data?.[0]?.b64_json;
  if (!b64) throw new ImageServiceError(`${s.name} sent no image.`);
  return { bytes: Buffer.from(b64, "base64"), mime: "image/png", service: id, model, prompt };
}

export type DetailSize = "fine" | "medium" | "coarse";

const DetailWords: Record<DetailSize, string> = {
  fine: "fine detail at real-world scale, as seen from about 30 cm away, many small repeats of the grain or weave",
  medium: "medium detail at real-world scale, as seen from about one metre away",
  coarse: "large features at real-world scale, as seen from a few metres away",
};

/**
 * The words sent to the service: the general prefix (design, "The prompt"), then the modder's words.
 * A tiling material seen straight on, in flat light, with no text, since some garment parts are mirrored.
 */
export function texturePrompt(words: string, detail: DetailSize = "medium"): string {
  return [
    `A seamless, tileable texture of ${words.trim()}, seen straight on and filling the whole square frame edge to edge.`,
    "Flat, even, diffuse light: no shadows, highlights, reflections or vignette, since the game lights it.",
    "Only the material: no objects, no text, letters, numbers or logos, no borders or frame.",
    `${DetailWords[detail][0].toUpperCase()}${DetailWords[detail].slice(1)}.`,
  ].join(" ");
}
