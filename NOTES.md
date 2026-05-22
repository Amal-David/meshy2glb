# Notes

Implementation details, kept here so the README stays small.

## What it does

`.meshy` files are an encrypted GLB container. The viewer decrypts them
locally in a Web Worker — no data leaves your machine — and renders the
resulting GLB with three.js. There's also a one-click `.glb` download.

The page must be served from `localhost` for decryption to authorize.
`start.sh` handles that.

## File format

Reverse-engineered:

```
8B    magic "MESHY.AI"
2B    version
12B   AES-GCM nonce
10B   reserved / length
NB    AES-256-GCM ciphertext
16B   GCM authentication tag
```

The plaintext is a standard GLB using `EXT_meshopt_compression`.
three.js's GLTFLoader handles that natively with `MeshoptDecoder`
registered (the viewer leaves buffers compressed; the default code path
works for our render).

## Clean-room status

I attempted a full clean-room rewrite (so the viewer would have no
runtime dependency on third-party WASM). It stalled: exhaustive
byte-stride-1 scans of all post-decrypt linear memory found no AES key
schedule in any standard or endian-swapped layout. The key material is
either zeroed after use or stored in a non-standard layout. Going
further would need WASM bytecode patching.

## Layout

```
meshy2glb/
├── index.html              # entry
├── start.sh                # bootstrap + serve
├── src/
│   ├── decrypt.js          # MeshyDecryptor (signature, worker plumbing)
│   └── viewer.js           # three.js scene + GLB loader
└── vendor/                 # populated by start.sh, gitignored
```

## Credits

- [youssef02/meshy2glb](https://github.com/youssef02/meshy2glb) —
  original Tampermonkey approach.
- [Pouare514/meshy-downloader](https://github.com/Pouare514/meshy-downloader)
  — Chrome extension with similar in-page intercept.
- [zeux/meshoptimizer](https://github.com/zeux/meshoptimizer) — the
  GLTF compression library used inside the payload.
