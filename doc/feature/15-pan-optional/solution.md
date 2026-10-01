# Optional PAN — solution

## Goal
Explicit opt-in and a documented provisional DSHmux client protocol.

## Facts
`src/extension.ts` constructs adapters and starts both on ready/config changes, and restarts lifecycle on workspace changes. `PanLifecycleObserver.start` requires token and server URL; `PanQuestionBridge.start` requires token, key and URL. Both expose dispose/stop; queued async continuations can remain after stop. Existing README configuration omits PAN. Protocol facts are in both adapters and their tests.

## Gap
Credential paths activate PAN without a master switch, and users cannot read its question/answer contract in the README.

## Call-site audit
Activation state/config/workspace listeners are compatible with a central optional controller. Test constructors remain unchanged. No existing wire or storage schema is modified. PAN external compatibility is limited to the contract inspected in the client; live counterpart acceptance is unverified.

## Tasks
See the self-contained [plan](plan.md): optional controller/settings and active guards, README/protocol documentation, regression checks and close-out.
