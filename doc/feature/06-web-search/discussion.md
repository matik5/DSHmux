# 06-web-search — Discussion

**Date**: 2026-09-13

**Status**: CAPTURED — requirements approved in [req.md](req.md)

## User request

Ship an optional provider-neutral web-search MCP package with DSHmux. A user
must be able to install and enable it from Doctor in one explicit action on
macOS and Windows, after which DSH uses it for ordinary native web search
without accidentally spending DeepSeek search credits.

The product must also remain independently usable by other stdio MCP clients.
It supports two explicit keyless providers, several bring-your-own-key
providers, and a user-configured JSON endpoint.

An initial upstream-specific direction was rejected after the provider-policy
review. The user decided that the product must contain no hidden compatibility,
HTML parser, endpoint, test fixture, documentation, or marketing reference for
an unapproved upstream integration.

## Final product decisions

- Build one multi-provider `web_search` product, not separate search and
  knowledge products.
- Purili Keyless and Tavily Keyless are separate zero-account modes, each with
  its own one-action Doctor install-and-enable choice.
- Tavily BYOK, Brave Search BYOK, and Exa BYOK are explicit alternative modes.
- Custom JSON accepts a user-supplied endpoint and declarative mapping; it does
  not ship a pre-populated third-party endpoint.
- Built-in providers use documented official JSON APIs only.
- Provider failure never triggers silent fallback, especially not to paid
  DeepSeek search.
- DSHmux manages installation and launch configuration only for the DSH child
  it owns.

## Audited DSHmux facts

- DSHmux 0.4.7 declares `extensionKind: ["workspace"]`, so installation,
  configuration, secrets, and execution occur on the workspace extension host.
  In Remote SSH, WSL, and dev containers that host is remote rather than the
  local UI machine (`package.json:20-22`).
- The VSIX allow-list currently contains `out/**`, `media/**`, documentation,
  localization files, and `node_modules/ws/**`. It contains no web-search
  release payload (`package.json:31-42`).
- The only runtime dependency is `ws`; no MCP client SDK, package verifier, or
  search-provider implementation is present (`package.json:163-165`).
- No current DSHmux setting selects or configures a search provider
  (`src/configuration.ts:1-76`, `package.json:72-121`).
- DSHmux already resolves an external Node executable on macOS, Linux, and
  Windows and prepends its directory to the child `PATH`
  (`src/serverManager.ts:152-330`). JavaScript entries run through Node
  directly rather than VS Code's Electron executable.
- The managed-DSH installer already demonstrates versioned
  `globalStorageUri` paths, structured argv, Windows-safe npm launch, bounded
  output, cancellation, post-install validation, and Doctor progress
  (`src/dshInstallService.ts:49-167`,
  `src/installService.ts:102-277`). Search can reuse these patterns, but its
  embedded artifact should be copied rather than downloaded with npm.
- Doctor is currently assembled as a one-shot `showQuickPick`. Its items mix
  health rows and actions, and managed DSH repair opens a second confirmation
  dialog (`src/installService.ts:294-337`).
- `DshServerManager.start()` builds `web --port 0 [--no-open]` and appends
  `StartOptions.extraArgs` afterward
  (`src/serverManager.ts:39-50,581-640`).
- DSH launcher parsing stops launcher-option handling at the first app-owned
  argument. Therefore an owned `--patch` appended through `extraArgs` after
  `--port` would reach the Web app rather than the DSH profile composer.
  Search needs a dedicated launcher-overlay position before `--port`.
- Production starts all flow through the same manager:
  `src/extension.ts:110-114`, `src/commands.ts:23-31`,
  `src/launcherView.ts:559-562,621-629`,
  `src/dshChatView.ts:268-278`, and `src/dshPanel.ts:183-193`.
  A manager-owned launch policy can therefore cover every UI path.
- The manager exposes state, resolved DSH version/path, and workspace session
  summaries containing `running`
  (`src/serverManager.ts:538-568,977-1071`). These facts can gate a safe
  restart after install or provider switching.
- `stop()` owns only the manager's child and has platform-specific
  termination, but it is not awaitable
  (`src/serverManager.ts:1103-1140`). Starting a replacement before the old
  child's exit handler completes could corrupt the new child's shared state.
- The central string table requires a non-empty value in ten languages
  (`src/i18nStrings.ts:1-18`), enforced by `test/i18n.test.js`.
