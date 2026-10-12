import { MAX_BYTES, parseGlb, writeGlb, align4 } from './glb.js';

// Reconstruct meshopt buffer views without dropping extras, names or other extensions.
export async function decompressGlb(buffer, decoder) {
  const { json, bin } = parseGlb(buffer), views = json.bufferViews ?? [];
  if (!views.some(v => v.extensions?.EXT_meshopt_compression)) return buffer;
  // A standalone decoder cannot resolve external resources. Never guess their bytes.
  if ((json.buffers ?? []).some(b => b.uri)) throw new Error('Meshopt GLB with external buffers requires a complete asset package');
  await decoder.ready;
  let total = 0; const chunks = [], outViews = [];
  for (const view of views) {
    const ext = view.extensions?.EXT_meshopt_compression;
    const size = ext ? ext.count * ext.byteStride : view.byteLength;
    const off = (ext ? ext.byteOffset : view.byteOffset) ?? 0;
    const len = ext ? ext.byteLength : view.byteLength;
    const sourceBuffer = (ext ? ext.buffer : view.buffer) ?? 0;
    if (sourceBuffer !== 0) throw new Error('Only the embedded source buffer is supported');
    if (![size, off, len].every(n => Number.isSafeInteger(n) && n >= 0) || size === 0 || off + len > bin.length) throw new Error('Invalid meshopt span or buffer size');
    if (ext && (!Number.isSafeInteger(ext.count) || ext.count <= 0 || !Number.isSafeInteger(ext.byteStride) || ext.byteStride <= 0 || view.byteLength !== size)) throw new Error('Meshopt decoded size does not match buffer view');
    const offset = align4(total); if (offset + size > MAX_BYTES) throw new Error('Decoded model exceeds 256 MiB');
    const bytes = ext ? new Uint8Array(size) : bin.subarray(off, off + len);
    if (ext) decoder.decodeGltfBuffer(bytes, ext.count, ext.byteStride, bin.subarray(off, off + len), ext.mode, ext.filter || '');
    const next = { ...view, buffer: 0, byteOffset: offset, byteLength: size };
    if (next.extensions) { next.extensions = { ...next.extensions }; delete next.extensions.EXT_meshopt_compression; if (!Object.keys(next.extensions).length) delete next.extensions; }
    chunks.push({ offset, bytes }); outViews.push(next); total = offset + size;
  }
  const output = { ...json, buffers: [{ byteLength: total }], bufferViews: outViews };
  for (const key of ['extensionsUsed', 'extensionsRequired']) {
    const exts = (json[key] ?? []).filter(e => e !== 'EXT_meshopt_compression');
    if (exts.length) output[key] = exts; else delete output[key];
  }
  const binary = new Uint8Array(total); for (const { offset, bytes } of chunks) binary.set(bytes, offset);
  return writeGlb(output, binary);
}
