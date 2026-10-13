# 06-web-search — Solution

**Date**: 2026-09-13

**Status**: DRAFT — awaiting user approval

**Sources**: [discussion.md](discussion.md), [req.md](req.md)

## 1. Goal

Build one independently versioned, provider-neutral package named
`@matik5/web-search-mcp` in a new clean source repository at
`/Users/mati/proj/my_mcps/provider_web_search/`. The package exposes:

1. a generic stdio MCP server for any compatible client; and
2. a self-contained DSH provider entry for DSHmux-owned DSH launches.

Both entries use one normalized search core and the same provider adapters.
The release build produces one dependency-closed artifact. DSHmux vendors the
exact artifact into its VSIX, copies and verifies it into workspace-host
global storage after one explicit Doctor action, and selects the DSH adapter
through an owned launch-only overlay.

The first-release provider set is:

| Provider id | Authentication | Endpoint ownership |
|---|---|---|
| `purili-keyless` | none | fixed official API |
| `tavily-keyless` | none | fixed official API |
| `tavily` | user secret | fixed official API |
| `brave` | user secret | fixed official API |
| `exa` | user secret | fixed official API |
| `custom-json` | optional user secret | explicit user configuration |

There is no automatic fallback. The selected provider is the only upstream
contacted for a search.

### 1.1 Package architecture

```text
@matik5/web-search-mcp source
  |
  +-- config + contracts + bounded JSON transport
  |
  +-- provider router
  |     +-- Purili keyless
  |     +-- Tavily keyless / BYOK
  |     +-- Brave Search BYOK
  |     +-- Exa BYOK
  |     +-- Custom JSON
  |
  +-- dist/mcp-server.mjs ----- stdio MCP ----- generic clients
  |
  +-- dist/dsh-provider.mjs --- ctx.web ------- DSH native web_search
  |
  +-- artifact-manifest.json
                  |
                  +-- DSHmux resources/web-search/<version>/package/
                                   |
                                   +-- verified copy to globalStorage
                                   +-- owned DSH launch overlay
```

The new repository starts with clean history and does not import earlier
upstream-specific source. The package working version is `0.1.0`; registry
name ownership is checked again before publication.

### 1.2 Normalized search contract

The internal core uses a provider-neutral contract:

```ts
type ProviderId =
  | "purili-keyless"
  | "tavily-keyless"
  | "tavily"
  | "brave"
  | "exa"
  | "custom-json";

interface SearchRequest {
  query: string;
  maxResults: number; // 1..10
}

interface SearchSource {
  url: string;
  title?: string;
  snippet?: string;
  score?: number;
  publishedAt?: string;
}

interface SearchResult {
  provider: ProviderId;
  query: string;
  sources: SearchSource[];
  truncated: boolean;
}
```

The core trims and validates a non-empty query of at most 512 Unicode code
points, clamps the result count to 1–10, accepts only HTTP(S) result URLs,
removes URL fragments, normalizes scheme/host/default ports, deduplicates by
that normalized URL, and preserves the first upstream occurrence. It does not
remove query parameters or invent titles, snippets, scores, or dates.

The generic MCP tool contract is:

```ts
web_search({ query: string, top_k?: number /* 1..10, default 8 */ })
```

It returns a model-readable text block containing the external-content warning,
source links, and citation instruction, plus `SearchResult` as structured
content. The DSH adapter projects the same result to
`WebSearchResult.sources`. DSH's current provider interface has no score
field, so score remains available in MCP structured output but is deliberately
omitted from the native DSH projection rather than encoded into another field.

### 1.3 Runtime configuration

The package consumes one versioned, non-secret JSON document:

```ts
interface WebSearchRuntimeConfigV1 {
  schemaVersion: 1;
  provider: ProviderId;
  maxResults: number;
  custom?: CustomJsonConfigV1;
}

interface CustomJsonConfigV1 {
  endpoint: string;
  method: "GET" | "POST";
  query: { location: "query" | "json"; name: string };
  limit?: { location: "query" | "json"; name: string };
  staticHeaders?: Record<string, string>;
  auth?: { header: string; prefix?: string };
  response: {
    itemsPath: string[];
    fields: {
      url: string[];
      title?: string[];
      snippet?: string[];
      score?: string[];
      publishedAt?: string[];
    };
  };
  allowPrivateNetwork?: boolean;
}
```

