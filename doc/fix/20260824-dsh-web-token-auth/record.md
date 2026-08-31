# Bugfix — DSH side panel does not load against token-authenticated `dsh web` (401)

**Date**: 2026-08-24 ｜ **Impact**: DSHmux v0.3.9 against DSH `0.1.2-alpha.2` (Windows; any platform)
**Symptom**: server starts (state `ready`), but the side panel shows `DSH error: failed to fetch http://127.0.0.1:<port>/ (HTTP 401)`; every `/api` call and the WebSocket event stream are rejected the same way.

## Goal

The embedded DSH UI loads and works (chat, session list, events) against a `dsh web` instance that requires browser-session authentication, without modifying deepseek-harness.

## Facts (code audit)

DSH side (`C:\proj\deepseek-harness`, v0.1.2-alpha.2 — read-only reference):

1. `packages/bundle/web-app/src/index.ts:280` prints `dsh web: <authenticatedUrl>` where `authenticatedUrl` is the origin plus `?token=<43-char base64url>` (`packages/client/connection/src/browser-auth.ts:223-230`, `authenticatedUrl()`).
2. `BrowserAuth.authorizeIndex` (`browser-auth.ts:240-282`): a `GET /?token=<launchToken>` answers **303 + `Set-Cookie: dsh-auth-<sha256(authority)>=v1.<body>.<sig>; Max-Age=86400; Path=/; HttpOnly; SameSite=Strict`**. The launch token is a per-process constant (not one-time), but the cookie is **authority-bound** (host:port) and the port changes on every start (`--port 0`) → the exchange must run on **every** start.
3. `HostConnectionService.requestRejection` (`rpc-host.ts:96-99`): every `/api` request gets 403 (trust fence) or **401 (missing/invalid cookie)**. The WebSocket upgrade route applies the same rejection (`packages/api/gateway/src/index.ts:212-221`).
4. Static routes (`/assets/*`, `/plugins/*`, `manifest.webmanifest`, `favicon.svg`) are **not** auth-gated (`packages/host/frontend-static/src/index.ts`).
5. Node-side exchange pattern verified in `apps/cli/tests/web-auth.e2e.ts:173-183`: `fetch(launchUrl, { redirect: "manual" })` → 303 → `setCookie.split(";", 1)[0]` → send as `cookie` header on `/api` POSTs.

DSHmux side (this repo):

| # | Call site | Request | Cookie needed? |
|---|---|---|---|
| 1 | `src/serverManager.ts:63` `URL_LINE_RE` | parses `dsh web: http://127.0.0.1:<port>` — **drops the `?token=…` query** | — (root cause) |
| 2 | `src/serverManager.ts:641-663` `api()` | `POST <base>/api/<method>` (workspace/session management) | **yes** |
| 3 | `src/themeSync.ts:22-31` `syncNow` | `POST <base>/api/settings.update` | **yes** |
| 4 | `src/documentAssembly.ts:142` `assembleDocument` | `GET <base>/` (index, auth-gated) | **yes** |
| 5 | `src/documentAssembly.ts:215` `downloadTree` | `GET <base>/assets/*` | no (harmless if sent) |
| 6 | `src/bridgeCore.ts:29` `relayHttp` | every webview `fetch` (incl. all DSH frontend `/api` calls) | **yes** for `/api` + `/` |
| 7 | `src/bridgeCore.ts:60` `WsRelay.open` | WebSocket upgrade to `/api/events.mux` | **yes** (upgrade header) |
| 8 | `src/commands.ts:36` `dshmux.openBrowser` | opens `manager.serverUrl` in the external browser | bare URL now 401s in the browser too — must open the launch URL |

Non-consumers (display only, no change): `launcherView.ts` status posts, `dshWebviewPortMappings` (port mapping), boot-manifest/plugin absolute URLs (static, unauthenticated).

## Gap

DSHmux never performs the token→cookie exchange and never sends the cookie: the launch URL is truncated to the origin at parse time (fact 1), so the token is lost before anything can use it. Every auth-gated request above answers 401.

## Call-site audit (shared-function contract changes)

- `parseUrlLine(line): string | null` — **return value now the full launch URL** (with `?token=…` when DSH prints one; identical to before for bare URLs). Call sites: `serverManager.ts:559` (only caller) + unit test `test/serverManager.test.js:76-81` (updated). Compatible.
- `settleReady(url)` — private; becomes async internally (`finishReady`). No external contract change: `start()` still resolves with the **base** URL (origin, no token) as before, so the `DSHmux ready at <url>` message, `serverUrl` consumers, and port mappings are unchanged.
- `relayHttp(serverBase, msg, fetchImpl)` / `new WsRelay(post, resolveBase)` — gain **optional trailing** `cookieProvider?: () => string | undefined` parameters; existing 2/3-arg call sites (`bridgeHost.ts`, unit tests) keep working (no cookie → no header). Compatible.
- `assembleDocument(opts)` — gains optional `cookieProvider?`; existing call sites unchanged. Compatible.
- `registerThemeSync(context, getServerBase)` — gains optional trailing `getCookie?`; existing call site `extension.ts:33` updated to pass it. Compatible.

## Tasks

1. **`src/serverManager.ts`**
   - `URL_LINE_RE` → `/dsh web: (http:\/\/127\.0\.0\.1:\d+(?:\/[^\s]*)?)/` (capture full launch URL; bare-URL DSH still matches).
   - New exported `splitLaunchUrl(launchUrl): { base, token? }`.
   - `DshServerManager`: new fields `launchUrl` / `cookie` + getters `launchUrl` / `authCookie`; reset in `start()` and the child `exit` handler.
   - `settleReady` → `finishReady`: split URL, await `exchangeLaunchToken(launchUrl)` (GET launch URL, `redirect: "manual"`, expect 303 + `Set-Cookie`, keep `name=value`), then publish `ready` with the **base** URL. Exchange failure settles the start as an error (a token-authenticated server is unusable without the cookie). No token → no exchange, no cookie (pre-auth DSH no-op).
   - `api()`: attach `cookie` header when `this.cookie` is set.
2. **`src/bridgeCore.ts`** — `relayHttp` and `WsRelay` accept optional `cookieProvider`; inject `cookie` header on the relayed fetch and on the WebSocket upgrade (`new WebSocket(url, { headers })`).
3. **`src/bridgeHost.ts`** — accept optional `cookieProvider` (3rd ctor arg), forward to `relayHttp` and `WsRelay`.
4. **`src/dshPanel.ts` + `src/dshChatView.ts`** — pass `() => this.manager.authCookie` to `BridgeHost` and `assembleDocument`.
5. **`src/themeSync.ts` + `src/extension.ts`** — optional `getCookie` provider for the `settings.update` fetch; wired in `activate()`.
6. **`src/commands.ts`** — `dshmux.openBrowser` opens `manager.launchUrl ?? manager.serverUrl` (the token URL works in a real browser: 303 → cookie → 200; bare-URL DSH unchanged).
7. **Tests** — `parseUrlLine` token capture; `splitLaunchUrl`; live fake-dsh start with `?token=` (exchange via a real local HTTP exchange endpoint, `authCookie` set, `api()` sends the cookie); pre-auth bare-URL start stays cookie-less; `relayHttp`/`WsRelay` cookie forwarding; `assembleDocument` index fetch carries the cookie.
8. **Verify** — `npm run compile` (zero errors), `npm test`, and a live end-to-end run against the real checkout `dsh web` (isolated `DSH_HOME`): panel document assembles (index 200 with cookie) and `/api` + WS work.

## Verification

_(filled in after implementation)_
