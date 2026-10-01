# Optional PAN integration: DSHmux client protocol

This describes the experimental **DSHmux adapter**, as implemented in `src/panLifecycle.ts` and `src/panQuestionBridge.ts`. It records the requests DSHmux sends and the responses it accepts. The PAN counterpart is still under development; this is a provisional client contract, not a PAN service, deployment, or viewer implementation guide.

## Opt in

PAN is disabled by default and is not required to install or use DSHmux. Existing credential paths do not enable it. To opt in, configure these settings on the machine where the workspace extension runs (Remote Settings for SSH/WSL/containers):

```json
{
  "dshmux.panEnabled": true,
  "dshmux.panTokenFile": "/absolute/path/to/pan-token",
  "dshmux.panMailboxKeyFile": "/absolute/path/to/pan-mailbox.key"
}
```

| Configuration | Client behavior |
|---|---|
| `panEnabled=false` | No PAN adapters, subscriptions, polling, or new PAN requests. Normal DSH chat and local sounds continue. |
| Enabled + token path only | Quiet turn-end reporting; no mailbox questions. |
| Enabled + token and key paths | Quiet reporting and supported encrypted questions/answers. |
| Enabled + empty token path | Both adapters remain inactive. |

Set `dshmux.panEnabled` back to `false` to stop both flows immediately without restarting DSH. Already sent HTTP requests can finish; the stopped adapter cannot start subsequent delivery. Disabling preserves keys, cursors and encrypted retry files. It does not send remote cancellation requests or remove existing mailbox records; stale records are reconciled when enabled again.

Files are on the extension host, not the webview's machine. Use absolute paths; the adapter does not expand `~`. The token is a trimmed bearer-token string, not a setting containing a secret. On POSIX, token/key files must have no group or other permission bits (normally `0600`). Permissions are checked using Node's filesystem mode; a real Windows ACL configuration has not been verified.

The mailbox private key is a 32-byte X25519 secret encoded as URL-safe base64 without padding. DSHmux creates a missing key with mode `0600` only after bootstrap reports no registered source key. It never rotates an existing key automatically. A missing local key with a registered remote key, or a mismatching public key, rejects forwarding. Keep the key file if reconfiguring the adapter.

## Transport and authentication

Endpoint examples use `https://pan.example.com`, a placeholder, not a working service address. The adapter currently uses a fixed service origin with no URL setting. Requests use JSON and `Authorization: Bearer <token>`. Mailbox requests have a 5-second timeout and require an HTTP success plus JSON `{"ok":true,...}`. Lifecycle requests have a 1.5-second timeout and the additional receipt check below. Credentials are read locally for each request.

DSH transport stays local to the extension host: `/api/remote.mux` WebSocket and `/api/$events/result` HTTP RPC, using the DSH session cookie when present. Neither PAN token nor mailbox key is sent to DSH.

## 1. Quiet turn-end reporting

Every five seconds the observer lists active sessions in the current workspace and maintains a `session/follow` multiplex stream for each. It consumes real `turn/end` events regardless of whether the chat webview is open.

For a turn end, DSHmux sends `POST /api/v1/events`:

```json
{
  "event_id": "<deterministic UUID-shaped identifier>",
  "run_id": "dsh:<sessionId>",
  "event_type": "turn_end",
  "occurred_at": "<ISO timestamp from DSH event.time>",
  "title": "DSHmux"
}
```

The accepted response is `{"ok":true,"silent":true}`. No question, answer, tool output or failure details are included. Session IDs and timestamps are visible metadata.

The event ID is derived from the first 16 SHA-256 bytes of `dsh-turn-end-v1|<sessionId>|<seq>`, with UUID version/variant bits set. A per-session cursor is stored in VS Code workspace state as `pan.lifecycle.cursor.<sessionId>`. First attachment establishes a snapshot baseline and does not report old turns. Reconnect replays available events after the saved cursor. Failed delivery does not advance that cursor, so the same ID can be retried; replay is bounded by DSH's retained stream history (`maxMessages:10000`). This is not an unlimited delivery guarantee.

