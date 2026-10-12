# Attribution and third-party material

## Code reused and distributed

**EllsworOpan / Texture2Paint / three-mf.** The complete native slicer serialization bundle under `src/vendor/three-mf/` is copied from [Texture2Paint commit 1adffeba84982dc14bb9ca0a9e194669cd976714](https://github.com/EllsworOpan/Texture2Paint/tree/1adffeba84982dc14bb9ca0a9e194669cd976714/src/vendor/three-mf), Git tree `29ebc906414a0f2ce0f408d4ea5c822b1223fa19`. Its MIT license, copyright (c) 2026 EllsworOpan, and distributed notices remain inside the bundle. The writer is not presented as our algorithmic contribution.

**Texture2Paint cleanup reference.** `tests/reference/texture-processing-worker.js` is the unmodified upstream worker, blob `1cfbb248c33ece62c06a717a9d03e745868099bd`. The accompanying `TEXTURE2PAINT-LICENSE` preserves the MIT notice naming Amal David and Ellswor Opan. This file is used only for comparative tests, not imported by the website or extension.

**Three.js.** The browser imports Three.js `0.169.0` and its official loaders/exporters/SkeletonUtils from its pinned CDN package. [Three.js](https://github.com/mrdoob/three.js) is MIT licensed. Its package/license accompanies the npm dependency. The extension's authored pure-JS modules do not bundle Three.js.

**Meshoptimizer.** The decoder imported through Three.js, and the pre-existing vendored historical test decoder, are from [meshoptimizer](https://github.com/zeux/meshoptimizer), MIT, Arseny Kapoulkine. Existing notices are retained.

## Ideas, interoperability references, and independent implementation

- [Björn Ottosson's Oklab](https://bottosson.github.io/posts/oklab/): color-space equations and matrices, not a new color space invented here.
- [Asset Lens](https://github.com/Amal-David/asset-capture): the user's companion asset-inspection tool. Linked, not duplicated.
- [MeshySec](https://github.com/imluri/MeshySec): inspiration for explicit geometry export from a displayed model. Our bounded discovery, selection and writer implementation is independent; it is not a copy of the extension.
- [meshy-glb-downloader](https://github.com/Shuvam-Banerji-Seal/meshy-glb-downloader): observed public-task response structure and URL-input workflow. Its server, Python implementation and proprietary Meshy WASM are not included.
- [youssef02/meshy2glb](https://github.com/youssef02/meshy2glb) and [Pouare514/meshy-downloader](https://github.com/Pouare514/meshy-downloader): historical inspiration and reverse-engineering ecosystem already credited by the original project.
- The new graph solver implements standard s-t minimum-cut machinery; the fallback uses standard iterated conditional modes. Their application and implementation here are engineering work, not claims to invent those mathematical methods.

The independent source remains under the root MIT license. Reuse does not imply endorsement, author affiliation, permission to export someone else's models, or permission to bypass source access restrictions. Refer to each component's retained license for its exact terms.
