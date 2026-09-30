# PAN encrypted question bridge — requirements

- R1: Forward a supported DSH `user-questions/request` from the extension host to PAN encrypted for the viewer, independent of the DSH webview.
- R2: Deliver a matching encrypted PAN answer back to that exact DSH waterfall and acknowledge only after DSH accepts it.
- R3: Use the existing per-source token and an immutable local 0600 X25519 key. Never rotate an existing key or token automatically.
- R4: Keep retries idempotent across WebSocket reconnect and extension restart; cancel a PAN question if DSH resolves it elsewhere.
- R5: Delegate unsupported multi-question and multi-select requests to DSH's existing desktop client instead of changing their meaning.
- R6: Keep question/answer text out of PAN's event log, DSHmux settings, and extension logs.

The user's “go” authorizes implementation. Real phone acceptance requires the PAN user's viewer vault to be initialized by that user.