Path arrays perform bounded own-property traversal only. They do not support
JSONPath expressions, filters, prototypes, scripts, templates, regular
expressions, or dynamic imports. `itemsPath` must resolve to an array.
`url` must resolve to a string; other mapped fields are optional and
type-checked.

`staticHeaders` rejects `authorization`, `cookie`,
`proxy-authorization`, `host`, `content-length`, connection-management
headers, control characters, and duplicate names under case folding. A secret
header is declared separately by `auth`; its value comes only from the
dedicated runtime secret environment variable.

DSHmux stores the validated non-secret document below its global storage and
stores provider credentials in VS Code SecretStorage. On launch it injects
only the selected provider's secret as
`DSHMUX_WEB_SEARCH_CREDENTIAL`. The package does not inspect unrelated
provider or chat credential variables. Generic MCP users pass the same
dedicated variable or an explicit `--credential-env <name>` reference.

### 1.4 Provider adapters

#### Tavily

Both Tavily modes use `POST https://api.tavily.com/search` with
`search_depth: "basic"`, `max_results`, and answer/raw-content/image output
disabled. Keyless mode sends the documented keyless access header and no
`Authorization` header. BYOK sends only the Bearer credential.

The adapter maps `results[].url`, `title`, `content`, `score`, and
`published_date`. It recognizes provider quota and throttle responses,
projects any valid retry delay, and never retries them. Product metadata records
the currently published keyless allowance of 30 searches per day, while the
server remains authoritative.

#### Purili

The Purili adapter uses the documented `POST https://puri.li/api/search`
JSON endpoint with `q`, `page: 1`, and `exact: false`. It sends no
authorization header or credential. It maps `results[].url`, `title`, and
`description`, preserves upstream order, and truncates the returned page to
the normalized `maxResults` bound. The public response has no relevance-score
field, so the adapter does not invent one.

The adapter calls Search only. It does not automatically call Context,
Suggest, Infocard, Images, News, or site-submission endpoints; native DSH
`web_fetch` remains the explicit full-page follow-up path. Although Purili also
publishes a hosted and npm MCP server, this package does not nest one MCP
session inside another. Direct use of the documented JSON Search API lets the
generic MCP entry and DSH-native entry share the same bounded adapter.

Product metadata records Purili's current statements that the public API is
free, needs no API key, and has no fixed request quota. The UI says **no fixed
quota**, never **unlimited**. It also records the current personal,
non-commercial eligibility and bulk-extraction restriction from Purili's
terms. A throttle or other upstream refusal is returned without retry or
fallback.

#### Brave Search

The Brave adapter uses the documented Web Search JSON endpoint with query and
count parameters and supplies the selected secret only through
`X-Subscription-Token`. It maps ranked `web.results` entries to URL, title,
and description snippet. Provider-only fields are ignored unless they have a
lossless normalized equivalent.

#### Exa

The Exa adapter uses `POST https://api.exa.ai/search`, Bearer authentication,
`type: "auto"`, `numResults`, and one requested highlight per result. It maps
URL, title, first non-blank highlight, provider score when present, and
`publishedDate`. It neither requests nor returns full page text.

#### Custom JSON

The custom adapter constructs exactly one GET query or POST JSON request from
the validated configuration. Query text and result limit are inserted as data;
they cannot alter the endpoint, authority, protocol, headers, mapping, or
private-network permission.

A public endpoint must use HTTPS. Literal and DNS-resolved loopback, private,
link-local, multicast, unspecified, and cloud-metadata destinations are blocked
unless the user explicitly enables private-network access for that exact
configured authority. Redirects are rejected rather than followed. For direct
connections, the validated address set is pinned through the HTTP dispatcher's
lookup hook. When a standard proxy is selected, Doctor states that the trusted
proxy performs the final connection and name resolution.

### 1.5 Bounded network and error model

One shared JSON transport owns:

- a 20-second total request/body budget;
- caller cancellation fused into the active request;
- a 2 MiB decoded-body cap enforced while streaming;
- JSON content-type and UTF-8 validation;
- redirects disabled;
- explicit fixed HTTPS authorities for built-in providers;
- standard `HTTPS_PROXY`, `HTTP_PROXY`, and `NO_PROXY` support;
- bounded error-body capture with credential redaction; and
- no automatic retries.

