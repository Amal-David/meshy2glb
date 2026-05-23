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
// Body layout, where W is the GLB header+JSON+BIN-header+WebP region length
// (W = 2516 + bufferViews[0].byteLength, computed from the decrypted JSON):
//   body[0..W]      AES-256-CTR ciphertext  → decrypts to GLB[0..W]
//   body[W..W+16]   AES-GCM tag for the prefix (skipped)
//   body[W+16..end] plaintext meshopt streams → mapped to GLB[W..end]
//
// Cipher:
//   AES-256-CTR
//   key = 32-byte ASCII literal 'JSON{"accessors":[{"bufferView":'
//   ctr = nonce || uint32be(2)  (AES-GCM keystream layout: J0=1 reserved
//                                for the tag, plaintext blocks start at J0+1)
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

  // Decrypt the entire body uniformly. The encrypted region is body[0..W]
  // (where W = 2516 + bufferViews[0].byteLength); past that the body holds a
  // 16-byte AES-GCM tag and then plaintext meshopt streams. Decrypting the
  // tail with CTR scrambles those plaintext bytes — we restore them by
  // overlaying body[W+16..end] onto out[W..]. The GLB's JSON declares
  // bv-byteLengths that slightly overshoot the actual meshopt encoded data,
  // so the last 16 bytes of the GLB (still scrambled CTR output) are inside
  // an unused tail and the decoder ignores them.
  const key = await importKey();
  const out = new Uint8Array(await crypto.subtle.decrypt(
    { name: 'AES-CTR', counter: ctrBlock(nonce), length: 32 },
    key,
    body
  ));

  // Read the freshly-decrypted JSON to find W.
  const outView = new DataView(out.buffer);
  if (outView.getUint32(0, true) !== 0x46546c67) {
    throw new Error('decrypted prefix is not a GLB (wrong magic)');
  }
  const jsonLen = outView.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(out.subarray(20, 20 + jsonLen)));
  const binDataStart = 20 + ((jsonLen + 3) & ~3) + 8;
  const bv0 = json.bufferViews?.[0];
  if (!bv0 || typeof bv0.byteLength !== 'number') {
    throw new Error('decrypted GLB has no bufferViews[0] — unsupported variant');
  }
  const W = binDataStart + bv0.byteLength;

  // Overlay plaintext meshopt over the CTR-scrambled tail.
  out.set(body.subarray(W + GCM_TAG_LEN), W);
  return out.buffer;
}