- DSHmux does not currently use VS Code `SecretStorage`; provider credential
  management is new work.

## Audited DSH 0.1.5-rc.2 facts

- The base composition mounts the provider-neutral `@deepseek-ai/dsh-web`
  service, selects `deepseek-official` for search, selects `http` for fetch,
  mounts the DeepSeek search provider, and exposes the native web tool
  (`packages/bundle/base/cordis.patch.yml:425-454` in the tested DSH
  checkout).
- The web service defines a registered provider contract with
  `id`, synchronous `available()`, and abortable
  `search({ query, maxResults }, signal)`. Results contain optional
  `content`, bounded `sources`, and `truncated`; sources contain URL plus
  optional title, snippet, and publication time
  (`packages/web/web/src/types.ts:10-56,98-108`).
- `WebRuntime` chooses the configured provider deterministically at execution
  time. Missing, unavailable, and ambiguous provider states are distinct
  failures, and the seam enforces the final result bound
  (`packages/web/web/src/index.ts:41-60,65-72,85-146`).
- The native `web_search` tool accepts one to four queries, sends one provider
  request per distinct query, merges concurrent results round-robin,
  deduplicates by URL, stores structured result metadata, labels result text
  untrusted, and preserves citation and `web_fetch` guidance
  (`packages/web/tool-web/src/search.ts:15-50,65-94,107-215,218-377`).
- The Web profile disables the host-level `tool-web` row because each agent
  preset mounts the same consumer. All those consumers call `ctx.web`, so
  changing the selected provider preserves the model-facing native tool
  (`packages/bundle/web-app/cordis.patch.yml:464-471` and
  `packages/preset/agent-presets/presets/*/agent.cordis.yml`).
- A generic MCP server tool is exposed as
  `mcp__<serverName>__<rawName>`
  (`packages/mcp/mcp-client/src/tools.ts:98-117`). Registering only a generic
  MCP server would create a second tool and leave the paid native provider
  selected, so it cannot satisfy the no-accidental-cost requirement.
- MCP servers are Cordis composition rows containing `serverName`,
  `transport: stdio`, `command`, `cwd`, and `env`; they are not
  `settings.yaml` records
  (`apps/cli/config/examples/mcp-memory/mcp-reference-memory.cordis.yml:1-13`).
- DSH applies repeatable `--patch` overlays after bundle, profile, and home
  layers (`apps/cli/src/args.ts:54-66,126-188`,
  `apps/cli/src/profile-boot.ts:194-243`).
- Required overlays fail when unreadable or malformed. Inserted absolute and
  relative plugin paths are converted to file URLs, including paths containing
  spaces and punctuation
  (`packages/boot/app-boot/src/index.ts:306-335`,
  `packages/boot/app-boot/tests/user-patches.spec.ts:91-150`).
- `dsh plugin` delegates package work to `pnpm`; it is not suitable as a
  zero-prerequisite Doctor installation path
  (`apps/cli/src/plugin.ts:114-162`).

## Provider research

### Purili

