# PAN turn reply — Verification

2026-10-02. [Plan](plan.md). Feature branch feat/pan-turn-reply; no main merge. This is the DSH component delivery; native whole-PAN acceptance remains recorded in PAN feature09.

## Coverage

- R1/T1 ✅: extension.ts:45 creates PanQuestionBridge with current workspace root; bridge:113 owns PanCommandReceiver only while configured/active; command tick uses manager.listWorkspaceSessions active-session allowlist, real Box binding validation and exact existing session. manager.sendSessionPrompt:1132 sends queue-mode session.prompt with stable command UUID requestId. Unknown/archived/different workspace IDs do not create a new session or use focused chat.
- R2/T1 ✅: private receiver/command journals retain IDs/state/PID, no plaintext or ciphertext. Claim precedes prepare/send; accepted receipt retries do not resend. Dead-process prepared state becomes UNKNOWN without replay. Expired/tampered/binding mismatch fails closed. Same source/agent key remains in use.
- R3/T2 ✅: preserves delivered0.4.11 excerpt/quiet lifecycle/question behavior. 0.4.12 package installed with matching out modules and unchanged settings/token/key digests. Optional constructor argument leaves research/controller callers compatible; no default receiver without a workspace. Controller's exact0.4.11 dependency moved to stable versioned storage without changing runtime code/credentials. Reload remains a user action.

## Checks and results

- npm test:276 total,275 pass, one existing platform skip, zero failures. Final npm compile and7 affected question/command tests pass; added process-death prepared test passes without another send.
- `test/panCommands.test.js`: actual libsodium viewer→agent Box, exact session/command requestId, wrong session/bindings/expiry, lost receipt ACK, private disk metadata and process-death uncertainty.
- Existing question bridge tests: encrypted single question→phone answer→same invocation continuation, desktop cancellation, unsupported multi-select unchanged, disabling during bootstrap creates no key, accepted result retains ACK/evidence after reconnect.
- VSIX0.4.12 SHA256 `24121a5272fa3c6c45c7dbf942081900637a46ec2d93e4db4c05e57885e9d69d`, source/build/archive out/panCommands.js and installed extension.js/panCommands.js/panQuestionBridge.js/serverManager.js identical. README/changelog include prerequisites and reload instructions.
- Stable artifact: ~/.local/share/pan/client-releases/dshmux-0.4.12.vsix. Home VS Code reports successful installation. Original settings, dshmux-event.token and dshmux-mailbox.key digests unchanged.
- Real exported modules with PAN controller_flow.test.js: old0.4.11/new installed0.4.12/final stable0.4.11 all exercise encrypted question/answer/report retry successfully. Controller1.2.1 existing code stays unchanged; only config.bridge_dir becomes ~/.local/share/pan/research-controller/bridge-0.4.11/out. Idle graceful restart observed ready1.2.1 with same token/key.
- git diff --check passes. Dependency node_modules is a local ignored symlink, not a release source change.

## Gaps

Native physical phone follow-up in a real DSH session is untested here; fixture transport is not a real model invocation. User must **Developer: Reload Window** to load installed0.4.12. Quiet turn_end remains quiet; follow-up action requires an actual routed ordinary attention card. Existing research result cards do not advertise a new writable receiver. These whole-feature checks are PAN feature09 T4/T6 outstanding items, not a claim of completed native execution.

## Summary

Encrypted exact-workspace command receiver is connected, tested, packaged and installed. Existing questions/keys/quiet lifecycle/research adapter remain compatible. No model configuration, token or existing key rotated; primary/sibling worktrees preserved.

## Outstanding work

No outstanding component tasks. Whole-PAN physical/native acceptance and work-Mac Copilot delivery remain in PAN feature09; loaded DSH extension requires the user reload noted above.
