# Corrected native baseline — 2026-11-25

[Run 45638822503](https://github.com/rock-solid-sites/extensions-comparative/actions/runs/45638822503), workflow commit 5f41d7003dace1b9d1fa563a28587d0a1f15a6de. All four jobs completed successfully. Job logs independently retrieved.

| Subject | Job | Tests passed | Failed |
|---|---:|---:|---:|
| Pane Control | 139291471983 | 119 | 0 |
| Voyager | 139291472112 | 19091 | 0 |
| Multi-AI Chat | 139291472040 | 590 | 0 |
| Voyager CLI | 139291471319 | 376 | 0 |

Voyager: 1573 test files passed; historical v2.2.1 fixture fetched and checked at 6acb7b684a3e3eebfc24f0cea737d7627232d87a; primary donor commit unchanged. bench:check completed successfully (static benchmark checks, not timings). Voyager CLI: 28 test files passed. The initial environment failure was resolved without modifying upstream code. No live provider calls, Windows memory measurements, or new comparative test claims. Native baseline is supporting evidence only.

Next: structural mapping and review of existing test reach before adding discriminating cross-boundary cases.
