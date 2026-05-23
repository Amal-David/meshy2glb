# meshy2glb

Local browser viewer / converter for `.meshy` files. Drop one in,
preview it, download `.glb`.

**Live demo:** https://amal-david.github.io/meshy2glb/

Pure JS — no WASM bundled, no server roundtrip. The whole decoder is
~80 lines using the browser's built-in WebCrypto API. Ships as static
HTML to GitHub Pages or any static host.

## Run locally

```bash
git clone https://github.com/Amal-David/meshy2glb
cd meshy2glb
./start.sh
```

Open the URL it prints, drag a `.meshy` onto the page or click to pick
a file from your machine.

## Tests

```bash
node --test tests/decrypt.test.mjs
```

Tests cover format detection, magic-byte checks, and end-to-end decode
(including a real `MeshoptDecoder` pass) for any `.meshy` fixtures
found in:

- `$MESHY_FIXTURES` (env var pointing at a directory)
- `./tests/fixtures/` (gitignored local dir)

If no fixtures exist locally, the fixture-driven tests skip with a
clear message — the core unit tests still run.

## Deploy on GitHub Pages

It's just static HTML/JS — push to a repo, turn on Pages from the
repository settings (Source: `main` branch, root). The `.nojekyll`
file in this repo makes Pages serve everything verbatim. No build
step.

## Status

- **Files with WebP textures** — decoded and rendered end-to-end. This
  is the common case for textured meshy.ai exports.
- **Files without textures (all-meshopt)** — partial. The header and
  JSON decrypt cleanly, but the first meshopt-compressed bufferView
  comes out corrupted under our AES-CTR pass. The UI surfaces a
  clear error rather than crashing. Tracked as a known limitation; see
  `tests/decrypt.test.mjs` (one `todo` entry).

Implementation notes are in [NOTES.md](./NOTES.md).

## Disclaimer

Not affiliated with [meshy.ai](https://meshy.ai). Runs locally;
nothing is uploaded.

## License

[MIT](./LICENSE)
