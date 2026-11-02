// Tripo's v3 API for the checks (paint check, reshape check): calls, uploads, waiting on a task, downloads.
// The key is the player's own (shared key store, service "tripo"); never printed.

import * as fs from "node:fs";
import * as path from "node:path";

// Tripo has two regions with their own accounts and keys: the global site (tripo3d.ai) and China's
// (tripo3d.com). Global first; a key the global API refuses is tried once on China's.
const Regions = ["https://openapi.tripo3d.ai/v3", "https://openapi.tripo3d.com/v3"];

export function makeTripo(key) {
  let Api = Regions[0];

  async function tripo(method, route, body) {
    const res = await fetch(`${Api}${route}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Tripo ${route}: HTTP ${res.status}, not JSON: ${text.slice(0, 200)}`);
    }
    if (json.code !== 0 && /invalid api key/i.test(json.message ?? "") && Api === Regions[0]) {
      Api = Regions[1];
      console.log("  the global API refused the key; trying Tripo China's");
      return tripo(method, route, body);
    }
    if (json.code !== 0) throw new Error(`Tripo ${route}: ${json.code} ${json.message ?? ""}${json.suggestion ? ` (${json.suggestion})` : ""}`);
    return json.data;
  }

  async function upload(file) {
    const format = path.extname(file).slice(1).toLowerCase();
    const { presigned_url, file_token } = await tripo("POST", "/files/presign", { format });
    const put = await fetch(presigned_url, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: fs.readFileSync(file) });
    if (!put.ok) throw new Error(`Upload: HTTP ${put.status}`);
    return file_token;
  }

  async function waitFor(taskId) {
    const start = Date.now();
    let last = "";
    for (;;) {
      const t = await tripo("GET", `/tasks/${taskId}`);
      const line = `${t.status} ${t.progress ?? ""}`.trim();
      if (line !== last) console.log(`  ${taskId}: ${line} (${Math.round((Date.now() - start) / 1000)} s)`);
      last = line;
      if (t.status === "success") return t;
      if (["failed", "cancelled", "banned", "expired", "unknown"].includes(t.status)) throw new Error(`Tripo task ${taskId} ${t.status}${t.error ? `: ${JSON.stringify(t.error)}` : ""}`);
      if (Date.now() - start > 15 * 60_000) throw new Error(`Tripo task ${taskId} still ${t.status} after 15 minutes; run again with --task ${taskId}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  async function download(url, file) {
    if (fs.existsSync(file)) return fs.readFileSync(file);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download ${url.split("?")[0]}: HTTP ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(file, bytes);
    return bytes;
  }

  return { tripo, upload, waitFor, download };
}
