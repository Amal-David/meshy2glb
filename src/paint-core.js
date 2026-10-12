import { binaryCut } from './binary-cut.js';
// Independent perceptual quantization + contrast-aware Potts cleanup.
// See docs/ALGORITHM.md for the objective, guarantees, benchmark scope and limits.
export const srgbToLinear = x => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
export const linearToSrgb = x => Math.max(0, Math.min(1, x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055));
export function rgbToLab(rgb) {
  const [r, g, b] = rgb.map(srgbToLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
export function labToRgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map(linearToSrgb);
}
export const distance2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
export function nearest(color, palette) {
  let best = 0, cost = Infinity;
  palette.forEach((p, i) => { const d = distance2(color, p); if (d < cost) { cost = d; best = i; } }); return best;
}
export function fitPalette(colors, weights, count = 4) {
  if (!colors.length || colors.length > 100000 || !Number.isInteger(count) || count < 2 || count > 16) throw new Error('Palette needs samples and 2–16 colors');
  if (weights.length !== colors.length || weights.some(w => !Number.isFinite(w) || w < 0) || !weights.some(w => w > 0)) throw new Error('Invalid sample areas');
  for (const rgb of colors) if (rgb.length !== 3 || rgb.some(v => !Number.isFinite(v) || v < 0 || v > 1)) throw new Error('Invalid source color');
  let largest = 0; weights.forEach((w, i) => { if (w > weights[largest]) largest = i; });
  const labs = colors.map(rgbToLab), palette = [labs[largest].slice()];
  // Deterministic weighted farthest-first initialization (not random k-means++).
  const bestDistances = new Float64Array(labs.length).fill(Infinity);
  while (palette.length < count) {
    let best = -1, score = -1;
    labs.forEach((p, i) => { bestDistances[i] = Math.min(bestDistances[i], distance2(p, palette.at(-1))); const s = bestDistances[i] * weights[i]; if (s > score) { score = s; best = i; } });
    if (score <= 1e-14) break; palette.push(labs[best].slice());
  }
  for (let it = 0; it < 24; it++) {
    const sums = palette.map(() => [0, 0, 0, 0]);
    labs.forEach((p, i) => { const s = sums[nearest(p, palette)], w = weights[i]; for (let c = 0; c < 3; c++) s[c] += p[c] * w; s[3] += w; });
    let move = 0;
    sums.forEach((s, i) => { if (s[3]) { const next = s.slice(0, 3).map(x => x / s[3]); move += distance2(next, palette[i]); palette[i] = next; } });
    if (move < 1e-12) break;
  }
  return palette.map(labToRgb);
}
export function optimizeLabels(colors, paletteRgb, edges, { strength = 0.35, sigma = 0.075, passes = 6, weights, initial, solver = 'auto' } = {}) {
  for (const rgb of [...colors, ...paletteRgb]) if (!Array.isArray(rgb) || rgb.length !== 3 || rgb.some(v => !Number.isFinite(v) || v < 0 || v > 1)) throw new Error('Invalid cleanup color');
  const n = colors.length, palette = paletteRgb.map(rgbToLab), labs = colors.map(rgbToLab);
  if (!n || n > 500000 || palette.length < 1 || palette.length > 16 || edges.length > n * 8) throw new Error('Paint graph exceeds its budget');
  if (!Number.isFinite(strength) || strength < 0 || strength > 5 || !Number.isFinite(sigma) || sigma <= 0 || !Number.isInteger(passes) || passes < 0 || passes > 20) throw new Error('Invalid cleanup settings');
  const area = weights ?? new Array(n).fill(1), avg = area.reduce((a, b) => a + b, 0) / n;
  if (area.length !== n || !Number.isFinite(avg) || avg <= 0 || area.some(w => w < 0 || !Number.isFinite(w))) throw new Error('Invalid graph weights');
  const nodeWeights = area.map(w => w / avg), adjacency = Array.from({ length: n }, () => []), weightedEdges = [];
  for (const [a, b, length = 1] of edges) {
    if (![a, b].every(i => Number.isInteger(i) && i >= 0 && i < n) || a === b || !Number.isFinite(length) || length < 0) throw new Error('Invalid graph edge');
    const w = strength * length * Math.exp(-distance2(labs[a], labs[b]) / (2 * sigma * sigma));
    adjacency[a].push([b, w]); adjacency[b].push([a, w]); weightedEdges.push([a, b, w]);
  }
  const labels = initial ? new Uint8Array(initial) : Uint8Array.from(labs, c => nearest(c, palette));
  if (labels.length !== n || labels.some(v => v >= palette.length)) throw new Error('Invalid initial labels');
  const unary = (i, label) => nodeWeights[i] * distance2(labs[i], palette[label]) / (sigma * sigma);
  const energy = () => {
    let e = 0; for (let i = 0; i < n; i++) e += unary(i, labels[i]);
    for (const [a, b, w] of weightedEdges) if (labels[a] !== labels[b]) e += w; return e;
  };
  const energies = [energy()]; let changed = 0, cutLimited = false;
  if (passes > 0 && palette.length === 2 && n <= 12000 && solver !== 'icm') {
    try {
      const cut = binaryCut(Array.from({ length:n }, (_,i) => [unary(i,0),unary(i,1)]), weightedEdges);
      for(let i=0;i<n;i++) if(labels[i] !== cut.labels[i]) changed++;
      labels.set(cut.labels); energies.push(energy());
      return { labels, energies, changed, solver:'binary-min-cut', cutSteps:cut.steps };
    } catch (error) { if (!error.message.includes('operation budget')) throw error; cutLimited = true; }
  }
  // Sequential ICM: every accepted update strictly lowers this same global energy.
  for (let pass = 0; pass < passes; pass++) {
    let changes = 0;
    for (let j = 0; j < n; j++) {
      const i = pass % 2 ? n - 1 - j : j;
      const candidates = new Set([labels[i], nearest(labs[i], palette), ...adjacency[i].map(([other]) => labels[other])]);
      const cost = label => unary(i, label) + adjacency[i].reduce((sum, [other, w]) => sum + (labels[other] === label ? 0 : w), 0);
      let best = labels[i], value = cost(best);
      for (const label of candidates) { const e = cost(label); if (e < value - 1e-12) { best = label; value = e; } }
      if (best !== labels[i]) { labels[i] = best; changes++; }
    }
    changed += changes; energies.push(energy()); if (!changes) break;
  }
  return { labels, energies, changed, solver:'icm', cutLimited };
}
export function gridEdges(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 500000) throw new Error('Invalid grid');
  const edges = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const i = y * width + x; if (x + 1 < width) edges.push([i, i + 1]); if (y + 1 < height) edges.push([i, i + width]); }
  return edges;
}
