// Minimal GLB container utilities, shared by the site, extension and tests.
export const MAX_BYTES = 256 * 1024 * 1024;
const enc = new TextEncoder();
export const align4 = n => Math.ceil(n / 4) * 4;
export function asBuffer(value) {
  if (value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  throw new TypeError('Expected binary model data');
}
export function parseGlb(input) {
  const buffer = asBuffer(input), bytes = new Uint8Array(buffer), d = new DataView(buffer);
  if (buffer.byteLength < 20 || buffer.byteLength > MAX_BYTES) throw new Error('GLB size is invalid or exceeds 256 MiB');
  if (d.getUint32(0, true) !== 0x46546c67 || d.getUint32(4, true) !== 2) throw new Error('Expected GLB version 2');
  if (d.getUint32(8, true) !== buffer.byteLength) throw new Error('GLB declared length does not match its bytes');
  let json, bin = new Uint8Array(), at = 12, chunks = 0, hasBin = false;
  while (at < bytes.length) {
    if (at + 8 > bytes.length) throw new Error('Truncated GLB chunk');
    const length = d.getUint32(at, true), type = d.getUint32(at + 4, true);
    if (length % 4 || at + 8 + length > bytes.length) throw new Error('Invalid GLB chunk length or alignment');
    const data = bytes.subarray(at + 8, at + 8 + length);
    if (chunks === 0 && type !== 0x4e4f534a) throw new Error('First GLB chunk must be JSON');
    if (type === 0x4e4f534a) {
      if (json) throw new Error('Duplicate GLB JSON chunk');
      json = JSON.parse(new TextDecoder().decode(data));
    } else if (type === 0x004e4942) {
      if (hasBin) throw new Error('Duplicate GLB BIN chunk');
      bin = data; hasBin = true;
    }
    chunks++; at += 8 + length;
  }
  if (!json || json.asset?.version !== '2.0') throw new Error('Expected glTF 2.0 metadata');
  if (json.buffers?.[0] && !json.buffers[0].uri && json.buffers[0].byteLength > bin.length) throw new Error('GLB binary buffer is truncated');
  return { json, bin };
}
export function writeGlb(json, binary = new Uint8Array()) {
  const jb = enc.encode(JSON.stringify(json)), jlen = align4(jb.length), blen = align4(binary.length);
  const length = 12 + 8 + jlen + (binary.length ? 8 + blen : 0);
  if (length > MAX_BYTES) throw new Error('Output exceeds 256 MiB');
  const out = new Uint8Array(length), d = new DataView(out.buffer);
  d.setUint32(0, 0x46546c67, true); d.setUint32(4, 2, true); d.setUint32(8, length, true);
  d.setUint32(12, jlen, true); d.setUint32(16, 0x4e4f534a, true);
  out.fill(32, 20, 20 + jlen); out.set(jb, 20);
  if (binary.length) { const b = 20 + jlen; d.setUint32(b, blen, true); d.setUint32(b + 4, 0x004e4942, true); out.set(binary, b + 8); }
  return out.buffer;
}
export function validateMeshes(meshes, maxTriangles = 500000) {
  if (!Array.isArray(meshes) || !meshes.length || meshes.length > 2048) throw new Error('No supported visible meshes, or too many meshes');
  let total = 0;
  for (const mesh of meshes) {
    const p = mesh.positions, ix = mesh.indices;
    if (!p?.length || p.length % 3 || p.length > maxTriangles * 9) throw new Error('Invalid position buffer');
    for (const n of p) if (!Number.isFinite(n) || Math.abs(n) > 1e15) throw new Error('Non-finite or excessive vertex coordinate');
    const count = ix ? ix.length : p.length / 3;
    if (!count || count % 3 || (total += count / 3) > maxTriangles) throw new Error('Invalid triangle count or 500k-triangle budget exceeded');
    if (ix) for (const n of ix) if (!Number.isSafeInteger(n) || n < 0 || n >= p.length / 3) throw new Error('Triangle index is out of bounds');
  }
  return total;
}
export function geometryGlb(meshes) {
  validateMeshes(meshes);
  const json = { asset: { version: '2.0', generator: 'meshy2glb geometry snapshot' }, scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], accessors: [], bufferViews: [], buffers: [] };
  const chunks = []; let length = 0;
  function append(array, componentType, type, count, bounds) {
    const offset = align4(length); if (offset > length) chunks.push(new Uint8Array(offset - length));
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength); chunks.push(bytes); length = offset + bytes.length;
    const view = json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length }) - 1;
    return json.accessors.push({ bufferView: view, componentType, count, type, ...bounds }) - 1;
  }
  meshes.forEach((mesh, i) => {
    const p = new Float32Array(mesh.positions), min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let j = 0; j < p.length; j++) { min[j % 3] = Math.min(min[j % 3], p[j]); max[j % 3] = Math.max(max[j % 3], p[j]); }
    const primitive = { attributes: { POSITION: append(p, 5126, 'VEC3', p.length / 3, { min, max }) }, mode: 4 };
    if (mesh.indices) primitive.indices = append(new Uint32Array(mesh.indices), 5125, 'SCALAR', mesh.indices.length);
    json.meshes.push({ primitives: [primitive] }); json.nodes.push({ mesh: i, name: `Mesh ${i + 1}` }); json.scenes[0].nodes.push(i);
  });
  json.buffers.push({ byteLength: length }); const binary = new Uint8Array(length); let at = 0;
  for (const chunk of chunks) { binary.set(chunk, at); at += chunk.length; }
  return writeGlb(json, binary);
}
