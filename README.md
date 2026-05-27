# meshy2glb

Browser-based converter and viewer for [meshy.ai](https://meshy.ai)'s
`.meshy` 3D model files and common 3D formats. Drop files in, preview
with adjustable lighting, then export as `.glb`, `.gltf`, `.obj`,
`.stl`, `.ply`, or `.usdz`.

**Live:** https://amal-david.github.io/meshy2glb/

Everything runs client-side — decryption, meshopt decompression, and
rendering all happen in your browser. No file ever leaves your machine.

## How it works

`.meshy` files are AES-256-CTR encrypted glTF/GLB containers with
meshopt-compressed vertex data. The decoder was built clean-room
through reverse engineering (no meshy code or WASM in the bundle):

1. **Decrypt** — the first 8 KB of the body is AES-256-CTR encrypted
   with a fixed 32-byte ASCII key and a per-file nonce from the header.
   A 16-byte GCM auth tag follows. Everything after is plaintext.
2. **Decompress** — the decrypted GLB uses `EXT_meshopt_compression`.
   We run [meshoptimizer](https://github.com/zeux/meshoptimizer)'s JS
   decoder on every compressed bufferView to produce a standard GLB
   with raw vertex/index data.
3. **Render / convert** — three.js loads the model into a shared scene.
   The viewer provides orbit controls, adjustable lighting, wireframe
   mode, background presets, and auto-rotate. Exporters serialize that
   scene into the chosen output format.

The full pipeline (decrypt → decompress → render) takes ~80 ms for a
5 MB model.

## Features

- **Drag-and-drop or click to upload** — accepts `.meshy`, `.glb`,
  `.gltf`, `.obj`, `.stl`, `.ply`, `.dae`, `.3mf`, and `.fbx`
- **Lighting controls** — exposure, environment intensity, direct
  light, ambient light (all real-time sliders)
- **Display options** — wireframe toggle, auto-rotate, background
  presets (dark / grey / white / black), camera reset
- **Multi-format export** — download a standard `.glb`, `.gltf`,
  `.obj`, `.stl`, `.ply`, or `.usdz` for Blender, Unity, Unreal,
  slicers, AR preview, and other model tools
- **Linked asset support** — when loading `.gltf` files, select the
  `.bin` and texture files alongside the main file so relative asset
  references can resolve locally
- Works on any static host — GitHub Pages, Cloudflare Pages, S3,
  localhost

## Run locally

```bash
git clone https://github.com/Amal-David/meshy2glb
cd meshy2glb
./start.sh
```

## Tests

```bash
node --test tests/decrypt.test.mjs
```

Tests cover format detection, AES-CTR decryption, meshopt decode
integrity (zero corrupted indices), and GLB structural validation.
Fixture-driven cases run on any `.meshy` files in `tests/fixtures/`
or `$MESHY_FIXTURES`.

## File format (reverse-engineered)

```
Offset          Contents
────────────    ────────────────────────────────────────────────
0..7            magic "MESHY.AI"
8..9            version (uint16 LE, observed: 1)
10..21          12-byte AES nonce
22..31          reserved
32..8224        AES-256-CTR ciphertext (always 8192 bytes)
8224..8240      16-byte AES-GCM authentication tag
8240..EOF       plaintext (WebP textures + meshopt streams)
```

Cipher: AES-256-CTR, key = `JSON{"accessors":[{"bufferView":` (literal
ASCII), counter = `nonce || uint32be(2)`.

The encrypted 8 KB contains the GLB header, glTF JSON, BIN chunk
header, and the start of the first buffer view. Everything after the
16-byte tag is stored in the clear — textures (WebP) and meshopt-
compressed vertex/index streams.

Full reverse-engineering notes (including dead ends) are in
[NOTES.md](./NOTES.md).

## Architecture

```
src/
  decrypt.js      AES-256-CTR decryption via WebCrypto (~50 LOC)
  decompress.js   meshopt decompression → standard GLB (~100 LOC)
  viewer.js       three.js renderer with controls
index.html        UI: upload, controls panel, top bar, import/export routing
tests/
  decrypt.test.mjs    node:test suite
  meshopt_decoder.module.js   vendored decoder for offline tests
```

## Credits

- [zeux/meshoptimizer](https://github.com/zeux/meshoptimizer) — the
  mesh compression library (MIT)
- [three.js](https://threejs.org/) — 3D rendering (MIT)
- [youssef02/meshy2glb](https://github.com/youssef02/meshy2glb) —
  original Tampermonkey approach
- [Pouare514/meshy-downloader](https://github.com/Pouare514/meshy-downloader)
  — Chrome extension with similar in-page intercept

## Disclaimer

Not affiliated with [meshy.ai](https://meshy.ai).

## License

[MIT](./LICENSE)
