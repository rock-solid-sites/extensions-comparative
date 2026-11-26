"""Minimal selector-priority candidate, not a general DOM validation implementation."""
from pathlib import Path
import subprocess
p=Path("src/adapter.js")
expected="e52db86e2c69ea24eeda7f4a61b04fbbd2581c29"
actual=subprocess.check_output(["git","hash-object",str(p)],text=True).strip()
if actual!=expected: raise SystemExit(f"unexpected adapter blob {actual}")
s=p.read_text()
pairs=[
 ("const main = document.querySelector(SELECTORS.main);",
  "const main = document.querySelector('main#main') ?? document.querySelector('main');"),
 ("const sidebar = document.querySelector(SELECTORS.sidebar);",
  "const sidebar = document.querySelector('#stage-slideover-sidebar') ?? document.querySelector('#sidebar');"),
]
for old,new in pairs:
    assert s.count(old)==1
    s=s.replace(old,new)
p.write_text(s)
print("T01 candidate: explicit preferred selectors before fallback; no other source changes")
