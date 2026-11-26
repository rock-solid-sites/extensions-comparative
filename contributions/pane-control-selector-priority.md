# Proposed upstream contribution: Pane Control selector priority

Prepared 2026-11-26. Upstream default HEAD rechecked: 7c617224c8af16ffc678ddd5640068199e8c9ad3 (unchanged from experiment). Open/all issue listing returned no items; no known duplicate from that check. Not submitted.

## Report title
Prefer current ChatGPT main/sidebar selectors before legacy fallback

## Report
The selector list `main#main, main` in src/adapter.js is evaluated in document order, not selector priority. A hidden additional main inside the app preceding the actual main#main can be accepted by findLayout. On the existing ChatGPT integration fixture, this also places the toolbar inside the hidden main and incorporates its synthetic turn into the outline and scheduled cache-writer arguments when authoritative metadata is unavailable. A similar ordering issue affects the legacy sidebar selector. This is a synthetic robustness case, not a reported live ChatGPT regression.

Minimal reproduction to add to tests/adapter.test.js (uses its existing createDocument and imports):

```js
test('prefers the current main over an earlier hidden main', () => {
  const document = createDocument();
  try {
    const main = document.getElementById('main');
    const inactive = document.createElement('main');
    inactive.hidden = true;
    document.querySelector('.app').prepend(inactive);
    assert.equal(findLayout(document)?.main, main);
  } finally {
    document.defaultView.close();
  }
});
```

Suggested two-line change in findLayout (the actual tested candidate):
```diff
-  const main = document.querySelector(SELECTORS.main);
+  const main = document.querySelector('main#main') ?? document.querySelector('main');
...
-  const sidebar = document.querySelector(SELECTORS.sidebar);
+  const sidebar = document.querySelector('#stage-slideover-sidebar') ?? document.querySelector('#sidebar');
```
Keep the remaining algorithm unchanged. A narrow preference change, not a general ambiguity solution; preserves fallback if preferred selector absent, but does not prove fallback when a preferred target exists yet is invalid. Additional test snippet above is extracted/simplified for upstream review; exact tested harness and candidate are linked below, rather than claiming the standalone snippet itself ran.

Evidence: [corrected red/green run](https://github.com/rock-solid-sites/extensions-comparative/actions/runs/45736748939), [final results](https://github.com/rock-solid-sites/extensions-comparative/blob/main/results/2026-11-26-t01-final.md), [fixture probe](https://github.com/rock-solid-sites/extensions-comparative/blob/main/experiments/t01-adapter.mjs), [controller probe](https://github.com/rock-solid-sites/extensions-comparative/blob/main/experiments/t01-content-probe.py). Original native 119/119, extra adapter 5/6, controller 1/3; candidate 119/119, 6/6, 3/3. No live provider or physical cache corruption claim. Maintainer can decide relevance to supported layouts. No upstream issue/PR filed.
