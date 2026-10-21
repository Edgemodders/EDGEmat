// EDGEmat's MCP server for assistants ships inside the extension (dist/mcp/edgemat-mcp.cjs, built by
// esbuild.mjs from packages/edgemat-mcp). On start the extension copies it to a fixed path in EDGEmat's own
// folder, so a Claude Code registration survives updates and each update refreshes the file. It also
// registers the server with VS Code's own MCP support where the editor has it (1.101 and later), with the
// image service keys from secret storage; without that API, or where it fails (EDGEkit without Copilot),
// nothing is registered and the rest works as before. "Connect an Assistant (MCP)..." registers it with
// Claude Code, or copies the command or a JSON entry for other clients.

import * as vscode from "vscode";
import { execFile, exec } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { defaultCacheDir, Services, type ServiceId } from "./core";
import { KeySecret } from "./materialPage";

type Log = (line: string) => void;

/** Where the server lives for assistants: the same path for every version of EDGEmat. */
export const serverFile = () => path.join(defaultCacheDir(), "mcp", "edgemat-mcp.cjs");

/** Copies the bundled server to its fixed path when it is missing or differs. */
export function installServer(extensionPath: string, log: Log): void {
  const from = path.join(extensionPath, "dist", "mcp", "edgemat-mcp.cjs");
  const to = serverFile();
  try {
    if (!fs.existsSync(from)) return log(`MCP: no server in the extension at ${from}`);
    const bundled = fs.readFileSync(from);
    if (fs.existsSync(to) && fs.readFileSync(to).equals(bundled)) return;
    fs.mkdirSync(path.dirname(to), { recursive: true });
    const temp = `${to}.${process.pid}.tmp`;
    fs.writeFileSync(temp, bundled);
    fs.renameSync(temp, to);
    log(`MCP: server updated at ${to}`);
  } catch (e) {
    log(`MCP: could not copy the server to ${to}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** The image service keys EDGEmat holds, as the server's environment variables. */
async function keyEnv(context: vscode.ExtensionContext): Promise<Record<string, string>> {
  const env: Record<string, string> = {};
  for (const id of Object.keys(Services) as ServiceId[]) {
    const k = await context.secrets.get(KeySecret(id));
    if (k) env[Services[id].env] = k;
  }
  return env;
}

interface McpApi {
  registerMcpServerDefinitionProvider?: (id: string, provider: unknown) => vscode.Disposable;
}
type McpDefinition = new (label: string, command: string, args: string[], env: Record<string, string>, version?: string) => unknown;

const editorMcp = () => {
  const lm = (vscode as unknown as { lm?: McpApi }).lm;
  const Def = (vscode as unknown as { McpStdioServerDefinition?: McpDefinition }).McpStdioServerDefinition;
  return lm?.registerMcpServerDefinitionProvider && Def ? { lm, Def } : undefined;
};

/** Registers the server with the editor's own MCP support, when it has one. VS Code's binary runs it as Node. */
export function registerWithEditor(context: vscode.ExtensionContext, version: string, log: Log): vscode.Disposable[] {
  const api = editorMcp();
  if (!api) return [];
  const changed = new vscode.EventEmitter<void>();
  try {
    return [
      changed,
      api.lm.registerMcpServerDefinitionProvider!("edgemat.mcp", {
        onDidChangeMcpServerDefinitions: changed.event,
        provideMcpServerDefinitions: async () => [new api.Def("EDGEmat", process.execPath, [serverFile()], { ELECTRON_RUN_AS_NODE: "1", ...(await keyEnv(context)) }, version)],
      }),
      context.secrets.onDidChange((e) => {
        if (e.key.startsWith("edgemat.")) changed.fire();
      }),
    ];
  } catch (e) {
    changed.dispose();
    log(`MCP: the editor's MCP support is here but refused the server, so agents in this editor won't see it: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}

const quote = (s: string) => `"${s}"`;

/** Node 20 or later on the PATH, for Claude Code to run the server with; else VS Code's own binary as Node. */
function runner(): Promise<{ command: string; env: Record<string, string> }> {
  return new Promise((resolve) => {
    execFile("node", ["--version"], { windowsHide: true, timeout: 10000 }, (err, out) => {
      const major = Number(/^v(\d+)/.exec(String(out).trim())?.[1] ?? 0);
      resolve(!err && major >= 20 ? { command: "node", env: {} } : { command: process.execPath, env: { ELECTRON_RUN_AS_NODE: "1" } });
    });
  });
}

/** "Connect an Assistant (MCP)...". */
export async function connectAssistant(context: vscode.ExtensionContext, log: Log): Promise<void> {
  installServer(context.extensionPath, log);
  const file = serverFile();
  if (!fs.existsSync(file)) {
    void vscode.window.showErrorMessage("EDGEmat: the MCP server file is missing. Reinstall EDGEmat, then try again. The log says why.");
    return;
  }
  const run = await runner();
  const args = [file];
  const inEditor = editorMcp() ? "Agents inside this editor already see EDGEmat's tools." : "This editor has no MCP support of its own (VS Code 1.101 or later has), so connect an assistant here.";
  const picked = await vscode.window.showQuickPick(
    [
      { label: "$(plug) Connect Claude Code", description: "claude mcp add edgemat ...", detail: "Registers EDGEmat for every Claude Code session, replacing an older registration. Then start a new Claude Code session.", action: "claude" as const },
      { label: "$(terminal) Copy the Claude Code command", description: "to run it yourself", detail: "The same registration, as one line to paste in a terminal.", action: "copy" as const },
      { label: "$(json) Copy a JSON entry", description: "for other MCP clients", detail: "The server entry for a client's MCP settings file.", action: "json" as const },
      { label: "$(file) Reveal the server file", description: file, detail: "Any MCP client can run it with Node 20 or later.", action: "reveal" as const },
    ],
    { title: "EDGEmat: Connect an Assistant (MCP)", placeHolder: inEditor },
  );
  if (!picked) return;
  if (picked.action === "reveal") {
    await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(file));
    return;
  }

  // The image service keys, only when asked: the client keeps them in its own settings file, in plain text.
  let env = { ...run.env };
  const keys = await keyEnv(context);
  const names = (Object.keys(Services) as ServiceId[]).filter((id) => keys[Services[id].env]).map((id) => Services[id].name);
  if (names.length && picked.action !== "copy") {
    const give = await vscode.window.showQuickPick(
      [
        { label: `Yes, include my ${names.join(" and ")} key`, detail: "So the assistant can make materials from words (mat_generate). The client stores the key in its own settings file, in plain text.", give: true },
        { label: "No", detail: "Every other tool works without a key. You can connect again later.", give: false },
      ],
      { title: "Give the assistant your image service key too?" },
    );
    if (!give) return;
    if (give.give) env = { ...env, ...keys };
  }
  const envFlags = Object.entries(env).map(([k, v]) => `-e ${k}=${v}`);
  const command = (flags: string[]) => ["claude mcp add --scope user edgemat", ...flags, "--", quote(run.command), ...args.map(quote)].join(" ");
  const masked = command(Object.entries(env).map(([k, v]) => `-e ${k}=${k.endsWith("_API_KEY") ? "<key>" : v}`));

  if (picked.action === "copy") {
    await vscode.env.clipboard.writeText(masked);
    void vscode.window.showInformationMessage(names.length ? "Copied. Put your key in place of <key>, or leave out that -e, then paste it in a terminal." : "Copied. Paste it in a terminal, then start a new Claude Code session.");
    log(`MCP: ${masked}`);
    return;
  }
  if (picked.action === "json") {
    await vscode.env.clipboard.writeText(JSON.stringify({ edgemat: { command: run.command, args, ...(Object.keys(env).length ? { env } : {}) } }, null, 2));
    void vscode.window.showInformationMessage("Copied the JSON entry for EDGEmat's server.");
    return;
  }

  log(`MCP: ${masked}`);
  const shell = (line: string) => new Promise<{ ok: boolean; out: string }>((resolve) =>
    exec(line, { windowsHide: true, timeout: 60000 }, (err, stdout, stderr) => resolve({ ok: !err, out: `${stdout}${stderr}`.trim() })),
  );
  await shell("claude mcp remove --scope user edgemat");
  const added = await shell(command(envFlags));
  if (added.ok) {
    log(`MCP: ${added.out}`);
    void vscode.window.showInformationMessage("EDGEmat is connected to Claude Code. Start a new Claude Code session and ask it about a garment's materials.");
    return;
  }
  log(`MCP: claude mcp add failed: ${added.out}`);
  const notFound = /not recognized|not found|ENOENT/i.test(added.out);
  const choice = await vscode.window.showWarningMessage(
    notFound ? "EDGEmat: Claude Code's claude command isn't on the PATH. Copy the command and run it where Claude Code works?" : `EDGEmat: Claude Code didn't take the server: ${added.out.split(/\r?\n/)[0]}`,
    "Copy the Command",
    "Show Log",
  );
  if (choice === "Copy the Command") await vscode.env.clipboard.writeText(masked);
  if (choice === "Show Log") void vscode.commands.executeCommand("edgemat.showLog");
}
