// The AI services' keys in VS Code (EDGEmat #18, K4d): from REDcode's shared key store (REDcode's Keys,
// `%APPDATA%\Edgemodders\keys`, every EDGE tool's), through REDcode's API, which asks the modder once whether
// EDGEmat may read a key and, when none is set, for the key itself. With a REDcode that has no keys (older,
// or not installed), VS Code's secret storage as before (one per service, `edgemat.<service>.apiKey`). An
// environment variable (GEMINI_API_KEY, OPENAI_API_KEY, TRIPO_API_KEY) wins either way. A key EDGEmat kept
// in its secret storage moves into the store once (core keyStore.ts, through REDbridge). No key store or
// decryption is bundled here: REDbridge keeps the store.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import { checkKey, envKey, KeyCaller, KeyEnv, KeysBridge, keysBridgeExe, Services, type KeyService, type ServiceId, type SettingsReader } from "./core";

/** REDcode's shared key store (REDcode's API, `keys`; absent before REDcode 0.10.16). Needs REDbridge 0.18.0. */
export interface KeysApi {
  /** The key, or undefined when none is set, it cannot be read, or the modder said no; asks the first time a caller reads a service. Throws when REDbridge is not running or is too old. */
  get(service: string, caller: string): Promise<string | undefined>;
  /** Asks for the key in a password box and saves it for every tool; undefined when the modder cancels. */
  ask(service: string, caller: string): Promise<string | undefined>;
  /** A service's key was set, replaced or removed, here or by another tool. */
  readonly onDidChange: vscode.Event<string>;
}

/** Where EDGEmat kept a key in VS Code's secret storage (the same names since 0.3.0). */
export const KeySecret = (s: KeyService) => `edgemat.${s}.apiKey`;

const REDcodeId = "edgemodders.redcode-cyberpunk";
const KeyServices = Object.keys(KeyEnv) as KeyService[];
const Names: Record<KeyService, string> = { gemini: Services.gemini.name, openai: Services.openai.name, tripo: "Tripo" };

/** REDcode's key store, or undefined with an older REDcode or none. Activates REDcode when it is not yet. */
async function redcodeKeys(): Promise<KeysApi | undefined> {
  const ext = vscode.extensions.getExtension<{ apiVersion?: number; keys?: KeysApi } | undefined>(REDcodeId);
  if (!ext) return undefined;
  try {
    const api = ext.isActive ? ext.exports : await ext.activate();
    return api?.apiVersion === 1 && api.keys ? api.keys : undefined;
  } catch {
    return undefined;
  }
}

/** Whether Claude Code's user-scope entry for EDGEmat holds a key (EDGEmat's Connect could put them there). The key is not read out. */
function claudeHoldsKey(file = path.join(os.homedir(), ".claude.json")): boolean {
  try {
    const j = JSON.parse(fs.readFileSync(file, "utf8")) as { mcpServers?: Record<string, { env?: Record<string, string> }> };
    const env = j.mcpServers?.edgemat?.env ?? {};
    return Object.values(KeyEnv).some((name) => !!env[name]);
  } catch {
    return false;
  }
}

export class Keys {
  private readonly changed = new vscode.EventEmitter<KeyService>();
  /** A service's key may have changed: in REDcode's Keys (by any tool), or in EDGEmat's own secret storage. */
  readonly onDidChange = this.changed.event;
  /** A password box or REDcode's question while it is open: reads that come meanwhile wait for the same answer. */
  private readonly asking = new Map<KeyService, Promise<string | undefined>>();
  private moving?: Promise<void>;

  constructor(private readonly context: vscode.ExtensionContext, private readonly settings: SettingsReader, private readonly log: (line: string) => void) {}

  /** Whether the keys are REDcode's shared ones (else EDGEmat's own secret storage). */
  async shared(): Promise<boolean> {
    return !!(await redcodeKeys());
  }

  /** Listens for key changes and moves the keys EDGEmat kept itself into REDcode's store. Called once at activation. */
  async watch(): Promise<vscode.Disposable[]> {
    const out: vscode.Disposable[] = [
      this.changed,
      this.context.secrets.onDidChange((e) => {
        const s = KeyServices.find((id) => e.key === KeySecret(id));
        if (s) this.changed.fire(s);
      }),
    ];
    const store = await redcodeKeys();
    if (store) {
      out.push(
        store.onDidChange((service) => {
          const s = KeyServices.find((id) => id === service);
          if (!s) return;
          this.log(`Keys: the ${Names[s]} key changed in REDcode's Keys`);
          this.changed.fire(s);
        }),
      );
      void this.moveToStore();
    }
    return out;
  }

