# PAN lifecycle adapter — result

DSHmux now has an opt-in extension-host observer for real `turn/end` events. It follows every active workspace session even when the chat webview is closed, sends a silent PAN receipt with stable identity, and retries after transient failure. A separate 0600 token file is configured with `dshmux.panTokenFile`; no existing credential is changed.

The adapter deliberately leaves human questions and meaningful completion alerts to explicit integrations. Ordinary turn ends do not notify the phone.
