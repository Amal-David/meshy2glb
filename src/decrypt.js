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
// Body layout:
//
//   body[0..W]      = AES-CTR ciphertext         → GLB[0..W]
//   body[W..W+16]   = 16-byte AES-GCM tag        → skipped (not verified)
//   body[W+16..end] = plaintext meshopt streams  → GLB[W..end]
//
// W = max(binDataStart + nonMeshoptDataEnd, MIN_ENCRYPTED)
//
// where nonMeshoptDataEnd is the byte-offset past the last non-meshopt
// bufferView in buffer 0 (e.g. a WebP texture), and MIN_ENCRYPTED = 8192.
//
// When all bufferViews use EXT_meshopt_compression (no texture data),
// nonMeshoptDataEnd = 0 and W falls back to 8192 — the encoder always
// encrypts at least 8 KB.  When a non-meshopt bv (e.g. WebP) exists,
// its on-disk span typically exceeds 8 KB, so W = binDataStart + that span.
//
// We decrypt the whole body uniformly first, parse the JSON, then restore
// the plaintext meshopt suffix by overlaying body[W+16..] onto out[W..].
//
// Output is a standard GLB using EXT_meshopt_compression that
// three.js's GLTFLoader renders directly when MeshoptDecoder is registered.
// No meshy WASM, no localhost requirement, no allowlist.

const KEY_ASCII = 'JSON{"accessors":[{"bufferView":';
const GCM_TAG_LEN = 16;
const MIN_ENCRYPTED = 8192;

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

  // Step 2: find W — the boundary between encrypted and plaintext regions.
  // W = max(binDataStart + nonMeshoptDataEnd, MIN_ENCRYPTED).
  // nonMeshoptDataEnd = end of the last non-meshopt bufferView in buffer 0.
  let nonMeshoptEnd = 0;
  for (const bv of json.bufferViews ?? []) {
    if (bv.extensions?.EXT_meshopt_compression) continue;
    if ((bv.buffer ?? 0) !== 0) continue;
    const end = (bv.byteOffset ?? 0) + bv.byteLength;
    if (end > nonMeshoptEnd) nonMeshoptEnd = end;
  }

  const W = Math.max(binDataStart + nonMeshoptEnd, MIN_ENCRYPTED);

  // Apply the plaintext-meshopt overlay if there's room.
  if (W + GCM_TAG_LEN > body.length) return out.buffer;
  out.set(body.subarray(W + GCM_TAG_LEN), W);
  return out.buffer;
}
