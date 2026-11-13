// Tooltip helpers for EDGEmat's views.
import type * as vscode from "vscode";

/** A zero-width space: an invisible place where a line may break. */
const BreakHere = String.fromCharCode(0x200b);

/**
 * Game paths in a tooltip, one per line, as text that wraps at its backslashes. A code block cuts a long
 * path off at the tooltip's right edge (the owner, 2026-11-13), and a tooltip's width and padding are
 * VS Code's. Each row is a label in bold (or none) and a path.
 */
export function appendPaths(md: vscode.MarkdownString, rows: [label: string, path: string][]): void {
  for (const [label, p] of rows) {
    if (label) md.appendMarkdown(`**${label}** `);
    md.appendText(p.replace(/\\/g, "\\" + BreakHere));
    md.appendMarkdown("  \n");
  }
  md.appendMarkdown("\n");
}
