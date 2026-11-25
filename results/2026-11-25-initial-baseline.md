# Initial native baseline — 2026-11-25

Run: https://github.com/rock-solid-sites/extensions-comparative/actions/runs/45617364775, workflow commit 38d6ee8a9adc50c010a2b5a2d34e552d11b97009. Exact subject commits and commands in workflow.

| Subject | Job | Outcome |
|---|---:|---|
| Pane Control | 139216132270 | success |
| Multi-AI Chat | 139216131755 | success |
| Voyager CLI | 139216132284 | success |
| Voyager | 139216132296 | failure — missing historical git tag required by compatibility tests |

Voyager log: 1571 test files passed, 2 failed; 19084 tests passed, 2 failed (one failed suite could not initialize). Both failed test cases and failed suite invoked git show v2.2.1:... and received fatal: invalid object name 'v2.2.1'. Relevant suites SettingsBackupService.compatibility.test.ts and GoogleDriveLegacySources.compatibility.test.ts. Our shallow commit-only checkout omitted historical tag data; upstream CI uses fetch-depth: 0. This is a test-environment failure, not demonstrated upstream regression. Folder benchmark check skipped after test failure. Next qualify the historical tag object, fetch and verify required tag at pinned identity, rerun Voyager native baseline and benchmark check. No source changes, live provider verification or benchmark measurement performed.

Structural examination of the exact donor commits is planned alongside test coverage review; CodeGraph MCP repo_open attempts for all four returned HTTP 429 on connection probe, no snapshot IDs or indexing confirmed. Direct source reads remain usable. Retry in bounded manner; avoid changing subject revisions. Use structural maps for caller/callee and test path discovery, verify with raw source and executed evidence; graph coverage not proof of absence. No new test run triggered in this turn.
