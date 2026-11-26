"""Append integration probes to exact donor-native content harness in disposable checkout."""
from pathlib import Path
import subprocess

p=Path("tests/content.test.js")
expected="91817f3c669be7150b1ee25f4e18520367e2572d"
actual=subprocess.check_output(["git","hash-object",str(p)],text=True).strip()
if actual!=expected: raise SystemExit(f"unexpected native harness {actual}")
s=p.read_text()
old="function setup(outlineCache = null) {"
new="function setup(outlineCache = null, beforeMount = () => {}) {"
assert s.count(old)==1
s=s.replace(old,new)
old="  const controller = new window.TestExtension.PaneController("
assert s.count(old)==1
s=s.replace(old,"  beforeMount(window.document);\n"+old)
s+=r'''
// Research probes. Real controller, DOM, index and cache scheduling; mocked cache sink.
function inactiveMain(document) {
  const decoy = document.createElement('main');
  decoy.hidden = true;
  decoy.innerHTML = '<div data-turn-id-container="decoy"><div data-message-author-role="user" data-message-id="decoy">SYNTHETIC INACTIVE TURN</div></div>';
  document.querySelector('.app').prepend(decoy);
  return decoy;
}
async function runT01Content(when) {
  const writes = [];
  let original, decoy;
  const ctx = setup({
    read: async () => null,
    write: async (id, records, complete) => { writes.push({id, records: JSON.parse(JSON.stringify(records)), complete}); }
  }, document => {
    original = document.getElementById('main');
    if (when === 'before mount') decoy = inactiveMain(document);
  });
  try {
    const {controller, document} = ctx;
    await new Promise(resolve => setImmediate(resolve));
    if (when === 'after mount') {
      decoy = inactiveMain(document);
      controller.refresh();
    }
    await new Promise(resolve => setTimeout(resolve, 650));
    const snapshot = JSON.parse(JSON.stringify(controller.index.snapshot()));
    const titles = [...(controller.ui?.contents.shadowRoot.querySelectorAll('.entry .title') ?? [])].map(e=>e.textContent);
    const evidence = {
      selectedOriginal: controller.layout?.main === original,
      selectedDecoy: !!decoy && controller.layout?.main === decoy,
      decoyTagged: !!decoy?.hasAttribute('data-cpl-branch'),
      toolbarInDecoy: !!decoy?.contains(controller.ui?.toolbar ?? null),
      outlineContainsDecoy: titles.includes('SYNTHETIC INACTIVE TURN'),
      snapshotContainsDecoy: snapshot.some(r=>r.key==='decoy'||r.title==='SYNTHETIC INACTIVE TURN'),
      cacheWrites: writes.map(w=>({id:w.id,keys:w.records.map(r=>r.key)})),
      cacheContainsDecoy: writes.some(w=>w.records.some(r=>r.key==='decoy'||r.title==='SYNTHETIC INACTIVE TURN')),
    };
    console.log('T01-CONTENT '+when+' '+JSON.stringify(evidence));
    // No false pass by refusing everything or disabling cache.
    assert.ok(writes.some(w=>w.id==='test' && w.records.some(r=>r.key==='prompt-1')),
      'expected a valid cache write for the original conversation');
    assert.deepEqual(
      [evidence.selectedOriginal,evidence.selectedDecoy,evidence.decoyTagged,evidence.toolbarInDecoy,
       evidence.outlineContainsDecoy,evidence.snapshotContainsDecoy,evidence.cacheContainsDecoy],
      [true,false,false,false,false,false],
      'inactive root must not receive controls or enter conversation evidence');
  } finally {ctx.dispose();}
}
for (const when of ['absent','before mount','after mount']) {
  test('T01 controller '+when, async()=>{await runT01Content(when);});
}
'''
# Keep original suite as well as the newly appended probes.
p.write_text(s)
print("T01 content probes appended to pinned native harness")