- Purili documents a public JSON Search API and hosted/stdio MCP options with
  no account or API key. Its current wording is **no fixed request quota**, not
  a guarantee of unlimited capacity
  ([Search API](https://puri.li/developer/documentation),
  [MCP documentation](https://puri.li/developer/mcp)).
- Core search results come from Purili's own index. The Search response exposes
  ranked URL, title, and description fields that fit the common normalized
  contract without HTML parsing.
- Its current terms limit use to personal, non-commercial purposes and prohibit
  bulk extraction of the index. Doctor must display this before the user
  selects Purili, and release preparation must recheck it
  ([Terms](https://puri.li/terms)).
- Purili is therefore a real keyless provider, but not a silent universal
  default or a provider that DSHmux can describe as commercially unrestricted.

### Tavily

- Tavily documents keyless Search and Extract with no account or API key.
  Direct Search uses `POST https://api.tavily.com/search` and the
  `X-Tavily-Access-Mode: keyless` request header. Successful keyless and keyed
  responses use the same schema
  ([keyless documentation](https://docs.tavily.com/documentation/keyless)).
- Tavily's published keyless allowance is 30 free searches per day. It does not
  publicly define the counting identity, reset instant, or an authoritative
  remaining-balance endpoint
  ([quota announcement](https://www.tavily.com/blog/agentic-distribution-your-stairway-to-heaven)).
- Search results expose title, URL, content snippet, score, and optional
  publication date. BYOK uses a Bearer credential
  ([Search API](https://docs.tavily.com/documentation/api-reference/endpoint/search)).
- Keyless is suitable as a zero-setup option but not as guaranteed production
  capacity. A quota error must stop locally and explain the next user action.

### Brave Search

- Brave requires an API key in the `X-Subscription-Token` header and recommends
  environment or secret-manager storage rather than hardcoding
  ([authentication](https://api-dashboard.search.brave.com/documentation/guides/authentication)).
- Its documented JSON API returns ranked Web results and is suitable as an
  explicit BYOK adapter. DSHmux must not create or activate a billing plan for
  the user.

### Exa

- Exa Search uses `POST https://api.exa.ai/search`, accepts a result bound, and
  can return highlights and publication dates. Authentication uses
  `x-api-key` or Bearer
  ([Search API](https://docs.exa.ai/reference/search)).
- Its provider-specific controls remain behind the adapter. The common model
  contract stays query plus a DSHmux-owned result bound.

### Custom JSON

- A user-configured endpoint is useful for self-hosted and organization-owned
  search services, but a URL field alone is insufficient: request placement,
  authentication header, result-array location, and field mapping vary.
- Executable transforms or arbitrary HTML parsing would turn configuration into
  host-code execution and recreate the policy and maintenance problems the
  provider-neutral design is intended to avoid.
- The safe initial contract is declarative JSON traversal, strict network
  bounds, secrets referenced separately, and explicit approval for
  loopback/private-network destinations.

## Distribution decision

Two distribution shapes were compared:

| Concern | Built only into DSHmux | Standalone package embedded by DSHmux |
|---|---|---|
| One-action setup | Possible | Possible when the tested artifact ships in the VSIX |
| Other MCP clients | Not reusable | Reusable through stdio MCP |
| Release identity | Coupled to DSHmux | Independently versioned and pinned by DSHmux |
| Source duplication | Likely | One package remains the source of truth |
| Offline install | Possible | Possible when the dependency-closed artifact is embedded |

The approved direction is one standalone package whose exact release artifact
is embedded in DSHmux. Doctor copies and verifies that artifact into versioned
extension storage; it never performs an implicit registry download.

## DSH integration decision

Distribution and DSH routing are separate concerns:

1. **Generic MCP only** would expose a namespaced second tool and leave DSH's
   existing native provider selected.
2. **Copied agent presets** could hide the native tool but would duplicate
   shipped DSH configuration and drift on upgrade.
3. **Generic MCP plus a DSH-native provider adapter** lets other clients use
   stdio MCP while DSHmux selects the same package behind DSH's existing
   `web_search`.

The approved direction is option 3. The DSH adapter registers one stable
DSHmux-owned provider backed by the same normalized provider router as the MCP
entry. DSHmux supplies a launch-only overlay, so it does not rewrite the user's
home patch, profile, preset, or settings files.

## Security and ownership conclusions

- Provider selection and endpoint configuration are user-controlled product
  settings, never model tool arguments.
- Built-in API hosts are fixed and use HTTPS with redirects rejected.
- Custom JSON public endpoints use HTTPS. Loopback or private-network access
  requires an explicit user action and cannot be granted by the model.
- Response bytes, redirects, time, result count, query length, and mapping
  traversal are bounded.
- BYOK values live in VS Code SecretStorage and are injected only for the
  selected provider. They never enter owned JSON, overlays, logs, or UI detail.
- Provider errors are terminal for that request. There is no implicit failover.
- Release preparation rechecks every built-in provider's current terms,
  pricing class, quota, attribution, and privacy requirements.

## Approved requirement boundary

The user approved [req.md](req.md) on 2026-09-13 and corrected the omitted
Purili mode the same day, with these gates:

1. one independently versioned multi-provider MCP package;
2. separate one-action Doctor choices for Purili Keyless and Tavily Keyless;
3. Tavily, Brave Search, and Exa as explicit BYOK modes;
4. provider-neutral Custom JSON with no hidden default;
5. a DSH-native adapter that deterministically replaces paid native search;
6. no HTML search parser, undocumented API, disguised integration, or silent
   provider fallback; and
7. DSHmux-owned launch configuration only.
