# PAN encrypted question bridge — result

An opt-in DSHmux extension-host bridge now handles supported native user questions through PAN's encrypted mailbox. It forwards one question, polls for the phone answer, resumes the exact DSH waterfall, and acknowledges delivery. A desktop answer cancels the PAN copy. Complex question shapes remain with the existing DSH desktop UI.

The bridge is configured with paths to an existing per-source PAN token and a new local private-key file; it never rotates an existing token or key. A live phone test remains pending the owner's viewer-vault setup.