The core throws a typed `SearchError` with stable codes:

```ts
type SearchErrorCode =
  | "INVALID_CONFIG"
  | "INVALID_QUERY"
  | "AUTH_REQUIRED"
  | "AUTH_REJECTED"
  | "RATE_LIMITED"
  | "QUOTA_EXHAUSTED"
  | "ENDPOINT_BLOCKED"
  | "TIMEOUT"
  | "ABORTED"
  | "INVALID_RESPONSE"
  | "UPSTREAM_ERROR";
```

Errors may carry a bounded public message, HTTP status, and
`retryAfterSeconds`; they never contain request headers or credentials. MCP
maps these to a failed tool result with structured error metadata. The DSH
entry throws an error with the same stable `code`, which DSH's open-string
web error contract permits consumers to surface.

### 1.6 Release artifact

The package build emits:

```text
release/package/
  package.json
  LICENSE
  THIRD_PARTY_NOTICES.md
  README.md
  dist/mcp-server.mjs
  dist/dsh-provider.mjs
  artifact-manifest.json
```

Both entries are bundled ESM with no unresolved non-Node runtime import. The
minimum Node version is `22.19.0`, matching the tested DSH runtime. The build
fails if a bundle contains a bare runtime dependency.

`artifact-manifest.json` has this contract:

```ts
interface WebSearchArtifactManifestV1 {
  schemaVersion: 1;
  package: { name: "@matik5/web-search-mcp"; version: "0.1.0" };
  mcp: {
    entry: "dist/mcp-server.mjs";
    serverName: "dshmux-web-search";
    serverVersion: "0.1.0";
    toolName: "web_search";
  };
  dsh: {
    entry: "dist/dsh-provider.mjs";
    providerId: "dshmux-web-search";
    supportedVersions: ["0.1.5-rc.2"];
  };
  providers: ProviderId[];
  files: Array<{ path: string; bytes: number; sha256: string }>;
}
```

The manifest lists every release file except itself. Paths are relative,
slash-normalized, traversal-free, unique under case folding, and regular files.
DSHmux pins the expected manifest digest and package version in source; trusting
hashes from an unpinned mutable manifest would not establish integrity.

A package-owned vendor script verifies the manifest and copies the exact
release directory to DSHmux
`resources/web-search/0.1.0/package/`. Generated release bytes are committed,
so an ordinary DSHmux build does not require the package repository or network.

### 1.7 DSHmux managed state and installation

Managed files use immutable generations:

```text
<globalStorage>/managed-web-search/
  state.json
  0.1.0/
    <generation-id>/
      package/...
      runtime-config.json
      dshmux-web-search.patch.json
```

`state.json` contains no secret:

```ts
interface ManagedWebSearchStateV1 {
  schemaVersion: 1;
  enabled: boolean;
  provider: ProviderId;
  maxResults: number;
  custom?: CustomJsonConfigV1;
  installed?: {
    version: "0.1.0";
    generation: string;
    manifestSha256: string;
  };
}
```

Every path is reconstructed under the known storage root. Generation IDs use a
closed safe-character grammar. State and runtime config updates use a sibling
temporary file, fsync where supported, and atomic rename. A new generation
becomes current only after all verification succeeds. A generation used by a
live child is retained until that child exits.

Each one-action keyless Doctor install:

1. shows package/version, host, destination class, code-execution trust,
   selected upstream, privacy/terms links, the provider's published quota
   statement, and any eligibility restriction;
2. verifies the embedded payload against the source-pinned manifest digest;
3. copies only expected regular files into a fresh generation while enforcing
   file count, size, path, symlink, and cancellation bounds;
4. verifies every copied byte and package/server version;
5. runs a package config check for the selected keyless provider without making
   a search;
6. spawns the MCP entry with the resolved external Node executable;
7. completes bounded MCP `initialize`, `notifications/initialized`, and
   `tools/list`, checking server name/version and the `web_search` schema;
8. writes the non-secret runtime config and DSH overlay;
9. atomically enables the verified generation; and
10. starts, safely restarts, or reports restart required for the owned DSH
    child.

