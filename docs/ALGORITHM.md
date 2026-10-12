# Paint processing: implementation, evidence, and limits

## What is new, and what is reused?

The quantizer, graph solver, surface sampling, contour clipping and scene adapters are independently implemented here. The native `three-mf` serializer is reused, attributed and licensed; inventing new slicer encodings would not improve the product.

Reference reviewed: [EllsworOpan/Texture2Paint at 1adffeba84982dc14bb9ca0a9e194669cd976714](https://github.com/EllsworOpan/Texture2Paint/tree/1adffeba84982dc14bb9ca0a9e194669cd976714).

That upstream version **already has advanced contour tracing, shared-edge conformity, color quantization, decal processing and slicer-specific behavior**. We do not claim its geometry algorithm is naive or that this implementation replaces the entire project. The measured comparison below concerns its specific texture-label cleanup worker, not the whole product.

## 1. Sample authored color, not viewport lighting

Base-color texture values are decoded to linear RGB, multiplied by material, enabled vertex-color and instance-color factors, then converted to sRGB/Oklab for quantization. Texture transforms, UV channels, flip and wrapping are considered. Exposure, direct light, environment reflections and wireframe never enter the paint colors.

Where a triangle has a nondegenerate UV footprint within a texture tile, covered texel centers are sampled with a world-surface-area / UV-Jacobian weight. This reduces the bias from UV islands occupying different texture areas. A 5-bit RGB histogram bounds palette-fitting memory while retaining small sampled regions. Sample counts and any budget fallback are reported. The fallback uses seven points per face; it cannot guarantee recovery of features missed by those points.

Palette fitting uses deterministic weighted farthest-first initialization followed by up to 24 Lloyd iterations in Oklab. It is not random k-means++, not a globally optimal palette, and not a new color space. The palette is gamut-clamped and rounded to the exact RGB8 values used for subsequent assignment/export. Custom swatches bypass palette fitting.

Oklab and its matrices are due to [Björn Ottosson](https://bottosson.github.io/posts/oklab/). Actual filament reflectance, lighting and printer mixing are not modeled.

## 2. Reconstruct a bounded painted surface

For eligible opaque, untiled, constant-vertex-factor texture groups, the algorithm enumerates every cell at the selected raster resolution. Adjacent same-label runs form rectangles. UV triangles are clipped against those rectangles with barycentric interpolation back into the original 3D surface. This finds enclosed color features that a small set of point probes can miss, at that selected resolution.

A registry of original shared mesh edges and per-face grid edges propagates boundary split points before triangulation. Subdivision introduces no deliberate displacement of the source surface; numerical position snapping is relative to model extent. Separate source objects/instances are not welded together. This is not general mesh repair and cannot turn arbitrary source geometry into a manifold solid.

Vertex-color gradients, tiled UVs, degenerate UVs and unsupported groups take a conservative shared-edge red/green refinement path. Split edges are propagated to adjacent faces before triangulation; if the triangle budget cannot accommodate a complete pass, the pass is not partially applied. This sampled path does not have the raster-enumeration guarantee.

Budgets: at most 150,000 paint input/output triangles, up to 512 pixels of horizontal tracing resolution, a one-megapixel aggregate contour-label budget, and a five-million intersection-check budget. Texture readback uses a separate four-megapixel aggregate cap. These limits make failures explicit rather than silently promising arbitrarily high detail.

## 3. Optimize labels with source contrast

For face or pixel node i, let c_i be its source Oklab color, p_k a fixed palette color, and a_i its area normalized by mean node area. For adjacent nodes i,j, let l_ij be normalized shared-edge length (1 on the benchmark grid). We minimize:

```text
E(z) = sum_i a_i ||c_i - p_(z_i)||² / sigma²
     + lambda sum_(i,j) l_ij exp(-||c_i-c_j||² / (2 sigma²)) [z_i != z_j]
```

The first term preserves color fidelity. The second discourages label boundaries where the source colors are similar; it weakens sharply at a strong source-color edge. Default lambda is 0.35 and sigma is 0.075 in the current Oklab implementation. Surface adjacency crosses matching edges within a source mesh group, never arbitrary image neighbors across separate objects. Non-manifold adjacency is reported and not used for smoothing.

For **two labels, at most 12,000 nodes and a bounded operation count**, a new iterative Dinic minimum-cut implementation solves the fixed energy to floating-point tolerance. Source-to-node capacity is the label-1 unary cost, node-to-sink capacity the label-0 cost, and undirected edges carry the pairwise penalty. The solver is tested against all 32 assignments on 30 seeded five-node graphs. This certifies neither the model assumptions nor large end-to-end print quality; it tests solver correctness on a representative small set.

For larger or multicolor graphs, sequential alternating-order ICM considers the current, nearest-color and neighboring labels. Each accepted change strictly decreases the same global energy. **This is local optimization, not an exact or globally optimal multi-label solver.** An operation-limited min-cut falls back explicitly; a partial flow is never advertised as optimal. The report identifies the chosen solver.

## Reproducible comparative experiment

Run `npm run benchmark`. It writes every trial and the full summary to `docs/benchmark.json`. CI retains that file as an artifact.

Baseline is the **actual** upstream `src/texture-processing-worker.js`, Git blob `1cfbb248c33ece62c06a717a9d03e745868099bd`, executed unmodified in a Node VM. The script verifies its blob hash first. The original MIT notice is alongside the reference. It is not shipped in the runtime application.

There are 20 deterministic seeds per family, 64×64 grids, identical fixed palettes and initial nearest-color labels. Compare upstream cleanup off, one smoothing pass, and min-island-size 8 plus one smoothing pass. Our implementation additionally consumes source colors; this is the architectural change being evaluated, not hidden equal-input parity. No palette-fitting, contour-processing, slicer or human print-quality result is inferred from these tests.

| Seeded family / metric | Upstream off | Smooth 1 | Despeckle 8 + smooth 1 | Contrast-aware |
| --- | ---: | ---: | ---: | ---: |
| Small authored detail: recall, higher is better | 100% | 5.381% | 5.381% | 100% |
| Near-threshold color noise: wrong labels, lower is better | 16.675% | 2.207% | 0.614% | 0.077% |
| High-contrast impulse noise: wrong labels, lower is better | 2.981% | 0.0195% | 0% | 2.981% |

Numbers above are observed local Node 22 results, rounded; deterministic label results should reproduce. Timings in the JSON are machine-dependent and include distinct amounts of work. The graph method is slower than the upstream worker on these small cases; this is not a speed claim.

**Supported conclusion:** for these synthetic cases and fixed settings, using source contrast preserves small high-contrast details while reducing low-contrast label noise more effectively than the enabled majority/despeckle baseline.

**Important counterexample:** strong black speckles on a white background are preserved by our method. Without extra semantic information they are indistinguishable from authored eyes, dots or thin markings. Upstream despeckling is better in that case. Upstream cleanup off also preserves the authored details perfectly. There is no universal winner, and no honest claim that this whole product is better than Texture2Paint.

## Still unverified or outside this release

Real user-model distributions, parameter sweeps, physical slicer/toolpath/print results, filament waste, full upstream pipeline comparisons, and broad browser/GPU portability require separate experiments. Native 3MF write/read roundtrips establish serialization behavior, not a successful slice or physical print. Transparent decals, mesh repair, virtual extruders, GPU-only deformation and advanced printer profiles are deliberately not reimplemented here.
