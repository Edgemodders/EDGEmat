// EDGEmat's MCP server for assistants ships inside the extension (dist/mcp/edgemat-mcp.cjs, built by
// esbuild.mjs from packages/edgemat-mcp). On start the extension copies it to a fixed path in EDGEmat's own
// folder, so a Claude Code registration survives updates and each update refreshes the file. It also
// registers the server with VS Code's own MCP support where the editor has it (1.101 and later); without
// that API, or where it fails (EDGEkit without Copilot), nothing is registered and the rest works as before.
// "Connect an Assistant (MCP)..." registers it with Claude Code, or copies the command or a JSON entry for
// other clients. No keys are passed: the server reads the image service keys from the shared store (REDnode #23).

import * as vscode from "vscode";
import { execFile, exec } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { defaultCacheDir } from "./core";

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
export function registerWithEditor(version: string, log: Log): vscode.Disposable[] {
  const api = editorMcp();
  if (!api) return [];
  try {
    return [
      api.lm.registerMcpServerDefinitionProvider!("edgemat.mcp", {
        provideMcpServerDefinitions: () => [new api.Def("EDGEmat", process.execPath, [serverFile()], { ELECTRON_RUN_AS_NODE: "1" }, version)],
      }),
    ];
  } catch (e) {
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

  // No keys: the server reads them from the shared store, so they never go into a client's settings.
  const env = run.env;
  const line = ["claude mcp add --scope user edgemat", ...Object.entries(env).map(([k, v]) => `-e ${k}=${v}`), "--", quote(run.command), ...args.map(quote)].join(" ");

  if (picked.action === "copy") {
    await vscode.env.clipboard.writeText(line);
    void vscode.window.showInformationMessage("Copied. Paste it in a terminal, then start a new Claude Code session.");
    log(`MCP: ${line}`);
    return;
  }
  if (picked.action === "json") {
    await vscode.env.clipboard.writeText(JSON.stringify({ edgemat: { command: run.command, args, ...(Object.keys(env).length ? { env } : {}) } }, null, 2));
    void vscode.window.showInformationMessage("Copied the JSON entry for EDGEmat's server.");
    return;
  }

  log(`MCP: ${line}`);
  const shell = (line: string) => new Promise<{ ok: boolean; out: string }>((resolve) =>
    exec(line, { windowsHide: true, timeout: 60000 }, (err, stdout, stderr) => resolve({ ok: !err, out: `${stdout}${stderr}`.trim() })),
  );
  await shell("claude mcp remove --scope user edgemat");
  const added = await shell(line);
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
  if (choice === "Copy the Command") await vscode.env.clipboard.writeText(line);
  if (choice === "Show Log") void vscode.commands.executeCommand("edgemat.showLog");
}