Install verification does not spend one of the user's daily searches. A
bounded live query is a release smoke, not an end-user installation step.

Repair repeats the flow into a new generation. Upgrade is explicit and
version-pinned. Neither action invokes npm, pnpm, Git, an OS package manager, or
elevation.

### 1.8 DSH launch overlay

For a compatible verified selection, DSHmux writes JSON that is also valid YAML:

```json
[
  {
    "id": "web",
    "config": {
      "searchProvider": "dshmux-web-search",
      "fetchProvider": "http"
    }
  },
  {
    "insert": [
      {
        "id": "dshmux-web-search-provider",
        "name": "<absolute workspace-host path>/dist/dsh-provider.mjs",
        "config": {
          "configPath": "<absolute workspace-host path>/runtime-config.json",
          "credentialEnv": "DSHMUX_WEB_SEARCH_CREDENTIAL"
        }
      }
    ]
  }
]
```

The existing DeepSeek provider may remain registered, but the `web` service
selects only `dshmux-web-search`. The generic MCP server is not also mounted
inside DSH, so the model sees one native `web_search`, not a competing
namespaced tool. `fetchProvider: "http"` is restated because the patch replaces
the existing row's complete config.

The overlay is passed only to DSHmux's child. DSHmux does not modify
`settings.yaml`, `$DSH_HOME/cordis.patch.yml`, profile manifests, or agent
presets.

### 1.9 Launch policy and safe restart

Add a manager-owned launch policy evaluated after DSH binary/version resolution:

```ts
interface DshLaunchPolicy {
  patchFiles: readonly string[];
  env: Readonly<Record<string, string>>;
  fingerprint?: string;
}

type DshLaunchPolicyProvider = (input: {
  dshBin: string;
  dshVersion?: string;
}) => DshLaunchPolicy;
```

The manager places overlays in the launcher region:

```ts
const args = ["web"];
for (const file of policy.patchFiles) args.push("--patch", file);
args.push("--port", "0");
if (passNoOpen) args.push("--no-open");
args.push(...(opts.extraArgs ?? []));
```

`extraArgs` retains its current Web-app-argument meaning. Because the policy
belongs to the manager, all current start call sites receive it without
duplicated UI logic.

Policy outcomes are:

- feature disabled: no overlay or credential;
- enabled, exact compatible DSH, verified generation/config: one overlay and
  only the selected provider credential;
- enabled, compatible DSH, corrupt or missing owned files: reject start with a
  Doctor repair error rather than silently exposing paid search;
- enabled, unsupported DSH: launch original DSH without an overlay and report
  the search product as incompatible, not ready;
- selected BYOK provider with missing credential: apply the selected provider
  overlay so native search fails unavailable, while Doctor reports
  missing-credential; never choose another provider.

Add an awaitable `restart()` that records the exact child, calls the existing
termination path, awaits that child's exit with escalation, and only then
starts a replacement. It checks process exit rather than `child.killed`,
because the latter only says a signal was sent.

After install or provider change:

1. stopped/error with no live child: start immediately;
2. ready and no workspace session reports `running`: await restart;
3. a running session, failed safety probe, starting, or stopping: retain the
   change and report restart required;
4. the next ordinary DSHmux start applies the committed selection.

The manager records the active policy fingerprint so Doctor cannot label a
running child ready for configuration it has not loaded.

### 1.10 Doctor and provider management

Keep the existing DSH dependency report and add a separate pure
`WebSearchDoctorReport`:

```ts
type WebSearchDoctorState =
  | "disabled"
  | "installable"
  | "installing"
  | "ready"
  | "rate-limited"
  | "missing-credential"
  | "repairable"
  | "incompatible"
  | "restart-required";
```

Doctor shows:

- the existing paid search row and whether it is currently selected;
- **Web Search MCP**, exact package version, selected provider, and health;
- **Install & enable Purili Keyless** and **Install & enable Tavily Keyless**
  for a fresh install;
- provider-selection actions for Purili Keyless, Tavily Keyless, Tavily BYOK,
  Brave Search, Exa, and Custom JSON;