## 2. Observe native DSH questions

The bridge opens the multiplex endpoint `$events` with `payload:{"args":{}}`. DSH's `ready` item provides a `clientId`. A supported question arrives as:

```json
{
  "type": "waterfall",
  "event": "user-questions/request",
  "eventId": "<DSH UUID>",
  "agentId": "<originating agent>",
  "request": {
    "questions": [{
      "id": "q1",
      "question": "Continue?",
      "header": "Confirmation",
      "options": [{"label":"Continue"},{"label":"Stop"}]
    }]
  }
}
```

The adapter supports exactly one question, single choice or free text, at most eight choices, nonempty labels of at most 200 characters, and a combined question/detail prompt of at most 4000 characters. `detail` is appended after two newlines; option descriptions are not forwarded. Multi-select, multiple questions and unsupported/malformed shapes are delegated to the existing DSH UI through `$events/result` with `outcome:{"kind":"next"}`. This is not a bridge for approval prompts or all DSH events.

## 3. Bootstrap and encrypt the outgoing question

Before forwarding, the client calls:

| Method and path | Body / consumed response fields |
|---|---|
| `GET /api/v1/mailbox/bootstrap` | Response: `ok`, `source_id`, `viewer_public_key`, `agent_public_key` (null if absent). |
| `POST /api/v1/mailbox/key` | When absent, body `{"public_key":"<client public key>"}`; requires `ok:true`. |
| `POST /api/v1/mailbox/questions` | Encrypted envelope below; response must contain `ok:true` and string `question_id`. |

Encryption uses libsodium `crypto_box_easy`: X25519 keys, XSalsa20-Poly1305 authenticated encryption, and a fresh 24-byte nonce. Binary keys, nonce and ciphertext use URL-safe base64 without padding.

The question plaintext is:

```json
{
  "version": 1,
  "direction": "agent_to_viewer",
  "source_id": "<bootstrap source>",
  "request_id": "<stable request UUID>",
  "workstream_id": "<agent routing ID>",
  "run_id": "dsh.<stable request UUID>",
  "title": "Confirmation",
  "prompt": "Continue?",
  "choices": [{"id":"o1","label":"Continue"},{"id":"o2","label":"Stop"}],
  "allow_message": true,
  "context": {"project_name":"<directory basename>","chat_name":"<chat title>"}
}
```

`context` and its fields are optional: metadata is fetched for the originating `agentId`, never guessed from the currently visible chat. Names are truncated to 200 characters and encrypted. Title uses the trimmed header, or `DSHmuxi küsimus`, capped at 300 characters. Option IDs are positional `o1` through `o8`.

`request_id` is derived from the first 16 SHA-256 bytes of `dsh-question-v1|<eventId>` with UUID version/variant bits set. `workstream_id` is the original agent ID if it matches `[A-Za-z0-9_.:-]{1,120}`; otherwise it is `agent.<stableId(agentId)>` using the same hash procedure. `run_id` is `dsh.<stableId(eventId)>`. These routing fields identify the DSH invocation; display names never change them.

The HTTP envelope is:

```json
{
  "request_id": "<stable request UUID>",
  "workstream_id": "<agent routing ID>",
  "run_id": "dsh.<stable request UUID>",
  "expires_at": "<creation time plus 24 hours, ISO timestamp>",
  "nonce": "<base64url>",
  "ciphertext": "<base64url encrypted plaintext>"
}
```

Routing IDs, expiration and encrypted size are visible; title, prompt, labels and display context are encrypted. The exact envelope is saved in `dshmux-questions/<request_id>.json` beside the key file, with directory mode `0700` and file mode `0600`. Retries reuse that envelope, including nonce and expiration, so they do not generate a new question identity or ciphertext.

## 4. Receive and validate the answer

