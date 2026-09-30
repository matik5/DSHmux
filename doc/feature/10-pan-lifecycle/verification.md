# PAN lifecycle adapter — verification

R1 and R2: `src/extension.ts` creates and starts `PanLifecycleObserver` when DSH becomes ready. `src/panLifecycle.ts` follows each workspace session from the extension host and emits only neutral `turn_end` metadata. The test checks that nested error text is absent from the body.

R3: `package.json` exposes an opt-in token-file path. Delivery reads a local file and rejects group/other permissions; neither the token nor message content is logged.

R4 and R5: the observer stores a per-session sequence cursor after accepted events, reconnects after delivery failure, and derives the event ID from the session ID and sequence. The reconnect test verifies the second body equals the first. Initial cursor persistence is sequenced before live delivery persistence.

Code is called from the extension activation path, not left as an unused module. `npm run compile`, `npm test` (261 passed, 1 skipped), and `node --test test/panLifecycle.test.js` pass. A real DSH turn through the installed extension remains an operational check; the unit test uses a local fake multiplex stream.

Known limit: after a very long disconnection, the DSH snapshot's most recent 10,000 messages may omit older events. Quiet turn-end receipts are diagnostic, so the adapter does not interrupt agent work or create attention for this condition.
