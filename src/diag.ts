// Temporary diagnostic (bug: wrong session in wrong window after full restart).
// Appends one JSON line per event to a file in the extension's globalStorage so
// the extension host's (non-persisted) console.log can be inspected after the
// fact. Always best-effort: any failure is swallowed so diagnostics can never
// break the extension. Remove this module and its call sites once the bug is
// fixed.
import * as fs from "node:fs";
import * as path from "node:path";

let diagDir: string | undefined;

/**
 * Append a diagnostic event. `globalStoragePath` is the extension's
 * globalStorageUri.fsPath (shared across all windows of this extension).
 */
export function diag(globalStoragePath: string, event: string, data: Record<string, unknown>): void {
  try {
    if (diagDir !== globalStoragePath) {
      diagDir = globalStoragePath;
      fs.mkdirSync(globalStoragePath, { recursive: true });
    }
    const line = JSON.stringify({
      t: new Date().toISOString(),
      pid: process.pid,
      event,
      ...data,
    });
    fs.appendFileSync(path.join(globalStoragePath, "dshmux-diag.jsonl"), line + "\n");
  } catch {
    /* diagnostics must never throw */
  }
}
