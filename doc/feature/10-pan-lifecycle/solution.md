# PAN lifecycle adapter — solution

## Goal

Observe DSH session events from the VS Code extension host and send quiet metadata to PAN.

## Facts

`src/serverManager.ts` exposes `serverUrl`, `authCookie` and `listWorkspaceSessions(cwd)`. Its DSH process publishes a `ready` state. The `session/follow` multiplex stream opens at `/api/remote.mux` with a session address; its snapshot gives a cursor and its live `event` frames include durable `seq`, `time` and `type`. `src/extension.ts` creates the manager and handles state changes. `media/bridge-client.js` listens to the same event only for sounds and cannot cover closed webviews.

## Gap

No extension-host observer sends lifecycle metadata to PAN.

## Call-site audit

The new observer uses existing public `DshServerManager` getters and `listWorkspaceSessions` without changing their contracts. No existing call sites change.

## Tasks

Add `src/panLifecycle.ts` for session stream observation, cursor and delivery. Wire it from `src/extension.ts` behind `dshmux.panTokenFile`, add tests and documentation. Keep PAN tokens out of settings and logs.
