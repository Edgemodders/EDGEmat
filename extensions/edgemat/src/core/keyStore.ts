// The EDGE tools' shared key store (REDcode's Keys, `%APPDATA%\Edgemodders\keys`), read and written through
// REDbridge's keys.* methods (REDbridge 0.18.0, on only when it is started with --keys). EDGEmat #18 (K4d),
// after EDGEwave's pilot (EDGEwave #12), whose client this follows.
//
// In VS Code, EDGEmat reads its keys through REDcode's API (api.keys, src/keys.ts), which asks the modder once.
// This client is for where REDcode cannot help: the MCP server, which runs without VS Code, and the one-time
// move of a key from EDGEmat's own secret storage (REDcode's API saves only a key typed in its box). REDcode's
// bridge refuses keys.* on purpose, so this starts a REDbridge of its own, with --keys and no game. Nothing
// here reads or decrypts the store's files: REDbridge does, and a key never goes on a command line or in a log.

import { spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createMessageConnection, StreamMessageReader, StreamMessageWriter, type MessageConnection } from "vscode-jsonrpc/node";
import { resolveBridge, type SettingsReader } from "./config";
import type { KeyService } from "./keys";

/** keys.get's answer: the key (null when unset or unreadable here) and where it came from. */
export interface KeyRead {
  service: string;
  key: string | null;
  source: "env" | "file" | null;
  unreadable: boolean;
}

/** keys.info's answer, never the key. */
export interface KeyInfo {
  service: string;
  name: string;
  set: boolean;
  source: "env" | "file" | null;
  env: string;
  last4: string | null;
  unreadable: boolean;
}

/** The names EDGEmat reads a key under (REDbridge records who read a key, for REDcode's Keys view). */
export const KeyCaller = "EDGEmat";
export const McpKeyCaller = "EDGEmat MCP";

/** A REDbridge older than 0.18.0 has no keys.* (JSON-RPC's "method not found"). */
const MethodNotFound = -32601;
export const KeysTooOld = "The key store needs REDbridge 0.18.0 or later. In VS Code: REDcode: Install REDbridge (or Update REDbridge).";

/** One REDbridge started with --keys, for key calls only: started on the first call, kept until close(). */
export class KeysBridge {
  private child?: ChildProcess;
  private connection?: MessageConnection;
  private stderr: string[] = [];

  constructor(private readonly o: { exe: string; args?: string[]; dotnetRoot?: string; timeoutMs?: number }) {}

  get(service: KeyService, tool: string): Promise<KeyRead> {
    return this.call<KeyRead>("keys.get", { service, tool });
  }

  set(service: KeyService, key: string): Promise<KeyInfo> {
    return this.call<KeyInfo>("keys.set", { service, key });
  }

  info(service: KeyService): Promise<KeyInfo> {
    return this.call<KeyInfo>("keys.info", { service });
  }

  close(): void {
    const child = this.child;
    this.child = undefined;
    this.connection?.dispose();
    this.connection = undefined;
    if (child && child.exitCode === null) child.kill();
  }

  private start(): MessageConnection {
    if (this.connection && this.child && this.child.exitCode === null) return this.connection;
    const env = { ...process.env };
    if (this.o.dotnetRoot) env.DOTNET_ROOT = this.o.dotnetRoot;
    // No --game: the keys need none, and REDbridge starts faster without loading it.
    const child = spawn(this.o.exe, [...(this.o.args ?? []), "--keys"], { env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    this.child = child;
    this.stderr = [];
    // Its log, kept for an error message; REDbridge never logs a key.
    child.stderr!.on("data", (b: Buffer) => (this.stderr = [...this.stderr, ...String(b).split(/\r?\n/).filter(Boolean)].slice(-5)));
    child.stdin!.on("error", () => undefined);
    child.on("exit", () => {
      if (this.child !== child) return;
      this.child = undefined;
      this.connection?.dispose();
      this.connection = undefined;
    });
    const connection = createMessageConnection(new StreamMessageReader(child.stdout!), new StreamMessageWriter(child.stdin!));
    connection.listen();
    this.connection = connection;
    return connection;
  }

  private call<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const connection = this.start();
    const child = this.child!;
    let timer: NodeJS.Timeout | undefined;
    let onError: ((e: Error) => void) | undefined;
    let onExit: ((code: number | null) => void) | undefined;
    // The process failing to start or stopping, and a call left unanswered, end the call with words.
    const failed = new Promise<never>((_, reject) => {
      onError = (e) => reject(new Error(`REDbridge could not start (${this.o.exe}): ${e.message}`));
      onExit = (code) => reject(new Error(`REDbridge stopped (exit code ${code})${this.stderr.length ? `: ${this.stderr.join(" ")}` : ""}`));
      child.once("error", onError);
      child.once("exit", onExit);
      timer = setTimeout(() => reject(new Error(`REDbridge did not answer ${method} in time`)), this.o.timeoutMs ?? 30000);
    });
    const answer = connection.sendRequest<T>(method, params).catch((e: { code?: number; message?: string }) => {
      throw new Error(e?.code === MethodNotFound ? KeysTooOld : (e?.message ?? "REDbridge refused the call"));
    });
    return Promise.race([answer, failed]).finally(() => {
      clearTimeout(timer);
      child.off("error", onError!);
      child.off("exit", onExit!);
    });
  }
}

const isFile = (p: string) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

/** Installed REDcode extensions' folders, newest version first (for finding REDbridge outside VS Code). */
export function installedRedcodeDirs(extensionsDir = path.join(os.homedir(), ".vscode", "extensions")): string[] {
  let names: string[] = [];
  try {
    names = fs.readdirSync(extensionsDir).filter((n) => /^edgemodders\.redcode-cyberpunk-\d/.test(n));
  } catch {
    return [];
  }
  const version = (n: string) => (/-(\d+)\.(\d+)\.(\d+)/.exec(n) ?? []).slice(1).map(Number);
  const newer = (a: string, b: string) => {
    const [va, vb] = [version(a), version(b)];
    for (let i = 0; i < 3; i++) if ((va[i] ?? 0) !== (vb[i] ?? 0)) return (vb[i] ?? 0) - (va[i] ?? 0);
    return 0;
  };
  return names.sort(newer).map((n) => path.join(extensionsDir, n));
}

/**
 * REDbridge.exe for the key store, found as for the game (edgemat.bridgePath, then redcode.bridgePath, which
 * REDcode: Install REDbridge sets, then the PATH), else the one bundled inside an installed REDcode.
 */
export function keysBridgeExe(settings: SettingsReader, redcodeDirs: string[] = installedRedcodeDirs()): { exe: string; dotnetRoot?: string } | undefined {
  const choice = resolveBridge(settings);
  if (choice) return { exe: choice.exe, dotnetRoot: choice.dotnetRoot };
  const bundled = redcodeDirs.map((d) => path.join(d, "bridge", "REDbridge.exe")).find(isFile);
  const dotnetRoot = settings("edgemat.dotnetRoot") ?? settings("redcode.dotnetRoot");
  return bundled ? { exe: bundled, dotnetRoot } : undefined;
}
