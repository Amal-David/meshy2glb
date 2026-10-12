import { traceTextureSurface } from './contours.js';
import { fitPalette, rgbToLab, nearest, optimizeLabels, linearToSrgb, srgbToLinear } from './paint-core.js';
export const midpoint = (a, b) => ({ p: a.p.map((v, i) => (v + b.p[i]) / 2), uv: a.uv.map((v, i) => (v + b.uv[i]) / 2), linear: a.linear.map((v, i) => (v + b.linear[i]) / 2) });
export function area(t) {
  const [a, b, c] = t.v.map(v => v.p), u = b.map((x, i) => x - a[i]), w = c.map((x, i) => x - a[i]);
  return Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) / 2;
}
const vertexKey = (v, group) => `${group}:${v.p.join(',')}`;
const edgeKey = (a, b, group) => { const x = vertexKey(a, group), y = vertexKey(b, group); return x < y ? `${x}|${y}` : `${y}|${x}`; };
function centroid(t) { return { p: [0, 1, 2].map(i => t.v.reduce((s, v) => s + v.p[i] / 3, 0)), uv: [0, 1].map(i => t.v.reduce((s, v) => s + v.uv[i] / 3, 0)), linear: [0, 1, 2].map(i => t.v.reduce((s, v) => s + v.linear[i] / 3, 0)) }; }
const samplePoints = t => [...t.v, midpoint(t.v[0], t.v[1]), midpoint(t.v[1], t.v[2]), midpoint(t.v[2], t.v[0]), centroid(t)];
export function refineSurface(input, sample, palette, { levels = 2, maxTriangles = 150000 } = {}) {
  if (!Number.isInteger(levels) || levels < 0 || levels > 4 || !input.length || input.length > maxTriangles) throw new Error('Invalid surface detail or input triangle budget');
  let triangles = input; const labs = palette.map(rgbToLab); let budgetReached = false;
  for (let level = 0; level < levels; level++) {
    const split = new Set();
    for (const t of triangles) {
      const labels = samplePoints(t).map(v => nearest(rgbToLab(sample(v, t.material)), labs));
      if (labels.some(v => v !== labels[0])) for (let e = 0; e < 3; e++) split.add(edgeKey(t.v[e], t.v[(e + 1) % 3], t.group));
    }
    if (!split.size) break;
    const flags = triangles.map(t => [0, 1, 2].map(e => split.has(edgeKey(t.v[e], t.v[(e + 1) % 3], t.group))));
    const predicted = flags.reduce((n, mask) => n + 1 + mask.filter(Boolean).length, 0);
    if (predicted > maxTriangles) { budgetReached = true; break; }
    const next = [];
    triangles.forEach((t, i) => {
      const flagsForFace = flags[i], n = flagsForFace.filter(Boolean).length, add = v => next.push({ ...t, v });
      if (!n) { next.push(t); return; }
      if (n === 3) { const [a, b, c] = t.v, ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a); add([a, ab, ca]); add([ab, b, bc]); add([ca, bc, c]); add([ab, bc, ca]); return; }
      if (n === 1) { const e = flagsForFace.indexOf(true), a = t.v[e], b = t.v[(e + 1) % 3], c = t.v[(e + 2) % 3], ab = midpoint(a, b); add([a, ab, c]); add([ab, b, c]); return; }
      // Rotate so the two split edges meet at b. The shorter green diagonal wins.
      const e = [0, 1, 2].find(j => flagsForFace[j] && flagsForFace[(j + 1) % 3]);
      const a = t.v[e], b = t.v[(e + 1) % 3], c = t.v[(e + 2) % 3], ab = midpoint(a, b), bc = midpoint(b, c);
      add([ab, b, bc]);
      const d = (x, y) => x.p.reduce((s, v, j) => s + (v - y.p[j]) ** 2, 0);
      if (d(a, bc) < d(ab, c)) { add([a, ab, bc]); add([a, bc, c]); } else { add([a, ab, c]); add([ab, bc, c]); }
    });
    triangles = next;
  }
  return { triangles, budgetReached };
}
function wrap(x, mode) {
  if (mode === 1000) return ((x % 1) + 1) % 1;
  if (mode === 1002) { const n = Math.floor(x), f = x - n; return Math.abs(n) % 2 ? 1 - f : f; }
  return Math.max(0, Math.min(1, x));
}
export function sampleMaterial(vertex, material) {
  const factor = vertex.linear.map((c, i) => c * material.linear[i]);
  const tex = material.texture; if (!tex) return factor.map(linearToSrgb);
  const m = tex.matrix, [u, v] = vertex.uv;
  let x = wrap(m[0] * u + m[3] * v + m[6], tex.wrapS), y = wrap(m[1] * u + m[4] * v + m[7], tex.wrapT);
  if (tex.flipY) y = 1 - y;
  x *= tex.width - 1; y *= tex.height - 1;
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(x0 + 1, tex.width - 1), y1 = Math.min(y0 + 1, tex.height - 1);
  const tx = x - x0, ty = y - y0, values = [0, 0, 0]; let alpha = 0;
  const taps = tex.nearest ? [[Math.round(x), Math.round(y), 1]] : [[x0, y0, (1-tx)*(1-ty)], [x1, y0, tx*(1-ty)], [x0, y1, (1-tx)*ty], [x1, y1, tx*ty]];
  for (const [px, py, w] of taps) {
    const offset = (py * tex.width + px) * 4; alpha += tex.data[offset + 3] / 255 * w;
    for (let c = 0; c < 3; c++) { const s = tex.data[offset + c] / 255; values[c] += (tex.srgb ? srgbToLinear(s) : s) * w; }
  }
  if (alpha < 0.99) throw new Error('Transparent paint samples are not supported. Use an opaque model or the linked Texture2Paint decal workflow.');
  return values.map((c, i) => linearToSrgb(c * factor[i]));
}
export function surfaceGraph(triangles) {
  const map = new Map(), edges = []; let nonManifoldEdges = 0;
  triangles.forEach((t, i) => { for (let e = 0; e < 3; e++) { const a = t.v[e], b = t.v[(e + 1) % 3], key = edgeKey(a, b, t.group); const rec = map.get(key) ?? { faces: [], length: Math.hypot(...a.p.map((x, j) => x - b.p[j])) }; rec.faces.push(i); map.set(key, rec); } });
  let sum = 0; for (const r of map.values()) if (r.faces.length === 2) sum += r.length;
  const count = [...map.values()].filter(r => r.faces.length === 2).length, mean = sum / (count || 1) || 1;
  for (const r of map.values()) { if (r.faces.length === 2) edges.push([r.faces[0], r.faces[1], r.length / mean]); else if (r.faces.length > 2) nonManifoldEdges++; }
  return { edges, nonManifoldEdges };
}
export function paintSurface(input, materials, { count = 4, palette: custom, levels = 2, strength = 0.35 } = {}) {
  if (!input.length || input.length > 150000) throw new Error('Paint supports up to 150k input triangles');
  const sample = (v, i) => sampleMaterial(v, materials[i]);
  // Rasterize covered UV texel centers with world-area/Jacobian weights.
  // A 5-bit RGB histogram bounds palette fitting while retaining sub-face colors.
  const histogram = new Map(); let checks = 0, sampleBudgetReached = false;
  const record = (rgb, weight) => {
    const key = rgb.map(v => Math.min(31, Math.floor(v * 32))).join(':');
    const entry = histogram.get(key) ?? [0, 0, 0, 0];
    for (let c = 0; c < 3; c++) entry[c] += rgb[c] * weight; entry[3] += weight; histogram.set(key, entry);
  };
  for (const t of input) {
    const a = area(t); if (a <= 1e-18) continue;
    const tex = materials[t.material].texture; let covered = 0;
    if (tex && checks < 2000000) {
      const q = t.v.map(v => { const [u,w] = v.uv, m = tex.matrix; return [m[0]*u+m[3]*w+m[6], m[1]*u+m[4]*w+m[7]]; });
      const det = (q[1][0]-q[0][0])*(q[2][1]-q[0][1])-(q[1][1]-q[0][1])*(q[2][0]-q[0][0]);
      if (Math.abs(det)>1e-14 && q.every(p => p.every(c=>c>=0&&c<=1))) {
        const w = Math.min(tex.width, 32 * 2 ** levels), h = Math.max(1, Math.round(tex.height*w/tex.width));
        const loX=Math.max(0,Math.floor(Math.min(...q.map(p=>p[0]))*w)), hiX=Math.min(w-1,Math.floor(Math.max(...q.map(p=>p[0]))*w));
        const loY=Math.max(0,Math.floor(Math.min(...q.map(p=>p[1]))*h)), hiY=Math.min(h-1,Math.floor(Math.max(...q.map(p=>p[1]))*h));
        if (checks+(hiX-loX+1)*(hiY-loY+1)<=2000000) {
          for(let y=loY;y<=hiY;y++) for(let x=loX;x<=hiX;x++) {
            checks++; const dx=(x+0.5)/w-q[0][0],dy=(y+0.5)/h-q[0][1];
            const b=(dx*(q[2][1]-q[0][1])-dy*(q[2][0]-q[0][0]))/det, c=((q[1][0]-q[0][0])*dy-(q[1][1]-q[0][1])*dx)/det, bary=[1-b-c,b,c];
            if(bary.some(n=>n< -1e-12)) continue;
            const v = { p:[0,0,0], uv:[0,1].map(j=>bary.reduce((n,f,i)=>n+f*t.v[i].uv[j],0)), linear:[0,1,2].map(j=>bary.reduce((n,f,i)=>n+f*t.v[i].linear[j],0)) };
            record(sample(v,t.material),a/(Math.abs(det)*0.5*w*h)); covered++;
          }
        } else { checks=2000000; sampleBudgetReached=true; }
      }
    } else if (tex) sampleBudgetReached = true;
    if (!covered) for (const v of samplePoints(t)) record(sample(v, t.material), a / 7);
  }
  const colors = [], weights = [];
  for (const entry of histogram.values()) { colors.push(entry.slice(0,3).map(v=>v/entry[3])); weights.push(entry[3]); }
  let palette = custom?.length ? custom : fitPalette(colors, weights, count);
  if (palette.length < 1 || palette.length > 16 || palette.some(p => p.length !== 3 || p.some(v => !Number.isFinite(v) || v < 0 || v > 1))) throw new Error('Invalid custom palette');
  // Gamut mapping + fixed RGB palette happens before assigning labels and optimizing.
  palette = palette.map(p => p.map(x => Math.round(x * 255) / 255));
  const traced = levels ? traceTextureSurface(input, materials, palette, { resolution: 32 * 2 ** levels }) : { triangles: [], fallback: input, report: { tracedFaces: 0, fallbackFaces: input.length } };
  const refined = traced.fallback.length ? refineSurface(traced.fallback, sample, palette, { levels, maxTriangles: 150000 - traced.triangles.length }) : { triangles: [], budgetReached: false };
  const triangles = [...traced.triangles, ...refined.triangles];
  const faceColors = triangles.map(t => sample(centroid(t), t.material)), areas = triangles.map(area);
  const graph = surfaceGraph(triangles), result = optimizeLabels(faceColors, palette, graph.edges, { strength, weights: areas });
  const coverage = new Array(palette.length).fill(0); let totalArea = 0;
  areas.forEach((a, i) => { coverage[result.labels[i]] += a; totalArea += a; });
  return { triangles, palette, labels: result.labels, report: { inputTriangles: input.length, outputTriangles: triangles.length, budgetReached: refined.budgetReached, nonManifoldEdges: graph.nonManifoldEdges, energy: result.energies, changed: result.changed, solver: result.solver, cutLimited: result.cutLimited ?? false, coverage: coverage.map(a => a / totalArea), paletteSampleChecks: checks, sampleBudgetReached, trace: traced.report } };
}
