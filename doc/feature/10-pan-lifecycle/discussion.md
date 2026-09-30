# PAN lifecycle adapter — discussion

User needs deterministic, silent turn-end reporting from DSHmux. The model must not need to find an MCP tool. DSHmux currently observes `turn/end` for sounds inside `media/bridge-client.js`, which depends on a live webview. `DshServerManager` owns the DSH URL, authentication cookie and workspace session list; the DSH `session/follow` stream carries durable `turn/end` events with session ID, sequence and timestamp. Existing user-created files in the main checkout are unrelated and left untouched.
