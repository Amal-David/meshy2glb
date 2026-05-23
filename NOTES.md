# Notes

Implementation details, kept here so the README stays small.

## What it does

`.meshy` files are a hybrid AES-CTR / passthrough container around a
glTF/GLB with `EXT_meshopt_compression`. The viewer decodes them
**entirely in pure JS** using the browser's built-in WebCrypto API,
then renders them with three.js. There's also a one-click `.glb`
download.

No WASM blob, no localhost requirement, no allowlist. The whole
viewer is static HTML/JS and deploys on any host (GitHub Pages,
Cloudflare Pages, S3, your own server). The file never leaves the
user's browser.

## File format

```
Byte range         Contents
─────────────────  ────────────────────────────────────────────────
0..7               magic "MESHY.AI"
8..9               version (uint16 LE, observed 1)
10..21             12-byte AES nonce
22..31             reserved (no observed effect on decoding)
32..32+W           AES-256-CTR ciphertext → decrypts to GLB[0..W]
32+W..32+W+16      AES-GCM authentication tag for the prefix (not verified)
32+W+16..N-16      plaintext meshopt streams → mapped to GLB[W..]
N-16..N            file-level MAC (not verified)
```

`W = 2516 + bufferViews[0].byteLength`, i.e. the GLB header + JSON +
BIN-chunk header + the first bufferView (which always holds WebP
texture data — meshy elects not to encrypt that block).

The cipher:

- AES-256-CTR
- Key: the 32-byte ASCII literal `JSON{"accessors":[{"bufferView":`
  (yes really — it's the start of a glTF JSON, used as a fixed key)
- Counter block: `nonce || uint32be(2)` — the AES-GCM keystream layout
  (J0 = nonce||1 reserved for the tag, plaintext blocks start at J0+1)

The decrypted GLB uses `KHR_mesh_quantization`, `EXT_texture_webp`
and `EXT_meshopt_compression`. three.js's `GLTFLoader` renders it
when `MeshoptDecoder` is registered.

## How we got here

Brief history of the reverse-engineering arc — kept because the dead
ends are informative.

1. **First attempt** assumed the body was AES-256-GCM end to end. An
   exhaustive byte-stride-1 scan of all post-decrypt WASM memory
   never found an AES key schedule. Concluded the key was zeroed
   after use; effort parked.
2. **WASM bytecode patching pass** instrumented the WASM's
   AES key-expansion function (`func 340`, identified by Rcon at
   `0x2d10` and SBox at `0x2d40`). It fired twice during
   `processMeshyFile`, but the bytes it was handed were `JSON{"...`
   — looked like leftover heap data, not a key.
3. **Entropy analysis of the body** showed it was *not* uniformly
   encrypted: H = 7.07 bits/byte, 8.6 % zeros, χ² ≈ 1.6×10⁷ vs
   uniform. Briefly concluded the file wasn't encrypted at all.
4. **Closer look** with WebCrypto in the browser proved it *is*
   AES-256-CTR — but only over the prefix (header + JSON + WebP). The
   bytes that "looked like" a leftover JSON string actually *were*
   the AES key: a 32-byte ASCII literal hardcoded in the WASM. With
   counter starting at 2 (the GCM keystream offset) the prefix
   decrypts to a perfectly-formed GLB.
5. **Final wrinkle**: a 16-byte AES-GCM tag sits between the
   encrypted prefix and the plaintext meshopt streams, which is why
   the prefix-only decryption produces a GLB whose declared length
   overshoots the body by 16 bytes. The decoder ignores the tail.

End state: ~70 lines of JS, no native code, decrypts a 4.7 MB sample
in ~10 ms in the browser.

## Layout

```
meshy2glb/
├── index.html      # drag-and-drop UI, drives decrypt + viewer
├── start.sh        # tiny `python3 -m http.server` wrapper
├── src/
│   ├── decrypt.js  # WebCrypto AES-256-CTR + GLB assembly (~70 LOC)
│   └── viewer.js   # three.js scene with MeshoptDecoder wired up
```

## Credits

- [youssef02/meshy2glb](https://github.com/youssef02/meshy2glb) —
  original Tampermonkey approach.
- [Pouare514/meshy-downloader](https://github.com/Pouare514/meshy-downloader)
  — Chrome extension with similar in-page intercept.
- [zeux/meshoptimizer](https://github.com/zeux/meshoptimizer) — the
  glTF compression library used inside the payload, and the JS
  decoder bundled with three.js.