  /**
   * The service's key: the environment's; else from REDcode's Keys (which asks the modder once whether EDGEmat
   * may read it, and with none set, for the key); with an older REDcode, VS Code's secret storage, else asked
   * for in a password box. ask false: never asks, undefined when there is none.
   */
  async key(service: KeyService, ask = true): Promise<string | undefined> {
    const env = envKey(service);
    if (env) return env;
    const store = await redcodeKeys();
    if (!store) {
      const own = (await this.context.secrets.get(KeySecret(service)))?.trim();
      if (own || !ask) return own || undefined;
      return this.once(service, () => this.askOwn(service));
    }
    await this.moveToStore();
    try {
      const k = (await store.get(service, KeyCaller))?.trim();
      if (k || !ask) return k || undefined;
    } catch (e) {
      // REDbridge not running (yet) or too old: a key EDGEmat still keeps itself, else the reason.
      const own = (await this.context.secrets.get(KeySecret(service)))?.trim();
      if (own) return own;
      throw new Error(`EDGEmat reads the ${Names[service]} key from REDcode's Keys, which cannot be reached: ${(e as Error).message}`);
    }
    return this.once(service, () => store.ask(service, KeyCaller));
  }

  /** "EDGEmat: Set Image Service Key": REDcode's password box, which saves the key for every tool; with an older REDcode, EDGEmat's own. */
  async setKey(service?: ServiceId): Promise<string | undefined> {
    const s = service ?? (await pickService("Set the API key for"));
    if (!s) return undefined;
    const store = await redcodeKeys();
    if (!store) return this.once(s, () => this.askOwn(s));
    try {
      return await this.once(s, () => store.ask(s, KeyCaller));
    } catch (e) {
      void vscode.window.showErrorMessage(`EDGEmat: REDcode's Keys cannot be reached, so the key cannot be saved: ${(e as Error).message}`);
      return undefined;
    }
  }

  /** "EDGEmat: Clear Image Service Key": with REDcode's Keys, the key is every tool's, so it is removed there. */
  async clearKey(): Promise<void> {
    const store = await redcodeKeys();
    if (store) {
      for (const s of KeyServices) await this.context.secrets.delete(KeySecret(s));
      const pick = await vscode.window.showInformationMessage(
        "EDGEmat: your image service keys are shared by every EDGE tool, in REDcode's Keys. Remove one there: Remove Key on its line.",
        "Open REDcode's Keys",
      );
      if (pick) void vscode.commands.executeCommand("redcode.keys.focus");
      return;
    }
    const s = await pickService("Clear the API key for");
    if (!s) return;
    const go = await vscode.window.showWarningMessage(`Clear the ${Services[s].name} API key?`, { modal: true, detail: `Generate asks for it again.${envKey(s) ? ` ${Services[s].env} is set in your environment, so EDGEmat goes on using that one.` : ""}` }, "Clear It");
    if (!go) return;
    await this.context.secrets.delete(KeySecret(s));
    void vscode.window.showInformationMessage(`EDGEmat: the ${Services[s].name} API key is cleared.`);
  }

  /** Whether a key is known to be there without asking anyone: the environment's, or one in EDGEmat's own storage. */
  async known(service: KeyService): Promise<boolean> {
    return !!(envKey(service) ?? (await this.context.secrets.get(KeySecret(service))));
  }

  /**
   * The keys for the MCP server's environment, as VS Code's MCP support and Connect an Assistant run it: none
   * with REDcode's Keys (the server reads the store itself, at each call, so no key sits in a child's
   * environment or a client's settings file); with an older REDcode, the ones in EDGEmat's secret storage.
   */
  async serverEnv(): Promise<Record<string, string>> {
    if (await redcodeKeys()) return {};
    const env: Record<string, string> = {};
    for (const s of KeyServices) {
      const k = await this.context.secrets.get(KeySecret(s));
      if (k) env[KeyEnv[s]] = k;
    }
    return env;
  }

  private once(service: KeyService, run: () => Promise<string | undefined>): Promise<string | undefined> {
    let p = this.asking.get(service);
    if (!p) {
      p = run().finally(() => this.asking.delete(service));
      this.asking.set(service, p);
    }
    return p;
  }

