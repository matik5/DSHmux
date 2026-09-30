# PAN encrypted question bridge — solution

## Goal

Connect DSH's native question waterfall to PAN's encrypted mailbox without a model-selected MCP call.

## Facts

`src/extension.ts` already owns `DshServerManager` and starts the lifecycle observer on `ready`. `DshServerManager` exposes `serverUrl` and `authCookie`. The installed DSH 0.1.7 source defines `$events` as a multiplexed stream with `ready`, `waterfall`, and `cancel` frames, and `$events/result` as the result RPC. PAN exposes bootstrap, immutable agent-key registration, encrypted question POST, response GET, and ack POST. `frontend/questions.js` renders only one question with radio choices and optional free text. The source's `agentId` is the stable routing identifier for the pending waterfall; no session ID is present in this frame.

## Gap

DSHmux currently only plays a local question sound. No extension-host bridge posts the encrypted question or resumes the waiting DSH agent. PAN cannot close a question already resolved on desktop.

## Call-site audit

The bridge adds a new `src/panQuestionBridge.ts` class and config path; it does not change `DshServerManager` contracts. `src/extension.ts` starts and stops it at the same state/config call sites as the lifecycle observer. PAN cancellation is a new endpoint; existing question and answer call sites keep their contract.

## Tasks

Add the question bridge and libsodium runtime dependency, wire its start/stop, persist encrypted retry bodies locally, and test the DSH/PAN handshake. Add PAN source-authorized cancellation and show mailbox statuses in its monitor. The bridge delegates unsupported DSH question shapes to the existing desktop UI.
