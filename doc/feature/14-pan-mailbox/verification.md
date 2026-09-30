# PAN encrypted question bridge — verification

R1/R3/R6: `src/extension.ts` constructs `PanQuestionBridge` and starts it on DSH ready. `src/panQuestionBridge.ts` reads the 0600 token, creates a 0600 X25519 key only when no agent key is registered, and posts a libsodium `crypto_box_easy` ciphertext. Neither request text nor the key is placed in DSHmux settings or logs. The fake DSH/PAN test decrypts the posted ciphertext with the viewer key and verifies the original question.

R2: the same test encrypts a viewer response, checks route metadata, and asserts that `$events/result` receives the original DSH event ID and selected label. PAN ack occurs after the DSH result succeeds.

R4: the request ID is derived from the Host event ID. The exact encrypted body is saved locally with 0600 permissions for idempotent retry. A competing desktop result's `cancel` frame calls PAN cancellation and removes the spool file. A second test checks this behavior. The answer test also injects the DSH `cancel` emitted by our own winning result and confirms that it does not cancel the PAN response. A post-reconnect sweep cancels spool records no longer present in the DSH event stream.

R5: a third test proves multi-select is delegated with `next` and PAN is not called. The same guard rejects multiple questions and oversized content.

`npm test`: 264 passed, 1 skipped. `npm run compile` passes. PAN-side cancellation tests pass. The full phone acceptance is deferred because PAN's viewer vault is not yet initialized by its owner. This adapter is not a substitute for a real DSH/iPhone acceptance test.
