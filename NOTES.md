# Reverse-engineering notes

How the `.meshy` format was cracked, including the dead ends. Kept
because the wrong turns are as informative as the final answer.

## The format

`.meshy` is a thin encryption wrapper around a standard glTF/GLB that
uses `EXT_meshopt_compression`, `KHR_mesh_quantization`, and
optionally `EXT_texture_webp`.

```
Offset          Contents
────────────    ────────────────────────────────────────────
0..7            magic "MESHY.AI"
8..9            version (uint16 LE, observed: 1)
10..21          12-byte AES nonce (per-file, random)
22..31          reserved (no observed effect)
32..8224        AES-256-CTR ciphertext (always exactly 8192 bytes)
8224..8240      16-byte AES-GCM authentication tag
8240..EOF       plaintext (textures + meshopt-compressed mesh data)
```

Only the first 8 KB is encrypted. The rest of the file — WebP
textures, meshopt-compressed vertex/index streams, alignment padding —
is stored verbatim. There is no trailing MAC or second tag.

### Cipher

- **Algorithm:** AES-256-CTR (the keystream half of AES-GCM)
- **Key:** the 32-byte ASCII literal `JSON{"accessors":[{"bufferView":`
  — yes, a fragment of glTF JSON, hardcoded as a fixed symmetric key
- **Counter block:** `nonce || uint32be(2)` — standard GCM layout where
  J0 = nonce||1 is reserved for the tag computation and plaintext
  encryption starts at counter J0+1

### What's encrypted

The 8192-byte ciphertext decrypts to the first 8192 bytes of a GLB:

- 12 B — GLB header (`glTF`, version, total length)
- ~2500 B — JSON chunk (accessors, materials, bufferViews, meshes, etc.)
- 8 B — BIN chunk header
- ~5600 B — start of the first buffer view (WebP texture header or
  meshopt stream, depending on the model)

The 16-byte AES-GCM tag follows immediately. Everything from byte 8240
onward is plaintext.

### Decoder pipeline

1. **decrypt.js** — AES-CTR decrypts body[0..8192], skips 16-byte tag,
   concatenates with body[8208..end]. Output: a GLB with
   `EXT_meshopt_compression`.
2. **decompress.js** — for each meshopt-compressed bufferView, runs
   `MeshoptDecoder.decodeGltfBuffer()`. Rewrites the JSON to remove the
   extension. Output: a standard GLB with raw vertex/index data.

## Reverse-engineering arc

### Phase 1: WASM patching (dead end → clue)

The meshy.ai web viewer ships a 276 KB Emscripten WASM
(`mesh_loader.wasm`) that decrypts and decompresses `.meshy` files.
It's hostname-locked to `meshy.ai`, `*.vercel.app`, and `localhost`.

First attempt: find the AES key by scanning WASM linear memory after
decryption. Exhaustive byte-stride-1 scan of 62 MB post-decrypt memory
found zero AES key schedules — standard or endian-swapped. Concluded
the key was zeroed; effort parked.

Second attempt: patched the WASM binary to inject a `dump_key` import
at the entry of the AES key-expansion function (func 340, identified
by Rcon table at memory `0x2d10` and SBox at `0x2d40`). Renumbered all
644 function indices to accommodate the new import. The hook fired
twice during `processMeshyFile` — both times with the same 32-byte
input: `JSON{"accessors":[{"bufferView":`.

This looked like leftover heap data (it's the start of a glTF JSON),
so it was dismissed. That was wrong — it IS the AES key.

### Phase 2: entropy analysis (misleading)

Shannon entropy of the file body = 7.07 bits/byte. AES output should
be ≈8.0. Byte histogram: 8.6% zeros, χ² ≈ 1.6×10⁷ against uniform.
Briefly concluded the file wasn't encrypted at all.

This was misleading: only the first 8 KB is encrypted (uniform entropy
≈ 8.0), while the rest is meshopt-compressed data (structured, lower
entropy). The weighted average across both regions happens to be 7.07.

### Phase 3: AES-CTR breakthrough

Tried AES-256-CTR with the literal `JSON{"...` key, nonce from the
file header, counter starting at 2 (GCM convention). The first 32
decrypted bytes: `glTF\x02\x00\x00\x00...` — a valid GLB header.

Decrypting the full body uniformly produced a valid GLB JSON chunk, but
the meshopt-compressed data past 8 KB was corrupted. Entropy
sectioning revealed:

| Region               | Entropy | Nature           |
|----------------------|---------|------------------|
| body[0..8192]        | 7.98    | AES ciphertext   |
| body[8192..8208]     | —       | GCM auth tag     |
| body[8208..end]      | 6.7–8.0 | plaintext data   |

### Phase 4: split structure

The body has a **split layout**: encrypted prefix (always 8 KB) +
16-byte tag + plaintext suffix. The suffix contains WebP textures
(if any) and meshopt-compressed vertex/index streams — all in the
clear.

For files with WebP textures, the 8 KB prefix covers the GLB header,
JSON, BIN chunk header, and the first ~5600 bytes of the WebP file.
For texture-less files, the prefix covers the header, JSON, and the
first portion of the meshopt streams.

### Phase 5: the 16-byte tail bug

Early versions of the decoder stripped the last 16 bytes of the file
as a "trailing MAC." Those bytes are actually the tail end of the
meshopt-compressed index buffer. Stripping them caused 6 out-of-bounds
triangle indices (`0xFFFFFFFF`), which corrupted the GPU draw call
and made the entire model render dark. The fix: `body = file[32..end]`
(don't strip anything).

### Phase 6: meshopt decompression

The intermediate GLB uses `EXT_meshopt_compression`. Initially the
viewer relied on three.js's `MeshoptDecoder` at render time. This
produced subtle rendering differences (desaturated colors) because the
intermediate GLB's JSON metadata referenced meshopt-encoded buffers
that needed precise decoding.

The final pipeline decompresses meshopt in JS before rendering,
producing a standard GLB identical to what meshy's WASM outputs. This
is compatible with any glTF viewer (Blender, Unity, online viewers).

## Credits

- [zeux/meshoptimizer](https://github.com/zeux/meshoptimizer) — mesh
  compression codec (MIT)
- [youssef02/meshy2glb](https://github.com/youssef02/meshy2glb) —
  original Tampermonkey approach
- [Pouare514/meshy-downloader](https://github.com/Pouare514/meshy-downloader)
  — Chrome extension with similar in-page intercept
