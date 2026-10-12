# meshy2glb

Open a 3D file or model URL, inspect it locally, and export a standard model or an experimental limited-color paint snapshot.

**[Live site](https://amal-david.github.io/meshy2glb/)** · **[Asset Lens](https://github.com/Amal-David/asset-capture)** · **[Viewer capture guide](docs/INTEGRATIONS.md)** · **[Algorithm and benchmark](docs/ALGORITHM.md)**

The live site follows the deployed branch. Features in an unmerged pull request are not live yet.

## Three connected entry points

**Files and folders.** Drop a `.meshy`, GLB, glTF, OBJ, STL, PLY, DAE, 3MF or FBX file. For glTF/OBJ, include its BIN, MTL and texture companions. Folder paths are preserved; ambiguous duplicate filenames produce an error instead of the wrong texture. This is a single-model tool, not a batch converter.

**Model URLs.** Paste or drop a direct HTTPS asset URL. Public Meshy model-page URLs use an experimental public-task resolver. The source must permit browser access through CORS. This is not a proxy or an authentication/download-restriction bypass. Private, expired or blocked resources need an authorized local export. No file contents are sent to our server.

**Displayed geometry.** The optional Chrome MV3 extension scans an exposed compatible Three.js scene only after a click, lists visible meshes for explicit selection, and saves their static world-space geometry as GLB. It needs only `activeTab` and `scripting`, not persistent access to every website. See [installation and limitations](docs/INTEGRATIONS.md).

Use **Asset Lens**, the companion asset-inspection extension, to find/filter accessible assets on a page. Copy a model URL into meshy2glb or download the asset and open it here. The link is inside the app; Asset Lens itself is not duplicated or modified.

## Inspect and export deliberately

The viewer has orbit controls, lighting/background controls, wireframe, auto-rotate and animation-clip preview. Camera framing and preview materials are separate from original export data.

Choose the content before choosing the format:

| Content | Meaning |
| --- | --- |
| Original asset | Preserve original GLB bytes when available; `.meshy` exports the validated decompressed GLB. Other routes regenerate supported scene data and clips. |
| Painted static snapshot | Export the processed limited-color surface as vertex-colored GLB or slicer-native painted 3MF. |
| Displayed geometry only | Bake the current visible pose into a static GLB; omit textures, normals, rigs and animation. |

GLB, glTF, OBJ, STL, PLY and USDZ remain available. The UI explains each route's losses. OBJ export has no MTL/texture package. USDZ approximates Basic/Phong materials and explicitly rejects unsupported arrangements rather than reporting success with missing geometry. Required Draco/KTX2 extensions are not decoded by this build.

## Experimental texture to paint

Choose 2–16 colors, a detail budget and edge-aware cleanup; generate a preview; edit palette swatches; then export. A generated textured cube is available through **Try a textured sample**—no external model is needed.

The independent processing pipeline uses area-weighted Oklab palette fitting, raster contour clipping with shared boundary splits, and a source-contrast-aware Potts objective. Small two-color graphs use a minimum-cut solver; larger or multicolor graphs use monotone local optimization. The [algorithm note](docs/ALGORITHM.md) describes the objective and exact scope of its guarantees.

Native 3MF serialization is **reused from EllsworOpan's `three-mf` bundle in Texture2Paint**, with its MIT license retained. Select PrusaSlicer 2, Bambu Studio or OrcaSlicer encoding, choose millimeters per source unit, and assign printer/filament slots in the destination slicer. GLB/glTF ordinarily uses meters, hence the default 1000 mm/unit; unitless inputs require a deliberate choice.

This is not automatic mesh repair, a printability certificate, a decal baker, or a replacement for the full Texture2Paint project. Transparent paint inputs and GPU-only deformation are unsupported. Features smaller than the chosen raster resolution can disappear; budgets are surfaced explicitly. Output is a static surface, not an animated rig. Native archive roundtrips do not establish successful physical printing.

## Run and verify

For the website, no build is required:

```sh
git clone https://github.com/Amal-David/meshy2glb.git
cd meshy2glb
./start.sh
```

Use HTTPS or localhost for WebCrypto. Runtime Three.js modules are pinned to `0.169.0` on a CDN; client-side processing does not mean the first visit is offline.

Node 22 is the tested development target:

```sh
npm install
npm test                       # dependency-free core tests; also builds extension
npm run test:legacy             # historical real-.meshy tests; fixtures may be absent
npm run benchmark              # writes docs/benchmark.json, all seeded trials
npx playwright install chromium
npm run test:browser            # browser export and native archive roundtrips
npm run build:extension         # dist-extension/, load unpacked in Chrome
```

The benchmark checks the upstream reference worker's Git blob hash before executing it. CI publishes benchmark JSON, browser traces/screenshots and the built extension as artifacts. Top-level development versions are pinned; use the generated npm lockfile for a reproducible installed dependency graph.

## Architecture

```text
src/input.js, model-loader.js   URL/file/resource resolution
src/glb.js, decrypt.js,
  decompress.js                validated binary conversion
src/viewer.js                  independent preview scene/materials
src/export.js                  explicit export routes
src/snapshot.js, discovery.js  shared geometry capture and bounded discovery
src/paint-core.js, binary-cut.js
src/contours.js, surface.js     independent paint algorithms
src/paint-adapter.js            Three.js and native 3MF adapters
src/vendor/three-mf/            attributed upstream slicer-format writer
extension/                     optional active-tab geometry exporter
scripts/benchmark.mjs           comparative cleanup experiment
```

No analytics, session recording or asset uploads are added. URL import contacts the selected source; the website loads pinned libraries from a CDN. Conversion happens on-device. Only use models you own or have permission to convert/export.

## Credits and license

This project is MIT licensed. See [THIRD_PARTY.md](docs/THIRD_PARTY.md) for exact reused code, pinned upstream revision, author credits and licenses. Integrations draw on Asset Lens, MeshySec and the original meshy2glb ecosystem; our decoder does not ship Meshy's proprietary WASM. Historical format investigation remains in [NOTES.md](NOTES.md), which is not a current compatibility or performance guarantee.

Not affiliated with Meshy AI. Upstream changes can affect `.meshy` compatibility and the experimental public-page resolver.
