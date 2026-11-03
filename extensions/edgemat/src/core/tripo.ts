// Tripo's v3 API: an AI 3D service, with the player's own key (shared key store, service "tripo"; never
// logged). Used by the paint check and Reshape. Plain fetch, cancel through an AbortSignal.

import * as fs from "node:fs";
import * as path from "node:path";

// Tripo has two regions with their own accounts and keys: the global site (tripo3d.ai) and China's
// (tripo3d.com). Global first; a key the global API refuses is tried once on China's.
const Regions = ["https://openapi.tripo3d.ai/v3", "https://openapi.tripo3d.com/v3"];

export interface TripoTask {
  task_id: string;
  type?: string;
  status: string;
  progress?: number;
  output?: { model_url?: string; pbr_model?: string; model?: string; rendered_image_url?: string };
  credits_consumed?: number;
  error?: unknown;
}

export class Tripo {
  private api = Regions[0];

  constructor(private readonly key: string, private readonly opts: { signal?: AbortSignal; log?: (line: string) => void } = {}) {}

  async call<T = any>(method: string, route: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.api}${route}`, {
      method,
      headers: { Authorization: `Bearer ${this.key}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: this.opts.signal,
    });
    const text = await res.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Tripo ${route}: HTTP ${res.status}, not JSON: ${text.slice(0, 200)}`);
    }
    if (json.code !== 0 && /invalid api key/i.test(json.message ?? "") && this.api === Regions[0]) {
      this.api = Regions[1];
      this.opts.log?.("Tripo: the global API refused the key; trying Tripo China's");
      return this.call(method, route, body);
    }
    if (json.code !== 0) throw new Error(`Tripo ${route}: ${json.code} ${json.message ?? ""}${json.suggestion ? ` (${json.suggestion})` : ""}`);
    return json.data;
  }

  /** The account's credits. */
  async balance(): Promise<number | undefined> {
    const b = await this.call<{ balance?: number }>("GET", "/account/balance").catch(() => undefined);
    return b?.balance;
  }

  /** A file uploaded for a task: its file token. */
  async upload(file: string): Promise<string> {
    const format = path.extname(file).slice(1).toLowerCase();
    const { presigned_url, file_token } = await this.call<{ presigned_url: string; file_token: string }>("POST", "/files/presign", { format });
    const put = await fetch(presigned_url, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: new Uint8Array(fs.readFileSync(file)), signal: this.opts.signal });
    if (!put.ok) throw new Error(`Upload to Tripo: HTTP ${put.status}`);
    return file_token;
  }

  /** Waits for a task to finish, telling `progress` each change (0 to 100). Fails after `limitMs` (15 minutes). */
  async wait(taskId: string, progress?: (percent: number, status: string) => void, limitMs = 15 * 60_000): Promise<TripoTask> {
    const start = Date.now();
    let last = "";
    for (;;) {
      const t = await this.call<TripoTask>("GET", `/tasks/${taskId}`);
      const line = `${t.status} ${t.progress ?? ""}`;
      if (line !== last) progress?.(t.progress ?? 0, t.status);
      last = line;
      if (t.status === "success") return t;
      if (["failed", "cancelled", "banned", "expired", "unknown"].includes(t.status)) throw new Error(`Tripo's task ${t.status}${t.error ? `: ${JSON.stringify(t.error)}` : ""}`);
      if (Date.now() - start > limitMs) throw new Error(`Tripo's task ${taskId} is still ${t.status} after ${Math.round(limitMs / 60_000)} minutes`);
      if (this.opts.signal?.aborted) throw new Error("Cancelled.");
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  /** A task's file, saved once: kept when `file` exists. */
  async download(url: string | undefined, file: string): Promise<Buffer> {
    if (fs.existsSync(file)) return fs.readFileSync(file);
    if (!url) throw new Error("Tripo's task has no file to download");
    const res = await fetch(url, { signal: this.opts.signal });
    if (!res.ok) throw new Error(`Download from Tripo: HTTP ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
    return bytes;
  }
}