- secure add/replace/delete credential actions for BYOK modes;
- configure/test actions for Custom JSON; and
- restart/repair/disable actions appropriate to state.

Each fresh-install action selects its named keyless provider without another
provider dialog. The Purili item includes its personal, non-commercial use
restriction in the visible detail before acceptance. BYOK provider changes and
Custom JSON configuration are separate deliberate actions.
A long-lived `createQuickPick` controller keeps Doctor open during install,
serializes accepts, shows `busy`/installing state, and refreshes the row after
completion.

Secret entry uses a password input and writes directly to
`context.secrets`. It never passes through the output channel, ordinary
configuration, or a QuickPick detail. Deleting a credential affects only its
provider key.

All new user-facing strings are supplied in every language supported by
`src/i18nStrings.ts`. Provider names remain proper nouns; states, warnings,
actions, privacy copy, and quota explanations are localized.

### 1.11 Release policy

Before each public package or VSIX release:

- recheck official endpoint, authentication, terms, privacy, attribution,
  pricing class, and quota information for each built-in provider;
- verify the package name and license/third-party notices;
- run deterministic package, MCP, DSH-contract, DSHmux, and artifact tests;
- run bounded live smoke queries only with explicit test credentials where
  required;
- inspect both npm dry-run and VSIX contents; and
- require explicit publication authorization.

A changed provider policy blocks that adapter's release. It does not activate a
hidden endpoint or fallback.

## 2. Facts

### 2.1 DSHmux facts

- DSHmux is a workspace extension
  (`package.json:20-22`), so `extensionUri`, `globalStorageUri`, processes,
  and SecretStorage belong to the workspace extension host.
- The VSIX currently ships no web-search artifact
  (`package.json:31-42`) and has only `ws` as a runtime dependency
  (`package.json:163-165`).
- Search has no current configuration surface
  (`src/configuration.ts:1-76`, `package.json:72-121`).
- Existing managed installation primitives prove versioned global storage,
  structured Windows-safe argv, cancellation, 64 KiB log bounds, and
  post-install validation
  (`src/dshInstallService.ts:49-167`,
  `src/installService.ts:102-277`).
- Doctor is currently a one-shot QuickPick
  (`src/installService.ts:294-337`).
- The manager resolves real Node and preserves child `PATH`
  (`src/serverManager.ts:152-330`).
- Current launch argv appends `extraArgs` after `web --port 0 [--no-open]`
  (`src/serverManager.ts:39-50,581-640`).
- Every production start flows through the one manager; the five call sites are
  listed in the call-site audit below.
- Manager state and workspace session summaries expose enough information for a
  conservative restart decision
  (`src/serverManager.ts:538-568,977-1071`).
- `stop()` is non-awaitable and owns the cross-platform termination path
  (`src/serverManager.ts:1103-1140`).
- No source currently reads or writes `context.secrets`; secret handling is a
  new contract.

### 2.2 DSH facts

- The tested DSH 0.1.5-rc.2 base selects `deepseek-official` search and
  `http` fetch while exposing the native tool
  (`packages/bundle/base/cordis.patch.yml:425-454`).
- `WebSearchProvider` and `WebSearchResult` have the exact shapes used in
  section 1
  (`packages/web/web/src/types.ts:10-56,98-108`).
- `WebRuntime` resolves configured provider IDs deterministically and forwards
  cancellation
  (`packages/web/web/src/index.ts:41-60,65-72,85-146`).
- Native `web_search` owns the query count, merge, result cap, untrusted-data
  warning, citation guidance, persistence metadata, and card presentation
  (`packages/web/tool-web/src/search.ts:15-50,65-94,107-215,218-377`).
- Generic MCP tool names are namespaced
  (`packages/mcp/mcp-client/src/tools.ts:98-117`), so generic MCP alone cannot
  replace native paid search.
- MCP composition belongs in Cordis rows, not `settings.yaml`
  (`apps/cli/config/examples/mcp-memory/mcp-reference-memory.cordis.yml:1-13`).
- `--patch` is repeatable and precedes app arguments
  (`apps/cli/src/args.ts:54-66,126-188`); late launcher options are passed to
  the app (`apps/cli/tests/args.spec.ts:35-57`).
