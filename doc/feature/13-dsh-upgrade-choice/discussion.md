# Patched DSH upgrade choice — Discussion

**Date**: 2026-09-24

The user found that DSHmux 0.4.9, while running DSH 0.1.5-rc.2, showed npm `latest` and `next` upgrade commands but no way to switch to the maintained `matik5` build. The user asked for this change directly in the unmerged `matik/dsh-0.1.7-rc.1` worktree and for a newly installed VSIX.

Code audit: `versionCheckService.ts` reads only npm dist-tags and builds npm/npx commands. `installService.ts` already pins and verifies the patched checkout, but the Doctor action is unavailable when DSH is ready. The compact overflow menu in `chatChrome.ts` has the two npm channel actions and is the entry point shown in the screenshot.

Follow-up report: the user expected the successful checkout path in `dshmux.dshPath` and found that manual configuration still produced `dsh did not become ready within 30000ms`. The installed source binary exists and reports 0.1.7-rc.1. A direct `dsh web --port 0 --no-open` with the user's existing profile printed its ready URL after 62 seconds; a fresh profile printed it within 40 seconds. The existing web profile starts several MCP servers and delays readiness. The current `DshServerManager` timeout is 30 seconds for every binary.
