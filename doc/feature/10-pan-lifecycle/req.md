# PAN lifecycle adapter — requirements

- R1: Report each live DSH `turn/end` to PAN as a quiet `turn_end`, without a model tool call or an open webview.
- R2: Scope each report to the real DSH session; never send prompt, transcript or tool content.
- R3: Authenticate with a distinct PAN token read from a local 0600 file. Disabled by default until configured.
- R4: Reconnect after DSH restarts or WebSocket failures. Never block agent work when PAN is unreachable.
- R5: Deduplicate a retried event using stable event ID and body; expose delivery errors locally.

The user's “spec changes and go” authorizes this implementation. No existing token or key rotation is included.