- Overlays are required files, and inserted absolute plugin paths are converted
  safely to file URLs
  (`packages/boot/app-boot/src/index.ts:306-335`,
  `packages/boot/app-boot/tests/user-patches.spec.ts:91-150`).
- `dsh plugin` shells out to pnpm
  (`apps/cli/src/plugin.ts:114-162`), so it does not satisfy the embedded
  one-action install requirement.

### 2.3 Provider facts

- Tavily explicitly documents keyless Search with no account/key, the keyless
  header, identical successful schema, and structured quota guidance
  ([keyless access](https://docs.tavily.com/documentation/keyless)).
- Tavily publishes 30 free keyless searches per day but does not publish the
  quota identity or exact reset boundary
  ([quota announcement](https://www.tavily.com/blog/agentic-distribution-your-stairway-to-heaven)).
- Tavily Search returns ranked JSON results with URL, title, content, score,
  and optional publication date; BYOK uses Bearer authentication
  ([Search API](https://docs.tavily.com/documentation/api-reference/endpoint/search)).
- Purili documents its public JSON Search API as free, requiring no account or
  API key, and having no fixed request quota. Search returns ranked results
  from its independent index with URL, title, and description
  ([Search API](https://puri.li/developer/documentation)).
- Purili separately publishes a hosted Streamable HTTP MCP endpoint and an npm
  stdio MCP server, both unauthenticated
  ([MCP documentation](https://puri.li/developer/mcp)).
- Purili's current terms limit service use to personal, non-commercial purposes
  and prohibit bulk extraction of its index
  ([Terms](https://puri.li/terms)).
- Brave requires a key in `X-Subscription-Token` and advises secure storage
  ([authentication](https://api-dashboard.search.brave.com/documentation/guides/authentication)).
- Exa Search accepts `numResults`, supports highlights and publication dates,
  and accepts `x-api-key` or Bearer authentication
  ([Search API](https://docs.exa.ai/reference/search)).

## 3. Gap

No provider-neutral search package or release payload currently ships in
DSHmux. Doctor has no search-product state, provider selector, SecretStorage
flow, embedded-artifact verifier, or MCP probe. DSHmux owns no search
configuration and cannot currently place a `--patch` before Web-app
arguments.

Generic MCP registration would leave native paid search selected. Reusing
`extraArgs` would place the overlay in the wrong argv region. A provider
switch cannot safely restart the current child because `stop()` is not
awaitable. Custom JSON additionally needs a real declarative schema, network
boundary, and secret boundary; a URL text field alone would not meet the
approved security requirements.

The target architecture in section 1 closes each gap without modifying
user-owned DSH files, duplicating the model-facing tool, downloading code at
install time, or adding a fallback provider.

## 4. Call-site audit

| Changed contract | Current call sites | Classification and required adaptation |
|---|---|---|
| `DshServerManager` gains an optional `DshLaunchPolicyProvider` | Construction at `src/extension.ts:31-34`; test constructions in `test/serverManager.test.js` | **Compatible after adaptation**: production passes the WebSearch service policy; the argument remains optional for existing tests and isolated managers. |
| Manager launch argv inserts policy `--patch` before `--port` | `src/extension.ts:110-114` | **Compatible**: automatic restart gains the same verified policy. |
| Same manager-owned launch policy | `src/commands.ts:23-31` | **Compatible**: command start signature stays unchanged. |
| Same manager-owned launch policy | `src/launcherView.ts:559-562,621-629` | **Compatible**: explicit and automatic launcher starts cannot bypass policy. |
| Same manager-owned launch policy | `src/dshChatView.ts:268-278` | **Compatible**: chat placeholder start gains policy automatically. |
| Same manager-owned launch policy | `src/dshPanel.ts:183-193` | **Compatible**: editor placeholder start gains policy automatically. |
| `StartOptions.extraArgs` remains app-owned and late | Definition/use only at `src/serverManager.ts:39-50,629`; repository search finds no caller | **Compatible**: do not repurpose it, so any future Web-app arguments preserve their semantics. |
| Manager policy may add one selected secret to child env | Environment construction at `src/serverManager.ts:617-633`; `spawnEnvironment` users at `src/installService.ts:122-199` | **Compatible after isolation**: policy env is merged only in DSH start; managed npm launch retains its current environment contract. Logs never serialize the policy env. |
| New awaitable `restart()` supplements `stop(): void` | Stop callers at `src/commands.ts:33-36`, `src/launcherView.ts:563-565`, `src/dshChatView.ts:275-277`, `src/dshPanel.ts:190-192`, `src/extension.ts:215-229` | **Compatible**: existing callers keep `stop()`; Doctor alone uses `restart()`. |
| `runDoctorCommand` receives WebSearch dependencies | Production at `src/extension.ts:146-148`; recursive refresh at `src/installService.ts:330-333`; tests in `test/installService.test.js` | **Conflict, adapted**: pass manager/service/root in production and preserve an optional dependency object for DSH-only tests. |
| VSIX file allow-list adds release resources | `package.json:31-42` | **Compatible**: additive packaging change; verify the VSIX contains only the manifest-listed artifact. |
| DSH `web` row selects `dshmux-web-search` | Host and preset `tool-web` consumers in tested DSH 0.1.5-rc.2 | **Compatible**: every consumer calls `ctx.web`; restating `fetchProvider: http` preserves fetch. |
| Package normalized result includes optional score | Generic MCP structured output and DSH provider projection | **Compatible with explicit projection**: MCP retains score; DSH omits it because `WebSearchSource` has no score member. No field is overloaded. |

No production DSHmux start bypasses the manager. No existing DSHmux source
depends on a search config or SecretStorage key, because neither exists.

## 5. Tasks

### T1 — Create the clean standalone package and reproducible build

**Files**:
`/Users/mati/proj/my_mcps/provider_web_search/package.json` (new),
`pnpm-lock.yaml` (new), `tsconfig.json` (new), `LICENSE` (new),
`THIRD_PARTY_NOTICES.md` (new), `README.md` (new),
`scripts/build.mjs` (new), `scripts/createArtifactManifest.mjs` (new)

- Initialize an independent repository and package identity.
- Pin runtime/build dependencies and Node `>=22.19.0`.
- Bundle both runtime entries and reject unresolved bare imports.
- Generate the release manifest from the final bytes.
- Document stdio setup for every provider mode without shell interpolation.

### T2 — Implement normalized contracts, validation, and bounded transport

**Files**:
`src/contracts.ts` (new), `src/config.ts` (new),
`src/errors.ts` (new), `src/url.ts` (new), `src/httpJson.ts` (new),
`test/config.test.ts` (new), `test/httpJson.test.ts` (new),
`test/url.test.ts` (new)

- Implement the section 1.2 and 1.3 contracts.
- Implement declarative own-property JSON traversal.
- Enforce query/result/response/time/protocol/header bounds.
- Implement public-address classification, exact-authority private opt-in,
  pinned direct lookup, and documented proxy behavior.
- Implement stable redacted error taxonomy and cancellation.

### T3 — Implement and fixture-test all provider adapters

**Files**:
`src/providers/purili.ts` (new), `src/providers/tavily.ts` (new),
`src/providers/brave.ts` (new), `src/providers/exa.ts` (new),
`src/providers/customJson.ts` (new),
`src/providerRouter.ts` (new), `test/providers/*.test.ts` (new),
`test/fixtures/providers/**` (new)

- Map each official JSON contract without silent field invention.
- Prove both keyless adapters send no credential; verify Purili's documented
  mapping and Tavily's documented keyless header independently.
- Prove BYOK credentials reach only the selected official host/header.
- Cover success, empty, invalid, auth, quota, throttle, abort, timeout, and
  malformed-response fixtures.
- Prove Custom JSON cannot execute code, parse HTML, or modify endpoint details
  from query input.

### T4 — Add generic MCP and native DSH runtime entries

**Files**:
`src/mcpServer.ts` (new), `src/mcpPresentation.ts` (new),
`src/dshProvider.ts` (new), `test/mcp.e2e.ts` (new),
`test/dsh-provider.contract.test.ts` (new)

- Expose exactly one MCP `web_search` tool and structured output.
- Add bounded CLI/config parsing and a no-network config-check mode.
- Export a self-contained Cordis `apply` entry registering
  `dshmux-web-search` with `ctx.web`.
- Compile-check against the exact DSH interface and run contract tests against
  the tested DSH packages.
- Assert native search dispatches only the selected adapter and retains native
  result/citation behavior.

### T5 — Vendor and pin the release artifact in DSHmux

**Files**:
`/Users/mati/proj/my_mcps/provider_web_search/scripts/vendorToDshmux.mjs`
(new), `resources/web-search/0.1.0/package/**` (generated),
`package.json:31-42`,
`src/webSearchRelease.ts` (new),
`test/webSearchRelease.test.js` (new)

- Verify the package manifest and copy the exact release bytes.
- Add only the versioned resource tree to the VSIX allow-list.
- Pin expected package/server/provider identities and manifest digest.
- Test traversal, case collision, symlink, missing/extra file, size, and digest
  failures.

### T6 — Add managed state, configuration, and SecretStorage ownership

**Files**:
`src/webSearchState.ts` (new), `src/webSearchSecrets.ts` (new),
`src/webSearchService.ts` (new),
`test/webSearchState.test.js` (new),
`test/webSearchSecrets.test.js` (new),
`test/webSearchService.test.js` (new)

- Implement validated state and immutable generation paths below
  `globalStorageUri`.
- Implement atomic non-secret state/runtime-config writes.
- Store, replace, retrieve, and delete per-provider secrets only through
  `context.secrets`.
- Generate a launch policy containing verified overlay paths and only the
  selected credential.
- Track desired and active policy fingerprints.

### T7 — Implement copy verification and a real bounded MCP probe

**Files**:
`src/webSearchInstallService.ts` (new), `src/mcpProbe.ts` (new),
`test/webSearchInstallService.test.js` (new),
`test/mcpProbe.test.js` (new)

- Copy the embedded artifact into a fresh generation with cancellation and
  bounds.
- Run package config validation without making a live search.
- Complete MCP initialize/initialized/tools-list and verify exact identities
  and schema.
- Close and await the probe child on success, timeout, cancellation, protocol
  failure, and extension disposal.
- Commit state only after all checks succeed.

### T8 — Apply the DSH overlay centrally and add safe restart

**Files**:
`src/serverManager.ts:39-50,520-690,1103-1150`,
`src/extension.ts:24-35,106-114,138-148,215-229`,
`test/serverManager.test.js:168-255,497-590`

- Add the optional launch-policy provider.
- Insert verified `--patch` arguments before `--port`.
- Merge only policy-owned environment values without logging them.
- Record the active policy fingerprint.
- Add awaitable exact-child restart and race-safe exit cleanup.
- Test POSIX/Windows argv, spaces/non-ASCII paths, corrupt selection, unsupported
  DSH, credential isolation, and every restart/defer state.

### T9 — Add Doctor state, provider UX, and localization

**Files**:
`src/webSearchDoctor.ts` (new),
`src/installService.ts:33-55,219-337`,
`src/i18nStrings.ts:1-18,517-963`,
`src/extension.ts:138-148`,
`test/webSearchDoctor.test.js` (new),
`test/installService.test.js:225-337`,
`test/i18n.test.js`

- Implement the pure state model and long-lived serialized QuickPick flow.
- Add separate one-action installs for both keyless providers, provider picker,
  secure credential actions, Custom JSON configuration, repair, disable, and
  safe restart/defer.
- Display provider, trust, host, endpoint class, privacy/terms, pricing class,
  current keyless quota facts, and Purili's use eligibility restriction.
- Keep secrets and full custom headers out of details and logs.
- Supply all new strings in ten languages.

### T10 — Close verification and release gates

**Files**:
`test/webSearchIntegration.test.js` (new),
`.github/workflows/**` (as audited during planning),
`doc/feature/06-web-search/verification.md` (new),
`doc/feature/06-web-search/summary.md` (new),
`doc/feature/06-web-search/TODO.md` (generated after plan review)

- Prove native DSH search reaches only the selected provider.
- Prove no error path dispatches paid search or a different adapter.
- Run macOS, Windows, Linux, and remote-host seam coverage.
- Run package dry-run, license/dependency audit, bounded provider smokes, full
  DSHmux tests, and VSIX content/install inspection.
- Record current provider policy review and explicit publication authorization.
- Complete verification, update plan states, and mechanically generate TODO.
