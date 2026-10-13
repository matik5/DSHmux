# 06-web-search — Requirements

**Date**: 2026-09-13

**Status**: APPROVED (2026-09-13, corrected provider set)

**Sources**: [discussion.md](discussion.md),
[Tavily keyless access](https://docs.tavily.com/documentation/keyless),
[Tavily keyless daily quota](https://www.tavily.com/blog/agentic-distribution-your-stairway-to-heaven),
[Purili Search API](https://puri.li/developer/documentation),
[Purili MCP](https://puri.li/developer/mcp),
[Purili Terms](https://puri.li/terms),
[Brave Search API](https://api-dashboard.search.brave.com/documentation),
[Exa API](https://docs.exa.ai/reference/getting-started)

## Revision note

The previously approved single-provider requirements are superseded. This
revision defines one provider-neutral web-search product with several explicit
provider modes and was approved by the user on 2026-09-13.

The user corrected an omission on 2026-09-13: Purili Keyless was part of the
requested first-release provider set. This revision restores that explicit
keyless mode and gives each keyless provider its own one-action Doctor choice.

## Intent

Give DSH sessions launched by DSHmux a provider-neutral web-search path that is
shipped with DSHmux, can be installed and enabled from Doctor in one explicit
action on macOS and Windows, works on the actual workspace host, and does not
accidentally spend DeepSeek search credits.

The first release supports zero-account Purili Keyless and Tavily Keyless
modes, explicit BYOK modes for Tavily, Brave Search, and Exa, plus a
user-configured JSON search endpoint. Preserve a portable stdio MCP surface for
other compatible clients.

## R1 — Provider-neutral search contract

- One independently installable product exposes a stable `web_search` tool.
- The tool accepts a required query and a bounded result count. Optional
  provider-specific capabilities are exposed only when they have a documented,
  portable meaning.
- Each normalized result contains at least a title and canonical URL, plus a
  content snippet and relevance score when the selected provider supplies them.
- Results remain in upstream rank order and are deduplicated by canonical URL.
- Search result text is explicitly treated as external, untrusted content. The
  model is told to cite relevant result URLs and may use DSH's existing
  `web_fetch` for full-page follow-up.
- An unsupported parameter fails clearly or is reported as unsupported. It is
  not silently reinterpreted with a different provider-specific meaning.
- Empty, malformed, rate-limited, blocked, timed-out, cancelled, and offline
  searches fail clearly and within bounded time; they never become fabricated
  success or an unbounded retry loop.
- Network responses have a bounded byte size, redirect count, and accepted
  protocol. Cancellation reaches the active request, and standard proxy
  configuration supported by the DSH host is either honored or documented as
  unsupported before enablement.

## R2 — Supported provider modes

- The first release supports these explicit modes:
  - **Purili Keyless** — no account, API key, or payment method;
  - **Tavily Keyless** — no account, API key, or payment method;
  - **Tavily BYOK** — user-supplied Tavily credential;
  - **Brave Search BYOK** — user-supplied Brave Search credential;
  - **Exa BYOK** — user-supplied Exa credential; and
  - **Custom JSON** — a user-supplied endpoint and declarative response mapping.
- A fresh install does not infer a keyless provider. Doctor offers separate
  one-action install-and-enable choices for Purili Keyless and Tavily Keyless;
  selecting either choice installs the package and selects exactly that
  provider. Choosing a BYOK or Custom JSON mode is a separate explicit action.
- Built-in providers use only their documented official APIs. The product does
  not ship provider-specific HTML scrapers, selectors, undocumented endpoints,
  or disguised compatibility modes.
- Custom JSON is provider-neutral. Compatibility means that the configured
  service satisfies the documented request and response-mapping contract; it
  does not imply endorsement or support for a particular upstream service.
- The endpoint, method, authentication reference, headers, query mapping, and
  response mapping for Custom JSON are user-controlled configuration, not
  model-controlled `web_search` arguments.
- Custom JSON accepts structured JSON responses only. Arbitrary HTML parsing,
  browser automation, and remotely supplied executable parsing code are not
  supported.
- Provider switching is deterministic. Exactly one general-search provider is
  selected at a time, and a request never fans out to unselected providers.

## R3 — Keyless provider behavior

- Purili Keyless and Tavily Keyless require no provider account, API key,
  DeepSeek key, payment method, or user credential.
- A keyless adapter never attaches a credential merely because one exists
  elsewhere in the DSH environment.
- Doctor describes each keyless provider separately. It does not merge their
  quotas, terms, privacy properties, or failure states into one generic claim.

### R3.1 — Tavily Keyless

- Requests use Tavily's documented keyless access mode and never attach a
  credential.
- Tavily currently publishes a limit of **30 free searches per day** for
  keyless access. Doctor and package documentation disclose that value, that
  the provider may change it, and that the public documentation does not define
  the quota identity or exact reset boundary.
- DSHmux does not claim an exact remaining balance unless Tavily provides an
  authoritative value. A local counter may be labeled only as local usage, not
  provider quota remaining.
- Each upstream Search request consumes one search. Documentation warns that a
  DSH multi-query invocation may consume more than one daily search.
- Quota exhaustion or throttling produces a clear, actionable result. The
  integration respects an upstream retry delay when supplied, does not loop or
  immediately retry a quota error, and never falls back silently to a paid or
  different provider.
- Tavily Extract, Crawl, Map, Research, x402 payment, and automatic account
  creation are outside this round.

### R3.2 — Purili Keyless

- Requests use Purili's documented public JSON Search API and send no
  authorization header, account identifier, or API key.
- Purili currently documents the API as free with **no fixed request quota**.
  Doctor and package documentation use that exact bounded claim: they do not
  call the service unlimited, promise availability, or infer a remaining
  balance.
- The adapter returns ranked organic results from Purili's documented
  independent index and maps only documented result fields. It does not invoke
  context retrieval, infocards, suggestions, image search, news, or site
  submission as part of `web_search`.
- Purili's current terms limit use to personal, non-commercial purposes and
  prohibit bulk extraction of its index. The Purili Doctor action displays
  that eligibility restriction before selection; DSHmux does not claim that
  this provider is suitable for commercial use.
- Throttling, abuse controls, an empty index result, or upstream failure is
  terminal for that request. The integration does not evade controls, loop,
  switch providers, or describe the absence of a fixed quota as a guarantee.
- Purili labels the API as preview. Its contract and terms are rechecked at
  release time; an incompatible change blocks that adapter's release.

## R4 — BYOK provider behavior and credential safety

- Tavily, Brave Search, and Exa credentials are optional and used only after
  the user explicitly selects the corresponding provider mode.
- Before selection, Doctor distinguishes keyless, free-credit, and potentially
  paid modes without claiming that a third-party free tier is permanent.
- Credentials are read from a supported secret store or an explicit
  environment-variable reference. Secret values are never written to ordinary
  YAML/JSON configuration, package files, telemetry, Doctor output, or logs.
- A missing, invalid, expired, or rate-limited credential fails clearly and
  does not trigger provider fallback.
- Provider requests receive only the credential selected for that provider.
  Switching providers does not forward or copy a credential to another
  service.
- DSHmux does not create provider accounts, accept provider billing terms on
  the user's behalf, enable pay-as-you-go billing, or purchase credits.
- Provider-specific quotas and billing remain controlled by the upstream
  account. DSHmux displays authoritative usage only when the provider exposes
  it safely; otherwise it links to the provider's own dashboard.

## R5 — Custom JSON endpoint safety

- Custom JSON setup requires an explicit user-entered endpoint and mapping. It
  has no hidden or pre-populated third-party search endpoint.
- HTTPS is required for public endpoints. Plain HTTP may be enabled only for an
  explicit loopback or private-network endpoint after a clear security warning.
- Embedded URL credentials are rejected. Optional authentication is referenced
  through the same secret-handling mechanism as BYOK providers.
- Redirects are bounded and cannot change to an unsupported protocol.
- Private, loopback, link-local, and metadata-address destinations are blocked
  by default for public endpoint configuration. A user may explicitly allow a
  private or loopback destination for a service they operate; the model cannot
  grant that exception.
- Query values are encoded as data and cannot alter the configured authority,
  protocol, headers, or response mapping.
- The response mapper is declarative, bounded, and non-executable. Invalid or
  oversized mappings and responses fail closed.
- Documentation states that the user is responsible for having permission to
  call the configured service. This notice supplements, rather than replaces,
  the product's own obligation not to ship an intentionally unsupported
  provider integration.

## R6 — No accidental paid DeepSeek search

- When this product is enabled for a DSHmux-owned DSH launch, an ordinary DSH
  request for current web information uses the explicitly selected provider
  through DSH's normal native search experience.
- Tool preference is not the only guard against paid search. A deterministic
  integration test proves that a native `web_search` reaches only the selected
  provider and makes zero requests to the DeepSeek search endpoint.
- Provider quota exhaustion, credential failure, outage, malformed output, or
  Custom JSON failure never triggers an automatic DeepSeek search request.
- Chat/model API use remains unchanged. This requirement concerns only the
  auxiliary DeepSeek search provider.
- Disabling the product restores DSH's pre-feature search configuration without
  leaving a stale or half-enabled provider.

## R7 — Standalone MCP package

- One independently versioned package exposes a stdio MCP server with a stable
  `web_search` tool and documented input/output fields.
- The same release build produces both the independently installable package
  and the exact self-contained artifact embedded in DSHmux. There is one source
  implementation and one version identity, not a copied DSHmux fork.
- Provider adapters share the normalized search contract but remain isolated
  so a provider-specific change cannot silently alter another adapter.
- The package installs and runs on supported macOS, Windows, and Linux Node
  hosts without Bash-only wrappers, administrator rights, or
  platform-specific path assumptions.
- The published artifact contains only declared runtime files, an actual
  license, provenance/attribution, and pinned or reproducible dependency
  metadata.
- A consumer can configure the executable with structured command and argument
  fields; shell interpolation is neither required nor recommended.
- The generic MCP path remains usable outside DSHmux and has documented manual
  setup examples for keyless, BYOK, and Custom JSON modes.

## R8 — One-action Doctor installation and repair

- The DSH Doctor search section shows the current paid DeepSeek search and a
  first-class **Web Search MCP** row with disabled, installable, installing,
  ready, incompatible, rate-limited, missing-credential, and repairable states
  as applicable.
- Selecting **Install & enable Purili Keyless** or **Install & enable Tavily
  Keyless** is the explicit execution and outbound-network consent and the only
  required install action. It installs the same package and selects the named
  provider without a second provider-selection dialog.
- Before selection, the row identifies the package, exact version, execution
  trust, destination class, affected workspace host, selected upstream
  provider, relevant terms/privacy links, and that provider's published quota
  statement. The Purili choice also displays its personal, non-commercial use
  restriction.
- The complete tested artifact and its dependency closure ship inside the
  DSHmux VSIX. First installation and repair do not depend on npm-registry,
  GitHub, or another package download being online. Runtime searches still
  require access to the selected upstream service.
- DSHmux installs the exact tested package version into versioned,
  extension-managed storage on the workspace host. It does not modify the
  user's global npm prefix and requires no Git or pnpm.
- The embedded artifact has a release-time manifest and digest. DSHmux verifies
  them before installation and verifies the installed bytes/version before
  execution; a missing, altered, or mismatched payload fails closed.
- Installation has visible progress, bounded redacted logs, cancellation where
  the child can be stopped safely, and an actionable failure state.
- DSHmux accepts the installation only after a real MCP handshake, tool-list
  check, package-version check, and deterministic provider-configuration check.
  A partial or wrong-version installation is not reported ready.
- Enable, repair, provider switching, and repeated starts are idempotent. No
  `npx -y` download or version resolution occurs on each DSH launch.
- Package upgrades are explicit and version-pinned. A DSHmux update does not
  silently switch package code or the user's selected provider.
- After successful verification, the same Doctor action enables the owned DSH
  integration and starts or safely restarts only the DSH child owned by this
  DSHmux window. If active work makes immediate restart unsafe, installation
  still completes, Doctor reports **restart required**, and DSHmux does not
  interrupt the task.

## R9 — Correct DSH configuration ownership

- Integration uses the configuration surface supported by the tested DSH
  version. MCP data is not written into `settings.yaml`, because that file is
  not DSH's MCP composition registry.
- Automatic configuration never blindly replaces or reformats the user's
  `settings.yaml`, `$DSH_HOME/cordis.patch.yml`, profile manifest, or agent
  preset files.
- DSHmux can identify every file it owns, regenerate it atomically, and remove
  or stop referencing it on disable. User-owned configuration survives enable,
  repair, upgrade, provider switching, disable, and uninstall.
- A malformed or conflicting user configuration fails closed with a clear
  diagnostic; DSHmux does not delete or rewrite the conflicting user entry.
- Configured executable and working-directory values are absolute
  workspace-host paths and remain valid across spaces, non-ASCII characters,
  extension restarts, and Windows path syntax.
- The integration is compatibility-gated against the running DSH version. An
  unsupported global, source, npx-cache, or custom DSH remains launchable with
  its original behavior rather than receiving an unsafe patch.

## R10 — DSH-native experience and portable MCP coexistence

- In DSH, the selected provider preserves the existing native `web_search`
  model contract, multi-query behavior, citation guidance, `web_fetch`
  follow-up, durable result metadata, and search-result presentation.
- The standalone MCP server and DSH-facing provider adapter share one
  normalized search core so validation, limits, and security behavior cannot
  drift between duplicate implementations.
- The package's DSH-facing integration is pinned to explicitly supported DSH
  versions because those plugin/provider APIs are pre-stable.
- Registering the package in a generic MCP client does not require DSH or
  DSHmux.

## R11 — Platform, lifecycle, privacy, and release safety

- Supported local hosts are macOS, Windows, and Linux. Remote SSH, WSL, and dev
  container windows install and execute on their workspace extension host.
- A healthy installation creates no recurring launcher noise. Later
  DSHmux-owned launches activate it automatically only after the user has
  enabled it.
- Enabling, disabling, or switching providers explains whether a DSH restart is
  needed and may restart only the DSH child DSHmux owns; it never terminates an
  unrelated DSH process.
- UI and configuration copy follows the extension's supported locales and does
  not expose raw absolute paths unless useful for diagnosis.
- Before enablement or provider switching, DSHmux discloses that search terms
  and necessary request metadata leave the workspace for the selected provider.
- The feature never invokes an OS package manager, elevation flow,
  shell-script bootstrapper, or arbitrary registry `latest` version.
- Terms, attribution, privacy, redistribution, pricing class, and quota facts
  for every built-in provider are rechecked during release preparation. A
  provider policy change that invalidates the integration fails the release
  gate rather than activating a hidden substitute.

## R12 — Verification and release gates

- Deterministic contract tests cover query validation, normalized result
  projection, canonical-URL deduplication, upstream rank preservation, result
  bounds, unsupported parameters, timeout, cancellation, response-size limits,
  malformed data, redirects, and network failures.
- Each built-in adapter has deterministic fixtures for success, empty results,
  authentication failure, quota exhaustion, throttling, and upstream error.
- Keyless tests prove that no API credential is sent and no fallback occurs.
  Tavily fixtures additionally cover its documented access header and daily
  limit; Purili fixtures cover its documented JSON mapping, absence of an
  authorization header, and provider-specific policy metadata.
- BYOK tests prove provider isolation and complete secret redaction from files,
  logs, UI, errors, and test snapshots.
- Custom JSON tests cover declarative mapping, query encoding, redirect and
  protocol controls, public/private destination policy, embedded credentials,
  response bounds, and rejection of executable or HTML parsing.
- A source and artifact audit proves there are no built-in provider-specific
  HTML parsers, hidden endpoints, selectors, aliases, fixtures, or default
  configurations outside the providers explicitly documented in this file.
- MCP end-to-end tests spawn the packaged executable, complete initialization,
  list the stable tool, call it through injected deterministic endpoints, and
  shut down without orphaning the child.
- DSH integration tests prove provider selection, native result projection,
  absence of a DeepSeek search request, switch/disable idempotency, user-config
  preservation, unsupported-version fallback, and paths containing spaces.
- CI covers macOS, Windows, and Linux. A remote-host seam is covered
  deterministically, with at least one manual Remote SSH/WSL/container smoke
  recorded before release.
- Package dry-run inspection, dependency/license audit, bounded live smokes for
  enabled built-in providers, TypeScript compilation, the full DSHmux unit
  suite, and VSIX content inspection all pass before release.

## Acceptance scenarios

1. **Fresh keyless install**: a macOS or Windows user selects either keyless
   provider action once. DSHmux installs from its embedded artifact, verifies
   it, selects the named provider, starts or safely restarts its owned DSH
   child, and reports ready without a terminal, account, API key, or package
   download.
2. **Native search without DeepSeek cost**: a request for current information
   produces native results from the selected provider and makes no DeepSeek
   search request.
3. **Tavily daily cap**: after Tavily rejects a request for exhausted keyless
   capacity, DSH reports the provider limit and next action without retrying in
   a loop, switching provider, spending DeepSeek credits, or inventing results.
4. **Purili keyless selection**: the user sees the provider's current use
   restriction and no-fixed-quota wording, selects it once, and receives
   normalized search results without an account, key, hidden fallback, or an
   unlimited-service claim.
5. **Explicit BYOK switch**: the user stores a provider credential securely and
   selects its adapter. Only that provider receives the credential, the
   selection survives restart, and switching back does not leak the secret.
6. **Custom JSON service**: the user explicitly configures a conforming JSON
   endpoint and declarative mapping. Search normalizes its response without
   executing provider content or modifying the endpoint from model input.
7. **Repeat start and repair**: repeated starts and two repair actions retain
   the same verified version and selected provider with no duplicate rows or
   per-launch package download.
8. **Disable**: DSHmux stops referencing its owned integration, while the
   user's pre-existing DSH behavior and configuration remain byte-for-byte
   unchanged.
9. **Existing custom configuration**: unrelated settings and Cordis rows are
   preserved; an ID/provider conflict is reported instead of overwritten.
10. **Remote window**: installation, credentials, configuration, and execution
   occur on the remote/container workspace host, never accidentally on the
   local UI host.
11. **Offline or blocked upstream**: the search returns a bounded, actionable
    error, DSH remains running, and chat/model calls are unaffected.
12. **Other MCP client**: the same package can be installed independently,
    configured without DSHmux, and exposes its documented `web_search`
    contract.

## Explicitly out of scope

- A separate general-purpose knowledge-base product.
- Provider-specific HTML scraping, arbitrary HTML result parsing, browser
  automation, CAPTCHA bypass, or rotating identities to evade upstream
  controls.
- Tavily Extract, Crawl, Map, Research, x402 payment, or automatic account
  creation.
- Account signup, provider billing management, automatic purchase of credits,
  or silent provider failover.
- Commercial or bulk-index use of Purili contrary to its published terms.
- Claiming an exact quota reset time, quota identity, or remaining count that
  the selected provider does not expose.
- Full-page retrieval beyond DSH's existing `web_fetch`, image/video-specific
  search, or a separate news-search product.
- Automatic persistent configuration of DSH processes DSHmux did not launch.
- Replacing the chat model, changing its API key, or making chat inference
  keyless.
- Forking or patching the official managed DSH distribution in place.
- Supporting additional built-in providers without a new approved requirement
  revision.

## Approval decisions

The user approved the following decisions on 2026-09-13:

1. **Product boundary**: one independently versioned multi-provider
   `web_search` MCP package is in scope.
2. **Provider set**: Purili Keyless, Tavily Keyless, Tavily BYOK, Brave Search
   BYOK, Exa BYOK, and provider-neutral Custom JSON are the first-release modes.
3. **Keyless actions**: Doctor exposes separate one-action install-and-enable
   choices. Tavily discloses its currently published 30-searches-per-day limit;
   Purili discloses no fixed request quota and its personal, non-commercial use
   restriction. Neither mode guesses remaining provider quota or promises
   availability.
4. **No hidden integrations**: built-in provider support is explicit and uses
   documented APIs only. No provider-specific HTML parser, undocumented
   endpoint, disguised compatibility mode, or silent provider fallback ships.
5. **Custom responsibility boundary**: users may configure a conforming JSON
   service without DSHmux maintaining a host denylist, but DSHmux provides no
   hidden defaults and does not claim support merely because a custom endpoint
   responds.
6. **Distribution**: the standalone package is the single source of truth, and
   its exact self-contained release artifact is embedded in the DSHmux VSIX for
   offline one-action installation. Runtime searches still require network
   access.
7. **DSH integration**: the package exports both generic stdio MCP and a
   compatibility-pinned DSH-native provider adapter so selected search replaces
   paid native DeepSeek search instead of merely coexisting with it.
8. **Scope**: automatic configuration applies only to DSHmux-owned launches;
   persistent user Cordis/profile files are not edited in this round.
