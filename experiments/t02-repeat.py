"""Extend the pinned upstream lifecycle test in disposable checkout only."""
from pathlib import Path
import subprocess
p=Path("src/features/plugins/sources/bundledPluginsLifecycle.test.ts")
expected="473e232293aaad2e505f453af7bb783f277c40b0"
actual=subprocess.check_output(["git","hash-object",str(p)],text=True).strip()
if actual!=expected: raise SystemExit(f"unexpected original test blob {actual}")
s=p.read_text()
anchor="      engine.mount(manifest, defaultSettings(manifest));"
end="      expect(rootAttributes()).toEqual(before.root);"
assert s.count(anchor)==s.count(end)==1
start="""      // Independent observer registry: counts observed instances not disconnected.
      // This instruments calls in JSDOM; it is not heap retention measurement.
      const observed = new Set<MutationObserver>();
      const originalObserve = MutationObserver.prototype.observe;
      const originalDisconnect = MutationObserver.prototype.disconnect;
      const observeSpy = vi.spyOn(MutationObserver.prototype, 'observe').mockImplementation(function (
        this: MutationObserver, target: Node, options?: MutationObserverInit
      ) {
        originalObserve.call(this, target, options);
        observed.add(this);
      });
      const disconnectSpy = vi.spyOn(MutationObserver.prototype, 'disconnect').mockImplementation(function (
        this: MutationObserver
      ) {
        originalDisconnect.call(this);
        observed.delete(this);
      });
      try {
        // Calibrate independent registry against a known live then released observer.
        const control = new MutationObserver(() => {});
        control.observe(document.body, {childList: true});
        expect(observed.has(control)).toBe(true);
        control.disconnect();
        expect(observed.size).toBe(0);
        for (let cycle = 0; cycle < 3; cycle++) {
"""
finish="""
          expect(observed.size, `observer count after cycle ${cycle + 1}: ${manifest.id}`).toBe(0);
        }
      } finally {
        observeSpy.mockRestore();
        disconnectSpy.mockRestore();
        for (const observer of observed) originalDisconnect.call(observer);
      }
"""
s=s.replace(anchor,start+anchor).replace(end,end+finish)
# Keep the original native test name, assertions, settings and fixtures.
p.write_text(s)
print("T02 patched exact pinned lifecycle test: 3 cycles, observer controls; no implementation changed")
