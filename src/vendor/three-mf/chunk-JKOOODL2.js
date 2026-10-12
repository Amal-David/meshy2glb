import {
  parsePaint,
  serializePaint
} from "./chunk-A7PZNYIJ.js";

// src/compat/paint-codec.ts
function translatePaint(hex, source, target) {
  if (!hex) return { hex: "", maxState: 0 };
  const tree = parsePaint(hex, source);
  const maximum = (node) => "region" in node ? node.region : Math.max(...node.children.map(maximum));
  return { hex: serializePaint(tree, target), maxState: maximum(tree) };
}

export {
  translatePaint
};
