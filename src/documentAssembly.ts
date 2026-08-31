// Document assembly (T4): fetch the DSH frontend dist from the running server
// into a local cache, rewrite index.html so every asset is same-origin
// (vscode-resource, verified facts F9–F11), and inject the transport bridge.
// The module is vscode-free: asWebviewUri is injected so it stays unit-testable
// with plain node:test.
//
// Why local copies (spike-notes F10/F11): the shell bundle uses relative module
// imports ("./vendor-*.js", "./langs/*.js") and the CSS references KaTeX fonts —
// cross-origin module/font loading needs CORS, which the DSH server does not
// send. Serving the tree via webview.asWebviewUri makes everything same-origin.

import * as fs from "node:fs";
import * as path from "node:path";

export interface AssembleOptions {
  /** e.g. "http://127.0.0.1:53443" */
  serverBase: string;
  /** Absolute directory where the dist tree is cached (globalStorage). */
  distRootPath: string;
  /** Map an absolute local file path to a webview URI string (webview.asWebviewUri). */
  asWebviewUri: (absPath: string) => string;
  /** Content of media/bridge-client.js, inlined before the shell bundle. */
  bridgeClientJs: string;
  /** Value of webview.cspSource for the CSP meta tag. */
  cspSource: string;
  /** VS Code dark-mode hint, injected into __DSH_BRIDGE__ for the matchMedia shim. */
  themeDark?: boolean;
  /** dshmux.completionSound: master toggle for all session sounds.
   *  Injected into __DSH_BRIDGE__ so the bridge-client sound detector has the
   *  initial value at boot (runtime changes arrive via a "completion-sound"
   *  postMessage). */
  completionSound?: boolean;
  /** dshmux.soundStart: play the "task started" sound (gated by the master). */
  soundStart?: boolean;
  /** dshmux.soundDone: play the "task finished" sound (gated by the master). */
  soundDone?: boolean;
  /** dshmux.soundAsk: play the "harness is asking" sound (gated by the master). */
  soundAsk?: boolean;
  /** Content zoom for the embedded DSH frame (1 = upstream size). The DSH app
   *  is px-based (no rem), so a root font-size scale would be a no-op; zoom
   *  scales fonts, spacing, and layout uniformly. No height compensation is
   *  needed: with `zoom: Z`, a `height: 100%` box already renders at the full
   *  viewport (zoom expands the layout box to 100/Z, which scales back to 100).
   *  Adding `height: 100/Z%` would make #root render at 100/Z of the viewport,
   *  overflow the document, and break the app's sticky composer. */
  frameFontScale?: number;
  /** Optional localStorage preset for `dsh.sessions.current` (req R2/T7d):
   *  written before the DSH module script runs so the frontend selects the
   *  IDE workspace instead of the "most recently active" one. */
  sessionPreset?: string;
  /** Extra markup injected before </body> (e.g. the server-status overlay). */
  chromeHtml?: string;
  fetchImpl?: typeof fetch;
  /**
   * DSH browser-session cookie provider (token-auth servers, DSH >=
   * 0.1.2-alpha): the index route is auth-gated, so the index fetch needs the
   * cookie minted from the launch token. Undefined for pre-auth DSH.
   */
  cookieProvider?: () => string | undefined;
  log?: (msg: string) => void;
}

export interface Assembled {
  html: string;
  distRev: string;
  downloaded: boolean;
}

