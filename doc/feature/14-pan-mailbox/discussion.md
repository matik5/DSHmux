# PAN encrypted question bridge — discussion

The user needs a real attention loop: DSH asks for human input, PAN pushes a generic notification, the iPhone user answers, and the original DSH turn resumes. Lifecycle `turn/end` receipts alone do not solve this.

Code audit found DSH 0.1.7's forwarded `$events` stream on `/api/remote.mux`. A `user-questions/request` waterfall contains a Host-generated `eventId`, `agentId`, and `request.questions`; `$events/result` accepts the same event ID plus a structured answer. A competing desktop client can settle the event first, after which DSH sends `cancel` to the bridge. PAN already has encrypted question, answer, and ack endpoints, but lacked a source-authorized cancellation endpoint. PAN's current PWA supports one question with one choice or custom text, not multiple questions or multi-select.
