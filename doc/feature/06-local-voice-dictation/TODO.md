# Local Voice Dictation — TODO

Mechanically extracted from the `❌` and `⏭️` items in [plan.md](plan.md).

## ❌ T9 — Complete the Windows x64 live checkpoint

**Blocker**: repeated SDL, WASAPI, and DirectShow probes expose zero capture
endpoints on this Windows machine.

- With a present capture endpoint, run live English and Estonian partial/final
  dictation through the Extension Development Host.
- Verify offline live transcription, default and explicit SDL device,
  cancellation, canonical model cache, no auto-Send, no temporary audio files,
  transcript latency, and observable peak memory.

Smallest next step: attach or enable one Windows recording endpoint and rerun
only this checkpoint; no implementation or backend change is currently needed.
