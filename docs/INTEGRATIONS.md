# Asset Lens, model URLs, and viewer capture

## Asset Lens: find the file

[Asset Lens](https://github.com/Amal-David/asset-capture) is the companion asset-inspection repository. It provides asset filtering and capture; meshy2glb links to it from the header and import help instead of duplicating its extension.

On a page you are authorized to inspect, locate the model asset, then either copy its HTTPS URL into **Open URL** or download the file and open it here. A page-local `blob:` URL is not a portable model URL—download its contents through the application/Asset Lens first. No automatic handoff from Asset Lens is claimed, and that repository is unchanged.

An integrator can prefill the form using `#url=` followed by an encoded HTTPS URL. Prefilling never fetches anything: the user must review the link and click **Open URL**. The fragment is then cleared to reduce accidental sharing of signed links.

## URL import: fetch what the browser is allowed to read

Supported inputs are direct HTTPS model links and public Meshy `/3d-models/...-UUID` pages. The latter uses an experimental undocumented public-task response observed in [meshy-glb-downloader](https://github.com/Shuvam-Banerji-Seal/meshy-glb-downloader). No code from its Python/WASM pipeline is included here.

This resolver is not a stable Meshy API integration. CORS changes, metadata changes, private models, expired signatures, removed tasks or source restrictions can stop it. It uses `credentials: omit`, no referrer and bounded downloads, with cancellation and a timeout. It does not store API keys, forward cookies, refresh private credentials or use a proxy. URLs containing credentials, non-HTTPS schemes and literal local/IP hosts are rejected.

Remote glTF companions must be same-origin and fit the aggregate resource budget. OBJ with MTL and other complicated external-resource arrangements should be imported as a complete local folder. Browser/network errors point users back to authorized local exports and Asset Lens. URL hosts may log ordinary requests; the converter does not collect models or analytics.

## Optional viewer geometry extension

Build with Node 22:

```sh
npm run build:extension
```

In Chrome, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `dist-extension`. Open your authorized model's page, click the extension, click **Scan this tab**, explicitly select the model meshes, and save the geometry GLB. Reopen the file in meshy2glb for preview or format conversion.

Permissions are only `activeTab` and `scripting`. There are no permanent host permissions, persistent content scripts, remote extension dependencies, telemetry, or network interception. Page code runs only after an explicit scan. The extension asks you to select meshes instead of guessing which objects named “floor” or “background” are disposable.

Scene discovery is a bounded, getter-free search starting from exposed scene references and React/R3F canvas data. Applications under your control can explicitly expose a scene:

```js
window[Symbol.for('meshy2glb.scene')] = yourThreeScene;
```

The writer bakes visible geometry into world space, honors hidden parents and draw ranges, expands ordinary instances, and corrects reflected winding. Compatible CPU morph/skinned positions can be captured at the current pose; per-instance morph textures are explicitly rejected. Geometry-only output omits normals rather than applying an incorrect nonuniform-scale normal transform.

This is not a universal model extractor. Closed scenes, private engines, inaccessible frames, shader displacement, GPU-only geometry and unsupported deformations cannot be faithfully reconstructed. No rigs, animation clips, materials or textures are captured. The 250,000-triangle and scene-discovery limits are intentional. Capture may not work on the current Meshy viewer even when another Three.js application works. MeshySec inspired the interaction, but no compatibility claim for arbitrary Meshy pages is made.

Only export models you own or have permission to use, and respect applicable source access and license conditions. A visible preview does not itself grant export rights.

## Development verification

Core tests exercise the shared extractor with hidden parents, negative/nonuniform scale, instance transforms, pose readers, draw ranges and malformed indices. A VM test executes the built injected script. Browser tests exercise the main application and validate generated GLBs; a packaging/scene test is not the same as verifying every live external viewer or every Chrome version.

For printing, select a native 3MF target and inspect the result in that slicer. The package deliberately does not copy printer settings or install a profile. Assign actual filament slots and a printer yourself. An archive roundtrip is not evidence of correct toolpaths.