// DSH <= 0.1.1 emitted root-relative `/assets/...` references. DSH 0.1.2
// switched the same index entries to document-relative `./assets/...`.
// Capture both forms; resolveAssetRef() normalizes either one to a safe path
// below /assets before it is fetched or mapped into the webview.
const ASSET_REF_RE = /(src|href)="((?:\/|\.\/)assets\/[^"]+)"/g;
const CSS_URL_RE = /url\(\s*(["']?)([^)"']+)\1\s*\)/g;
const SHELL_IMPORT_RE = /\.\/((?:vendor|langs)\/[A-Za-z0-9_.-]+\.js)/g;
// Boot manifest injection changed shape between rc.8 (`window.__DSH_BOOT__ =`)
// and 0.1.1-rc.2 (`globalThis["__DSH_BOOT__"] =`). Match either prefix; the
// capture runs to the closing `</script>`.
const BOOT_RE = /(?:window\.__DSH_BOOT__|globalThis\["__DSH_BOOT__"\])\s*=\s*(\{.*?\})<\/script>/s;
const REV_RE = /"rev"\s*:\s*"([^"]+)"/;
const SERVER_STATIC_RE = /(src|href)="(?:\/|\.\/)(manifest\.webmanifest|favicon\.svg)"/g;
// DSH boot-manifest preloads: injectBootManifest (dsh-client-modules >= rc.8)
// emits blocking <script src="/plugins/..."> tags for @deepseek-ai/dsh-client-modules
// and @deepseek-ai/dsh-client-runtime before window.__DSH_BOOT__. They are
// classic scripts (cross-origin OK, spike F2/F14) but must be absolute like
// the JSON entries, or the webview resolves them against vscode-webview://
// and the module-system queue never receives the client-modules registration.
// The owning webview also maps this loopback port to the extension host; that
// is required when DSH runs under Remote SSH/WSL/a dev container.
const PLUGIN_PRELOAD_RE = /(src|href)="(\/plugins\/[^"]+)"/g;

interface AssetRef {
  /** Server request target, including a query string when present. */
  requestPath: string;
  /** Safe path relative to distRootPath (always starts with `assets/`). */
  cachePath: string;
}

/**
 * Resolve an index/CSS asset reference against a server path and constrain it
 * to the DSH `/assets/` tree. This both normalizes `./assets/...` and keeps
 * filesystem writes below distRootPath.
 */
function resolveAssetRef(ref: string, basePath = "/"): AssetRef | undefined {
  try {
    const base = new URL(basePath, "http://dsh.invalid/");
    const resolved = new URL(ref, base);
    if (resolved.origin !== base.origin || !resolved.pathname.startsWith("/assets/")) {
      return undefined;
    }
    const cachePath = resolved.pathname.slice(1);
    if (cachePath.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) {
      return undefined;
    }
    return { requestPath: resolved.pathname + resolved.search, cachePath };
  } catch {
    return undefined;
  }
}

function indexAssetRefs(indexHtml: string): AssetRef[] {
  const refs: AssetRef[] = [];
  for (const match of indexHtml.matchAll(ASSET_REF_RE)) {
    const asset = resolveAssetRef(match[2]);
    if (asset) refs.push(asset);
  }
  return refs;
}

function assetFsPath(distRootPath: string, asset: AssetRef): string {
  return path.join(distRootPath, ...asset.cachePath.split("/"));
}

/** Extract the boot manifest rev from index.html ("" when absent). */
export function extractRev(html: string): string {
  const m = html.match(REV_RE);
  return m ? m[1] : "";
}

/** Rewrite the boot graph's plugin URLs to absolute server URLs (F14). */
export function rewriteBootPluginUrls(html: string, serverBase: string): string {
  const m = html.match(BOOT_RE);
  if (!m) return html;
  let graph: {
    entries?: { url?: string }[];
    /** DSH 0.1.2 groups loader requests into bootstrap/application batches. */
    batches?: { url?: string }[];
  };
  try {
    graph = JSON.parse(m[1]);
  } catch {
    return html;
  }
  for (const item of [...(graph.entries ?? []), ...(graph.batches ?? [])]) {
    if (item.url?.startsWith("/")) item.url = serverBase + item.url;
  }
  const next = JSON.stringify(graph).replaceAll("<", "\\u003c");
  return html.replace(m[1], next);
}

