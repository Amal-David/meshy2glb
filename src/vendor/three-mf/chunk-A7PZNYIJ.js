// src/limits.ts
var DEFAULT_LIMITS = Object.freeze({
  maxExpandedBytes: 1024 * 1024 * 1024,
  maxEntryBytes: 512e6,
  maxArchiveEntries: 1e5,
  maxSourceTriangles: 1e7,
  maxResolvedTriangles: 5e6,
  maxPaintNodes: 1e7,
  maxPaintDepth: 40
});
function processingLimits(options = {}) {
  const result = { ...DEFAULT_LIMITS };
  for (const [key, value] of Object.entries(options)) {
    if (!(key in result) || typeof value !== "number" || !(value > 0) || value !== Infinity && !Number.isSafeInteger(value))
      throw new Error("Invalid processing limit: " + key + ".");
    result[key] = value;
  }
  return result;
}
function budgetError(what, key) {
  throw new Error(
    what + " exceeds the processing budget (" + key + "). Increase that budget on a device with enough memory, or reduce the model."
  );
}

// src/paint.js
var midpoint = (a, b) => a.map((x, i) => (x + b[i]) / 2);
function childrenOf(v, sides, side) {
  const [a, b, c] = [v[side], v[(side + 1) % 3], v[(side + 2) % 3]];
  if (sides === 1) {
    const m = midpoint(b, c);
    return [
      [a, b, m],
      [m, c, a]
    ];
  }
  const ab = midpoint(a, b), ca = midpoint(c, a);
  if (sides === 2)
    return [
      [a, ab, ca],
      [ab, b, ca],
      [b, c, ca]
    ];
  const bc = midpoint(b, c);
  return [
    [a, ab, ca],
    [ab, b, bc],
    [bc, c, ca],
    [ab, bc, ca]
  ];
}
function decodePaint(v, hex, fallback = 1, dialect = "prusa") {
  return resolvePaint(v, parsePaint(hex, dialect), fallback);
}
function encodePaint(state, dialect = "prusa") {
  if (!Number.isInteger(state) || state < 0 || state > 255)
    throw new Error("Invalid material index.");
  if (state < 3) return (state * 4).toString(16).toUpperCase();
  if (dialect === "bambu")
    return ((state - 3) % 15).toString(16).toUpperCase() + "F".repeat(Math.floor((state - 3) / 15)) + "C";
  return state < 17 ? (state - 3).toString(16).toUpperCase() + "C" : (state - 17).toString(16).toUpperCase().padStart(2, "0") + "EC";
}
function parsePaint(hex, dialect = "prusa", options = {}, budget = { nodes: 0 }) {
  const limits = processingLimits(options);
  if (!hex) return { region: 0 };
  if (!/^[\da-f]+$/i.test(hex) || hex.length > limits.maxPaintNodes * 32)
    throw new Error("Invalid triangle paint encoding.");
  let cursor = hex.length - 1;
  const next = () => {
    if (cursor < 0) throw new Error("Truncated triangle paint data.");
    return parseInt(hex[cursor--], 16);
  };
  const read = (depth = 0) => {
    if (depth > limits.maxPaintDepth)
      budgetError("Triangle paint depth", "maxPaintDepth");
    if (++budget.nodes > limits.maxPaintNodes)
      budgetError("Triangle paint nodes", "maxPaintNodes");
    const code = next(), split = code & 3, side = code >> 2;
    if (split) {
      if (side > 2 || split === 3 && side !== 0)
        throw new Error("Unsupported triangle paint subdivision.");
      const children = Array.from({ length: split + 1 });
      for (let i = split; i >= 0; i--) children[i] = read(depth + 1);
      return { split, side, children };
    }
    let region = side;
    if (region === 3) {
      let n = next();
      if (dialect === "bambu" || dialect === "orca") {
        region = 3;
        while (n === 15) {
          region += 15;
          n = next();
        }
        region += n;
      } else {
        if (n === 15) throw new Error("Invalid Prusa paint prefix.");
        region = n === 14 ? 17 + next() + 16 * next() : n + 3;
      }
    }
    if (region > 255)
      throw new Error("Paint uses an unsupported material index.");
    if (dialect === "orca" && region > 16)
      throw new Error("OrcaSlicer 2.4.2 supports painted material slots 1\u201316.");
    return { region };
  };
  const result = read();
  if (cursor >= 0)
    throw new Error("Unrecognized trailing triangle paint data.");
  return result;
}
function serializePaint(tree, dialect = "prusa", options = {}) {
  const limits = processingLimits(options);
  let nodes = 0;
  const write = (t, depth = 0) => {
    if (!t || depth > limits.maxPaintDepth || ++nodes > limits.maxPaintNodes)
      throw new Error("Invalid or excessive paint tree.");
    if ("region" in t) {
      if (dialect === "orca" && t.region > 16)
        throw new Error(
          "OrcaSlicer 2.4.2 supports painted material slots 1\u201316."
        );
      return encodePaint(t.region, dialect === "orca" ? "bambu" : dialect);
    }
    if (![1, 2, 3].includes(t.split) || ![0, 1, 2].includes(t.side) || t.split === 3 && t.side !== 0 || t.children?.length !== t.split + 1)
      throw new Error("Invalid paint subdivision.");
    return t.children.map((c) => write(c, depth + 1)).join("") + (t.side << 2 | t.split).toString(16).toUpperCase();
  };
  return write(tree);
}
function paintStats(tree, options = {}, budget = { nodes: 0 }) {
  const limits = processingLimits(options);
  let leaves = 0, maxRegion = 0;
  const visit = (node, depth) => {
    if (!node || typeof node !== "object")
      throw new Error("Invalid paint tree.");
    if (depth > limits.maxPaintDepth)
      budgetError("Triangle paint depth", "maxPaintDepth");
    if (++budget.nodes > limits.maxPaintNodes)
      budgetError("Triangle paint nodes", "maxPaintNodes");
    if ("region" in node) {
      encodePaint(node.region);
      leaves++;
      maxRegion = Math.max(maxRegion, node.region);
      return;
    }
    if (![1, 2, 3].includes(node.split) || ![0, 1, 2].includes(node.side) || node.split === 3 && node.side !== 0 || node.children?.length !== node.split + 1)
      throw new Error("Invalid paint subdivision.");
    for (const c of node.children) visit(c, depth + 1);
  };
  visit(tree, 0);
  return { leaves, maxRegion };
}
function resolvePaint(points, tree, fallback = 1, options = {}) {
  const limits = processingLimits(options);
  if (paintStats(tree, limits).leaves > limits.maxResolvedTriangles)
    budgetError("Resolved paint triangles", "maxResolvedTriangles");
  const result = [];
  const walk = (v, t) => {
    if ("region" in t) result.push({ v, material: t.region || fallback });
    else {
      const children = childrenOf(v, t.split, t.side);
      for (let i = children.length - 1; i >= 0; i--)
        walk(children[i], t.children[i]);
    }
  };
  walk(points, tree);
  return result;
}

export {
  DEFAULT_LIMITS,
  processingLimits,
  budgetError,
  midpoint,
  childrenOf,
  decodePaint,
  encodePaint,
  parsePaint,
  serializePaint,
  paintStats,
  resolvePaint
};
