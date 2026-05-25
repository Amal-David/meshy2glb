// Decompress a GLB that uses EXT_meshopt_compression into a standard
// GLB with raw vertex/index data. This removes the runtime dependency on
// MeshoptDecoder during rendering — the output is a plain GLB that any
// glTF viewer can display.

export async function decompressGlb(glbBuffer, MeshoptDecoder) {
  await MeshoptDecoder.ready;
  const src = new Uint8Array(glbBuffer);
  const dv = new DataView(glbBuffer);

  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(src.slice(20, 20 + jsonLen)));
  const binStart = 20 + ((jsonLen + 3) & ~3) + 8;
  const binData = src.slice(binStart);

  const bvs = json.bufferViews ?? [];
  const hasMeshopt = bvs.some(bv => bv.extensions?.EXT_meshopt_compression);
  if (!hasMeshopt) return glbBuffer;

  const decodedChunks = [];
  let decodedTotal = 0;
  const newBufferViews = [];

  for (const bv of bvs) {
    const ext = bv.extensions?.EXT_meshopt_compression;
    if (ext && (ext.buffer ?? 0) === 0) {
      const compSrc = binData.slice(ext.byteOffset, ext.byteOffset + ext.byteLength);
      const outSize = ext.count * ext.byteStride;
      const target = new Uint8Array(outSize);
      MeshoptDecoder.decodeGltfBuffer(target, ext.count, ext.byteStride, compSrc, ext.mode, ext.filter || '');

      const aligned = (decodedTotal + 3) & ~3;
      while (decodedTotal < aligned) { decodedChunks.push(new Uint8Array([0])); decodedTotal++; }

      newBufferViews.push({
        buffer: 0,
        byteOffset: decodedTotal,
        byteLength: bv.byteLength,
        ...(bv.byteStride ? { byteStride: bv.byteStride } : {}),
        ...(bv.target ? { target: bv.target } : {}),
      });
      decodedChunks.push(target);
      decodedTotal += outSize;
    } else {
      const off = bv.byteOffset ?? 0;
      const raw = binData.slice(off, off + bv.byteLength);

      const aligned = (decodedTotal + 3) & ~3;
      while (decodedTotal < aligned) { decodedChunks.push(new Uint8Array([0])); decodedTotal++; }

      newBufferViews.push({
        buffer: 0,
        byteOffset: decodedTotal,
        byteLength: bv.byteLength,
        ...(bv.byteStride ? { byteStride: bv.byteStride } : {}),
        ...(bv.target ? { target: bv.target } : {}),
      });
      decodedChunks.push(raw);
      decodedTotal += raw.length;
    }
  }

  const newJson = { ...json };
  newJson.bufferViews = newBufferViews;
  newJson.buffers = [{ byteLength: decodedTotal }];

  newJson.extensionsUsed = (json.extensionsUsed ?? []).filter(e => e !== 'EXT_meshopt_compression');
  newJson.extensionsRequired = (json.extensionsRequired ?? []).filter(e => e !== 'EXT_meshopt_compression');
  if (newJson.extensionsUsed.length === 0) delete newJson.extensionsUsed;
  if (newJson.extensionsRequired?.length === 0) delete newJson.extensionsRequired;

  const jsonBytes = new TextEncoder().encode(JSON.stringify(newJson));
  const jsonPadded = jsonBytes.length + ((4 - (jsonBytes.length % 4)) % 4);

  const totalLen = 12 + 8 + jsonPadded + 8 + decodedTotal;
  const out = new Uint8Array(totalLen);
  const odv = new DataView(out.buffer);

  odv.setUint32(0, 0x46546c67, true);
  odv.setUint32(4, 2, true);
  odv.setUint32(8, totalLen, true);

  odv.setUint32(12, jsonPadded, true);
  odv.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  for (let i = jsonBytes.length; i < jsonPadded; i++) out[20 + i] = 0x20;

  const binOff = 20 + jsonPadded;
  odv.setUint32(binOff, decodedTotal, true);
  odv.setUint32(binOff + 4, 0x004e4942, true);

  let pos = binOff + 8;
  for (const chunk of decodedChunks) {
    out.set(chunk, pos);
    pos += chunk.length;
  }

  return out.buffer;
}
