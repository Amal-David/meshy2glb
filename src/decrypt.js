// Clean-room decoder for the `.meshy` container.
//
// File layout (reverse-engineered):
//   bytes 0..7      "MESHY.AI" magic
//   bytes 8..9      little-endian version (observed: 1)
//   bytes 10..21    12-byte AES nonce
//   bytes 22..31    reserved
//   bytes 32..-16   body
//   last 16 bytes   file-level MAC (we don't verify)
//
// Cipher:
//   AES-256-CTR
//   key = 32-byte ASCII literal 'JSON{"accessors":[{"bufferView":'
//   ctr = nonce || uint32be(2)  (AES-GCM keystream layout: J0=1 reserved
//                                for the tag, plaintext blocks start at J0+1)
//
// Body layout — single observed variant across samples:
//
//   body[0..W]      = AES-CTR ciphertext         → GLB[0..W]
//   body[W..W+16]   = 16-byte AES-GCM tag        → skipped (not verified)
//   body[W+16..end] = plaintext meshopt streams  → GLB[W..end]
//
// where W = binDataStart + (end of bufferViews[0]'s on-disk data in buffer 0).
// "On-disk" means:
//   - if bv[0] is meshopt-compressed: ext.byteOffset + ext.byteLength
//     (the compressed span, NOT bv[0].byteLength which is decompressed)
//   - else (e.g. WebP texture): bv[0].byteOffset + bv[0].byteLength
//
// We decrypt the whole body uniformly first, parse the JSON, then restore
// the plaintext meshopt suffix by overlaying body[W+16..] onto out[W..].
//
// Output is a standard GLB using EXT_meshopt_compression that
// three.js's GLTFLoader renders directly when MeshoptDecoder is registered.
// No meshy WASM, no localhost requirement, no allowlist.

const KEY_ASCII = 'JSON{"accessors":[{"bufferView":';
const GCM_TAG_LEN = 16;

let cachedKey = null;
async function importKey() {
  if (cachedKey) return cachedKey;
  cachedKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(KEY_ASCII),
    { name: 'AES-CTR' },
    false,
    ['decrypt']
  );
  return cachedKey;
}

export function isMeshyFile(buffer) {
  if (!buffer || buffer.byteLength < 32) return false;
  const head = new Uint8Array(buffer, 0, 8);
  return new TextDecoder().decode(head) === 'MESHY.AI';
}

export function isGlbFile(buffer) {
  if (!buffer || buffer.byteLength < 4) return false;
  const head = new Uint8Array(buffer, 0, 4);
  return head[0] === 0x67 && head[1] === 0x6c && head[2] === 0x54 && head[3] === 0x46;
}

function ctrBlock(nonce) {
  const counter = new Uint8Array(16);
  counter.set(nonce, 0);
  counter[15] = 0x02;
  return counter;
}

async function decryptRange(body, nonce, end) {
  const key = await importKey();
  return new Uint8Array(await crypto.subtle.decrypt(
    { name: 'AES-CTR', counter: ctrBlock(nonce), length: 32 },
    key,
    body.subarray(0, end)
  ));
}

export async function meshyToGlb(buffer) {
  if (isGlbFile(buffer)) return buffer;
  if (!isMeshyFile(buffer)) throw new Error('input is neither .meshy nor .glb');

  const bytes = new Uint8Array(buffer);
  const nonce = bytes.subarray(10, 22);
  const body = bytes.subarray(32, bytes.length - 16);

  // Step 1: uniform AES-CTR decryption over the whole body.
  const key = await importKey();
  const out = new Uint8Array(await crypto.subtle.decrypt(
    { name: 'AES-CTR', counter: ctrBlock(nonce), length: 32 },
    key,
    body
  ));

  const outView = new DataView(out.buffer);
  if (outView.getUint32(0, true) !== 0x46546c67) {
    throw new Error('decrypted prefix is not a GLB (wrong magic)');
  }
  const jsonLen = outView.getUint32(12, true);
  let json;
  try {
    json = JSON.parse(new TextDecoder().decode(out.subarray(20, 20 + jsonLen)));
  } catch (e) {
    throw new Error(`could not parse decrypted glTF JSON: ${e.message}`);
  }
  const binDataStart = 20 + ((jsonLen + 3) & ~3) + 8;

  // Step 2: find W = end of bufferViews[0]'s on-disk data in buffer 0.
  const bv0 = json.bufferViews?.[0];
  let bv0DiskEnd;
  if (bv0?.extensions?.EXT_meshopt_compression) {
    const ext = bv0.extensions.EXT_meshopt_compression;
    if ((ext.buffer ?? 0) === 0) bv0DiskEnd = (ext.byteOffset ?? 0) + ext.byteLength;
  } else if (bv0 && (bv0.buffer ?? 0) === 0) {
    bv0DiskEnd = (bv0.byteOffset ?? 0) + bv0.byteLength;
  }

  // If we can't locate bv[0]'s on-disk span, there's nothing to overlay —
  // return the uniform decryption (best-effort).
  if (bv0DiskEnd === undefined) return out.buffer;

  // Apply the plaintext-meshopt overlay if there's room.
  const W = binDataStart + bv0DiskEnd;
  if (W + GCM_TAG_LEN > body.length) return out.buffer;
  out.set(body.subarray(W + GCM_TAG_LEN), W);
  return out.buffer;
}