  /** The password box for EDGEmat's own secret storage (a REDcode without Keys). */
  private async askOwn(s: KeyService): Promise<string | undefined> {
    const from = s === "tripo" ? "platform.tripo3d.ai" : Services[s].keyFrom;
    const k = await vscode.window.showInputBox({
      title: `EDGEmat: ${Names[s]} API key`,
      prompt: `For Generate. Kept encrypted in VS Code's secret storage, for EDGEmat only, never in settings, and sent only to ${Names[s]}. Make one at ${from}.`,
      password: true,
      ignoreFocusOut: true,
      validateInput: (v) => (v.trim() ? checkKey(s, v) : null),
    });
    if (!k?.trim()) return undefined;
    await this.context.secrets.store(KeySecret(s), k.trim());
    return k.trim();
  }

  /** The move, tried once a session; a key read waits for it, so it never finds the store empty mid-move. */
  private moveToStore(): Promise<void> {
    this.moving ??= this.move();
    return this.moving;
  }

  /**
   * Moves the keys EDGEmat kept in VS Code's secret storage (0.3.0 to 0.3.3) into REDcode's shared store,
   * through a REDbridge of its own (REDcode's API saves only a key typed in its box), then removes EDGEmat's
   * copies. Where the store already has a key, that one is kept. Says so once. On a failure EDGEmat's copy
   * stays, is used while the store cannot be reached, and the move is tried again next session.
   */
  private async move(): Promise<void> {
    const own: { s: KeyService; key: string }[] = [];
    for (const s of KeyServices) {
      const key = (await this.context.secrets.get(KeySecret(s)))?.trim();
      if (key) own.push({ s, key });
    }
    if (!own.length) return;
    const exe = keysBridgeExe(this.settings, [vscode.extensions.getExtension(REDcodeId)?.extensionPath].filter((d): d is string => !!d));
    if (!exe) return this.log("Keys: the keys in EDGEmat's secret storage stay there: REDbridge.exe was not found");
    const bridge = new KeysBridge(exe);
    const moved: string[] = [];
    const kept: string[] = [];
    try {
      for (const { s, key } of own) {
        try {
          const info = await bridge.info(s);
          const had = info.source === "file" && !info.unreadable;
          if (!had) await bridge.set(s, key);
          await this.context.secrets.delete(KeySecret(s));
          (had ? kept : moved).push(Names[s]);
          this.log(had ? `Keys: REDcode's Keys had a ${Names[s]} key already; EDGEmat's own copy removed` : `Keys: the ${Names[s]} key moved from EDGEmat's secret storage to REDcode's Keys`);
        } catch (e) {
          this.log(`Keys: could not move the ${Names[s]} key to REDcode's Keys, so EDGEmat keeps its own copy for now: ${(e as Error).message}`);
        }
      }
    } finally {
      bridge.close();
    }
    if (!moved.length && !kept.length) return;
    const words = (list: string[]) => list.join(" and ");
    const text = [
      moved.length ? `your ${words(moved)} key${moved.length > 1 ? "s are" : " is"} now in REDcode's Keys, shared by every EDGE tool, and EDGEmat no longer keeps a copy of its own.` : "",
      kept.length ? `REDcode's Keys already had ${kept.length > 1 ? "keys" : "a key"} for ${words(kept)}, so EDGEmat uses ${kept.length > 1 ? "them" : "it"} and has removed the copy it kept itself.` : "",
    ].filter(Boolean).join(" ");
    const claude = claudeHoldsKey();
    // Not awaited: a key read waiting for the move must not wait for the modder to close this.
    void vscode.window
      .showInformationMessage(`EDGEmat: ${text}${claude ? " Claude Code's entry for EDGEmat still holds a key; connect again to take it out." : ""}`, ...(claude ? ["Connect an Assistant…"] : []), "Open REDcode's Keys")
      .then((pick) => {
        if (pick === "Connect an Assistant…") void vscode.commands.executeCommand("edgemat.connectAssistant");
        else if (pick === "Open REDcode's Keys") void vscode.commands.executeCommand("redcode.keys.focus");
      });
  }
}

async function pickService(title: string): Promise<ServiceId | undefined> {
  const pick = await vscode.window.showQuickPick(
    (Object.keys(Services) as ServiceId[]).map((id) => ({ label: Services[id].name, id })),
    { title: `EDGEmat: ${title}...` },
  );
  return pick?.id;
}
