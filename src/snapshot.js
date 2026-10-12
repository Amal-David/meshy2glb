// Three.js duck-typed geometry extraction: no renderer/library dependency.
// A snapshot is a static pose; it never claims to retain a rig or animation.
export function visibleMeshes(root) {
  const result = [], seen = new Set(), stack = [[root, '0']];
  while (stack.length) {
    const [node, id] = stack.pop();
    if (!node || seen.has(node) || node.visible === false) continue;
    seen.add(node); if (seen.size > 20000) throw new Error('Scene node budget exceeded');
    if (node.isMesh && node.geometry?.attributes?.position) result.push({ node, id });
    const children = node.children ?? []; for (let i = children.length - 1; i >= 0; i--) stack.push([children[i], `${id}.${i}`]);
  }
  return result;
}
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function multiply(a, b) {
  const c = new Array(16).fill(0);
  for (let col = 0; col < 4; col++) for (let row = 0; row < 4; row++) for (let k = 0; k < 4; k++) c[col * 4 + row] += a[k * 4 + row] * b[col * 4 + k];
  return c;
}
const point = (p, m) => [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12], m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13], m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
function mirrored(m) { return m[0]*(m[5]*m[10]-m[6]*m[9])-m[4]*(m[1]*m[10]-m[2]*m[9])+m[8]*(m[1]*m[6]-m[2]*m[5]) < 0; }
export function attribute(attr, i, size) {
  if (!attr || i < 0 || i >= attr.count) throw new Error('Missing or invalid vertex attribute');
  const methods = ['getX', 'getY', 'getZ', 'getW'];
  return Array.from({ length: size }, (_, c) => {
    if (typeof attr[methods[c]] !== 'function') throw new Error('Unsupported vertex-attribute representation');
    const value = attr[methods[c]](i); if (!Number.isFinite(value)) throw new Error('Non-finite vertex attribute'); return value;
  });
}
export function snapshot(root, { selected, maxTriangles = 250000, withAttributes = false } = {}) {
  root.updateWorldMatrix?.(true, true);
  const output = []; let total = 0;
  for (const { node, id } of visibleMeshes(root)) {
    if (selected && !selected.includes(id)) continue;
    const geo = node.geometry, pos = geo.attributes.position, ix = geo.index, materials = Array.isArray(node.material) ? node.material : [node.material];
    const count = ix?.count ?? pos.count, start = Math.max(0, geo.drawRange?.start ?? 0), end = Math.min(count, start + (geo.drawRange?.count ?? Infinity));
    if (!Number.isInteger(start) || start % 3 || end % 3) throw new Error('Non-triangle draw range is unsupported');
    if (node.isInstancedMesh && node.morphTexture) throw new Error('Per-instance morph textures cannot be baked safely');
    const instances = node.isInstancedMesh ? node.count : 1;
    if (!Number.isInteger(instances) || instances < 0 || instances > 10000) throw new Error('Invalid instance count');
    for (let instance = 0; instance < instances; instance++) {
      let matrix = Array.from(node.matrixWorld?.elements ?? identity);
      if (node.isInstancedMesh) {
        if (!node.instanceMatrix?.array) throw new Error('Instance transforms are unavailable');
        matrix = multiply(matrix, Array.from(node.instanceMatrix.array.slice(instance * 16, instance * 16 + 16)));
      }
      const triangles = [], positions = [], indices = [], remap = new Map(), extra = [], materialIds = [];
      const vector = node.position?.clone?.();
      const read = index => {
        if (remap.has(index)) return remap.get(index);
        if (index >= pos.count || index < 0 || !Number.isInteger(index)) throw new Error('Invalid geometry index');
        let local;
        if ((node.isSkinnedMesh || geo.morphAttributes?.position?.length) && (!vector || !node.getVertexPosition)) throw new Error('Cannot bake this deformed mesh safely');
        if (node.getVertexPosition && vector) { node.getVertexPosition(index, vector); local = [vector.x, vector.y, vector.z]; }
        else local = attribute(pos, index, 3);
        const world = point(local, matrix); if (world.some(v => !Number.isFinite(v) || Math.abs(v) > 1e15)) throw new Error('Invalid world-space position');
        const outIndex = positions.length / 3; positions.push(...world); remap.set(index, outIndex);
        if (withAttributes) {
          const color = geo.attributes.color ? attribute(geo.attributes.color, index, 3) : [1, 1, 1];
          const instanceLinear = node.instanceColor ? attribute(node.instanceColor, instance, 3) : [1, 1, 1];
          color.forEach((c, j) => color[j] = c * instanceLinear[j]);
          extra.push({ p: world, linear: color, instanceLinear, uv: geo.attributes.uv ? attribute(geo.attributes.uv, index, 2) : [0, 0], sourceIndex: index });
        }
        return outIndex;
      };
      for (let at = start; at < end; at += 3) {
        const group = geo.groups?.find(g => at >= g.start && at < g.start + g.count), materialIndex = Array.isArray(node.material) ? (group?.materialIndex ?? 0) : 0;
        if (materials[materialIndex]?.visible === false) continue;
        if (++total > maxTriangles) throw new Error(`Snapshot exceeds ${maxTriangles.toLocaleString()} triangles; select fewer meshes`);
        let ids = [0, 1, 2].map(j => read(ix ? ix.getX(at + j) : at + j)); if (mirrored(matrix)) ids = [ids[0], ids[2], ids[1]];
        indices.push(...ids); materialIds.push(materialIndex);
        if (withAttributes) triangles.push(ids.map(i => ({ ...extra[i] })));
      }
      if (indices.length) output.push({ id: `${id}:${instance}`, name: node.name || 'Mesh', positions, indices, triangles, materialIds, materials: withAttributes ? materials : undefined, geometry: withAttributes ? geo : undefined });
    }
  }
  if (!output.length) throw new Error('No selected visible geometry');
  return output;
}
