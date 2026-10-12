"""Confirm the existing GitHub Pages deployment serves this checkout's assets.

Read-only public HTTP requests. No credentials, secret access or hosting changes.
GitHub's existing main-branch Pages publisher remains responsible for deployment.
"""
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
import os
from pathlib import Path
import time
from urllib.request import Request, urlopen

BASE = 'https://amal-david.github.io/meshy2glb/'
FILES = ['index.html', 'src/app.js', 'src/style.css', 'src/input.js', 'src/surface.js',
         'src/paint-worker.js', 'src/vendor/three-mf/index.js', 'docs/INTEGRATIONS.md']
ROOT = Path(__file__).resolve().parent.parent
EXPECTED = {name: sha256((ROOT / name).read_bytes()).hexdigest() for name in FILES}
SHA = os.environ.get('EXPECTED_SHA', 'manual')

def check(name):
    url = BASE + ('' if name == 'index.html' else name) + '?deployment=' + SHA
    try:
        request = Request(url, headers={'User-Agent': 'meshy2glb-pages-check', 'Cache-Control': 'no-cache'})
        with urlopen(request, timeout=12) as response:
            body = response.read(4 * 1024 * 1024)
            ok = response.status == 200 and sha256(body).hexdigest() == EXPECTED[name]
        return name, ok, 'current' if ok else 'not yet current'
    except Exception as error:
        return name, False, type(error).__name__

for attempt in range(1, 31):
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(check, FILES))
    print(f'Publication check {attempt}: ' + ', '.join(f'{name}: {detail}' for name, _, detail in results), flush=True)
    if all(ok for _, ok, _ in results):
        print(f'LIVE: {BASE} serves the expected application for {SHA}', flush=True)
        summary = os.environ.get('GITHUB_STEP_SUMMARY')
        if summary:
            with open(summary, 'a', encoding='utf-8') as stream:
                stream.write(f'## Live site verified\n\n[{BASE}]({BASE})\n\nEight published files match commit `{SHA}` byte-for-byte.\n')
        break
    if attempt == 30:
        raise SystemExit('Pages has not published the expected files; inspect the Pages build before announcing deployment.')
    time.sleep(5)