While questions are pending, the bridge polls `GET /api/v1/mailbox/responses` on a three-second timer (also after a new question). The response is `{"ok":true,"responses":[...]}`. Each answer envelope consumed by DSHmux has:

```json
{
  "question_id": "<ID returned by question POST>",
  "response_id": "<answer ID>",
  "source_id": "<bootstrap source>",
  "request_id": "<original request UUID>",
  "workstream_id": "<original workstream>",
  "run_id": "<original run>",
  "nonce": "<base64url>",
  "ciphertext": "<base64url>"
}
```

DSHmux authenticates/decrypts it with `crypto_box_open_easy`, the viewer public key and the local private key. The decrypted answer must contain:

```json
{
  "version": 1,
  "direction": "viewer_to_agent",
  "source_id": "<bootstrap source>",
  "request_id": "<original request UUID>",
  "workstream_id": "<original workstream>",
  "run_id": "<original run>",
  "response_id": "<same answer ID as envelope>",
  "choice_id": "o1",
  "message": "Optional free text"
}
```

Outer routing fields must match the pending question and its returned `question_id`; inner routing fields and `response_id` must match as well. `choice_id` may be absent/null for text-only answers, or must name an existing `o1`–`o8`. Trimmed message is limited to 4000 characters. A choice or nonempty text is required. Invalid ciphertext, routes or choices are rejected without submitting or acknowledging the answer.

## 5. Deliver to DSH, then acknowledge

A valid answer is mapped to the **original** question ID and original option label. DSHmux sends `POST /api/$events/result`:

```json
{
  "type": "client-request",
  "rpcId": "pan-answer-<original eventId>",
  "method": "$events/result",
  "payload": {"args": {
    "clientId": "<DSH ready clientId>",
    "eventId": "<original DSH eventId>",
    "outcome": {"kind":"result","value":{"answers":[{
      "id":"q1", "selected":["Continue"], "custom":"Optional free text"
    }]}}
  }}
}
```

Text-only answers have `selected:[]`; `custom` is omitted for empty text. DSH HTTP success and JSON `{"result":{"ok":true}}` are required. Only then does DSHmux send `POST /api/v1/mailbox/responses/<question_id>/ack` with `{"response_id":"<answer ID>"}`. Successful ACK removes the pending entry and spool file. If ACK fails, the in-memory accepted-result flag lets the bridge retry ACK without resubmitting to DSH.

## Cancellation, retries and current limits

- DSH `cancel` for a question answered elsewhere triggers `POST /api/v1/mailbox/questions/<request_id>/cancel` with `{}`. The spool is removed after successful cancellation. A cancellation emitted while this bridge is settling its own accepted answer is not treated as a competing desktop answer.
- Failed question POSTs with an existing encrypted envelope are retried on the timer. Failures before an envelope exists delegate to DSH with `kind:next`. After the envelope exists, delivery keeps retrying; it does not automatically delegate on every outage.
- Reconnection reopens `$events`; after its `ready` frame, a ten-second reconciliation window allows pending questions to replay. For spool IDs no longer pending, DSHmux calls `GET /api/v1/mailbox/questions/<request_id>`, cancels statuses `OPEN`/`ANSWERED`, then deletes the stale file.
- The ACK-only flag and pending map are in memory, not a durable settlement transaction. Restart/reconnect recovery depends on the DSH replay and mailbox status; exactly-once delivery across crashes is not guaranteed. Expiration is sent to PAN, not enforced by a local expiry timer.
- Disabling prevents further forwarding but does not erase remote records. The ordinary DSH UI remains the input path when disabled. In-flight requests cannot be recalled.
- Automated tests cover a simulated DSH stream and an encrypted mailbox round trip, cancellation, unsupported-shape delegation, and optional lifecycle control. Live acceptance against the developing PAN counterpart remains unverified.

Implementation references: [activation](../src/extension.ts), [optional controller](../src/panIntegration.ts), [quiet events](../src/panLifecycle.ts), [question bridge](../src/panQuestionBridge.ts).
