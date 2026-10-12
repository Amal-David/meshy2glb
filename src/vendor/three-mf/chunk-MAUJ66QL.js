// src/compat/mesh.ts
import { Vector3 } from "three";
function transformMesh(mesh, matrix) {
  const vertices = [], p = new Vector3();
  for (let i = 0; i < mesh.vertices.length; i += 3) {
    p.fromArray(mesh.vertices, i).applyMatrix4(matrix);
    if (![p.x, p.y, p.z].every((n) => Number.isFinite(n) && Math.abs(n) <= 1e6))
      throw new Error(
        "A placement transform produces invalid or excessively large coordinates."
      );
    vertices.push(p.x, p.y, p.z);
  }
  const triangles = [...mesh.triangles];
  if (matrix.determinant() < 0)
    for (let i = 0; i < triangles.length; i += 3)
      [triangles[i + 1], triangles[i + 2]] = [
        triangles[i + 2],
        triangles[i + 1]
      ];
  return { vertices, triangles };
}
function compactMesh(mesh) {
  const map = /* @__PURE__ */ new Map(), vertices = [];
  const triangles = mesh.triangles.map((index) => {
    let next = map.get(index);
    if (next === void 0) {
      next = vertices.length / 3;
      map.set(index, next);
      vertices.push(...mesh.vertices.slice(index * 3, index * 3 + 3));
    }
    return next;
  });
  return { vertices, triangles };
}

export {
  transformMesh,
  compactMesh
};