/**
 * Rewrite the boot-manifest preload script tags to absolute server URLs.
 * DSH (client-modules >= rc.8) injects blocking <script src="/plugins/...">
 * preloads for @deepseek-ai/dsh-client-modules and @deepseek-ai/dsh-client-runtime
 * before window.__DSH_BOOT__; like the JSON entries they must point at the
 * server or the webview origin lookup fails and the module-system queue stays
 * empty ("Failed to load plugins / HTML did not preload .../client.js").
 */
export function rewriteBootPluginPreloads(html: string, serverBase: string): string {
  return html.replace(PLUGIN_PRELOAD_RE, (_m, attr: string, url: string) => `${attr}="${serverBase}${url}"`);
}

function buildCsp(cspSource: string): string {
  return [
    "default-src 'none'",
    `script-src 'unsafe-inline' 'unsafe-eval' ${cspSource} http://127.0.0.1:* http://localhost:*`,
    `style-src 'unsafe-inline' ${cspSource}`,
    `img-src ${cspSource} data: http://127.0.0.1:*`,
    `font-src ${cspSource} data:`,
    "connect-src 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
  ].join("; ");
}

/**
 * Shared in-flight guard for the dist-tree download. Restoring several
 * panels at once calls assembleDocument concurrently; without this, each
 * caller that sees a changed rev would rmSync + re-download the tree at the
 * same time, clobbering each other's files and leaving some panels blank.
 */
let distDownloadInFlight: Promise<void> | undefined;

/**
 * Fetch + cache the dist tree, then assemble the webview document.
 * Caching key: the boot manifest rev — a DSH upgrade (new rev) triggers a
 * fresh download; an unchanged rev reuses the cached tree.
 */
export async function assembleDocument(opts: AssembleOptions): Promise<Assembled> {
  const { serverBase, distRootPath, asWebviewUri, bridgeClientJs, cspSource, themeDark, completionSound, soundStart, soundDone, soundAsk, frameFontScale, chromeHtml, log } = opts;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const logf = log ?? (() => {});

  const indexHeaders: Record<string, string> = {};
  const cookie = opts.cookieProvider?.();
  if (cookie) indexHeaders.cookie = cookie;
  const indexRes = await fetchImpl(serverBase + "/", { headers: indexHeaders });
  if (!indexRes.ok) throw new Error(`failed to fetch ${serverBase}/ (HTTP ${indexRes.status})`);
  const indexHtml = await indexRes.text();
  const rev = extractRev(indexHtml);
  const entryAssets = indexAssetRefs(indexHtml);
  if (entryAssets.length === 0) {
    throw new Error("DSH index contains no supported frontend asset references");
  }

  const revFile = path.join(distRootPath, "rev.txt");
  const cached = fs.existsSync(revFile) ? fs.readFileSync(revFile, "utf8") : "";
  const cacheComplete = entryAssets.every((asset) => fs.existsSync(assetFsPath(distRootPath, asset)));
  let downloaded = false;

  if (cached !== rev || !cacheComplete) {
    if (!distDownloadInFlight) {
      distDownloadInFlight = (async () => {
        const reason = cached !== rev
          ? `rev changed (${cached || "none"} -> ${rev})`
          : "cache is incomplete";
        logf(`dist ${reason}; re-downloading`);
        fs.rmSync(distRootPath, { recursive: true, force: true });
        fs.mkdirSync(distRootPath, { recursive: true });
        await downloadTree(serverBase, distRootPath, indexHtml, asWebviewUri, fetchImpl, logf);
        const missing = entryAssets.find((asset) => !fs.existsSync(assetFsPath(distRootPath, asset)));
        if (missing) throw new Error(`failed to cache required DSH asset ${missing.requestPath}`);
        // rev.txt is the completion marker: write it only after every required
        // entry asset exists, so an interrupted/unsupported download is retried.
        fs.writeFileSync(revFile, rev);
      })().finally(() => {
        distDownloadInFlight = undefined;
      });
    }
    // Concurrent callers wait for the shared download instead of racing it.
    await distDownloadInFlight;
    downloaded = true;
  }

  let html = indexHtml;
  html = html.replace(ASSET_REF_RE, (original, attr: string, url: string) => {
    const asset = resolveAssetRef(url);
    return asset ? `${attr}="${asWebviewUri(assetFsPath(distRootPath, asset))}"` : original;
  });
  html = html.replace(SERVER_STATIC_RE, (_m, attr: string, name: string) => `${attr}="${serverBase}/${name}"`);
  html = rewriteBootPluginUrls(html, serverBase);
  html = rewriteBootPluginPreloads(html, serverBase);

  const bridgeInit = {
    serverBase,
    ...(themeDark !== undefined ? { dark: themeDark } : {}),
    ...(completionSound !== undefined ? { completionSound } : {}),
    ...(soundStart !== undefined ? { soundStart } : {}),
    ...(soundDone !== undefined ? { soundDone } : {}),
    ...(soundAsk !== undefined ? { soundAsk } : {}),
  };
  const bootScript =
    `<script>window.__DSH_BRIDGE__ = ${JSON.stringify(bridgeInit)}<\/script>` +
    (frameFontScale !== undefined
      ? `<style id="dshmux-frame-font-scale">#root { zoom: ${frameFontScale}; }<\/style>`
      : "") +
    (opts.sessionPreset
      ? `<script>try { localStorage.setItem("dsh.sessions.current", ${JSON.stringify(opts.sessionPreset)}); } catch (e) { console.error("[dsh] session preset failed", e); }<\/script>`
      : "") +
    `<script>${bridgeClientJs}<\/script>`;
  const cspMeta = `<meta http-equiv="Content-Security-Policy" content="${buildCsp(cspSource)}">`;
  // Attribute-tolerant head injection (DSH's <head> may gain attributes later).
  html = html.replace(/<head\b[^>]*>/i, (m) => `${m}${cspMeta}${bootScript}`);
  if (chromeHtml) html = html.replace("</body>", `${chromeHtml}</body>`);

  return { html, distRev: rev, downloaded };
}

