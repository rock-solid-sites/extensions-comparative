# WebView2 first compatibility gate

A clean, standalone Windows WPF/WebView2 probe; no production application, no browser impersonation, no cookies/token access, no scripts injected, no data sent to any host by the wrapper. The provider page itself uses its normal network/authentication flows. A persistent isolated user-data folder under LocalAppData/ChatWorkspaceWebViewGate/WebView2 retains its own browser state. Do not import or share browser profiles. Default WebView2 popup/download behavior retained. No claim of full feature or extension compatibility.

Gate order:
1. On Windows, run the built executable. Verify normal ChatGPT page and origin.
2. Sign in personally with an already-supported method on the existing account. Never provide credentials to an agent or copy session tokens. Google explicitly blocks embedded OAuth; do not bypass. If sign-in fails in the ordinary supported flow while ordinary browser works, stop and select Chromium. No changing account security settings needed for this gate.
3. If successful, open an existing conversation, confirm expected account/plan and sidebar, then close/reopen and check session persistence. Send a harmless test prompt only if the operator chooses; observe completion. Verify essential Work/connectors/model-picker/attachments/downloads with non-sensitive test data if applicable. A later session-renewal and inactive-stream/draft/resource test remains necessary before full adoption.
4. Report only pass/fail/blocked per step and non-sensitive error category; no account identity, cookie/token or private chat content. This probe is not a benchmark.

CI builds the executable only; it does not establish live authenticated compatibility. Private Bandcamp source was not copied. Do not change the official desktop app or user's existing browser.
