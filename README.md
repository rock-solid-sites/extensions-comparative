# Extensions Comparative

Independent, reproducible comparison of browser extensions and companion tools. We investigate transferable techniques, establish behavioral evidence, and contribute useful regressions or optimizations upstream when justified.

The [baseline workflow](.github/workflows/baseline.yml) is the machine-readable source of exact upstream commit pins, runtime versions and commands. Four independent standard Ubuntu jobs fetch unmodified upstream source; no upstream source is vendored.

| Subject | License | Initial scope |
| --- | --- | --- |
| [Pane Control](https://github.com/jameschen83/chatgpt_pane_control) | MIT | Adapter, metadata and layout fixtures |
| [Voyager](https://github.com/voyager-crew/voyager) | GPL-3.0 | Native tests and folder benchmark checks |
| [Multi-AI Chat](https://github.com/TED-H-com/multi-ai-chat) | MIT | Native provider, submission and recovery tests |
| [Voyager CLI](https://github.com/voyager-crew/voyager-cli) | MIT | Native job and protocol tests |

These baselines are not live service validation or machine-specific performance comparisons. No authenticated provider sessions, private data, model invocations, secrets, release workflows or deployment jobs are required. Jobs are time-bounded, with read-only repository permissions, and no artifact uploads or caches.

Additional experiments must identify the question, source revision, relevant behavior, controlled conditions, reproducible commands and evidence limits. Distinguish actual upstream defects, invalid test assumptions and local requirements. Verify findings against relevant current upstream before proposing changes, respecting licensing and contribution policies.

This is an experimental environment, not a browser extension or general-purpose testing product.