/** Download the /assets tree, rewriting CSS font URLs to local webview URIs. */
async function downloadTree(
  serverBase: string,
  distRootPath: string,
  indexHtml: string,
  asWebviewUri: (absPath: string) => string,
  fetchImpl: typeof fetch,
  log: (msg: string) => void
): Promise<void> {
  const queue: AssetRef[] = [];
  const seen = new Set<string>();
  queue.push(...indexAssetRefs(indexHtml));

  while (queue.length > 0) {
    const asset = queue.shift()!;
    if (seen.has(asset.requestPath)) continue;
    seen.add(asset.requestPath);
    const fsPath = assetFsPath(distRootPath, asset);
    fs.mkdirSync(path.dirname(fsPath), { recursive: true });
    const res = await fetchImpl(serverBase + asset.requestPath);
    if (!res.ok) {
      throw new Error(`failed to download ${asset.requestPath} (HTTP ${res.status})`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(fsPath, buf);

    if (asset.cachePath.endsWith(".css")) {
      let text = buf.toString("utf8");
      let rewritten = false;
      text = text.replace(CSS_URL_RE, (original, _quote: string, ref: string) => {
        const nested = resolveAssetRef(ref, asset.requestPath);
        if (!nested) return original;
        rewritten = true;
        queue.push(nested); // ensure the font/image is downloaded too
        return `url(${asWebviewUri(assetFsPath(distRootPath, nested))})`;
      });
      if (rewritten) fs.writeFileSync(fsPath, text);
    } else if (/\/index-[\w-]+\.js$/.test(asset.cachePath)) {
      // Shell bundle: its relative imports must exist in the local tree.
      const text = buf.toString("utf8");
      for (const match of text.matchAll(SHELL_IMPORT_RE)) {
        const nested = resolveAssetRef("./" + match[1], asset.requestPath);
        if (nested) queue.push(nested);
      }
    }
  }
}
