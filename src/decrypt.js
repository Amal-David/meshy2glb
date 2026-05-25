// Clean-room decoder for the `.meshy` container.
//
// File layout (reverse-engineered):
//   bytes 0..7      "MESHY.AI" magic
//   bytes 8..9      little-endian version (observed: 1)
//   bytes 10..21    12-byte AES nonce
//   bytes 22..31    reserved
//   bytes 32..end   body (everything after the header)
//
// Cipher:
//   AES-256-CTR
//   key = 32-byte ASCII literal 'JSON{"accessors":[{"bufferView":'
//   ctr = nonce || uint32be(2)  (AES-GCM keystream layout)
//
// Body layout:
//   body[0..8192]     AES-CTR ciphertext → decrypts to GLB[0..8192]
//   body[8192..8208]  16-byte AES-GCM auth tag (the only tag; skipped)
//   body[8208..end]   plaintext (textures + meshopt streams) → GLB[8192..end]
//
// The encoder always encrypts exactly 8 KB (512 AES blocks). Everything
// after the 16-byte tag is stored verbatim — WebP textures, meshopt-
// compressed vertex/index streams, alignment padding, all in the clear.
//
// We decrypt the full body with uniform CTR (producing a buffer the same
// size as the body), then overlay body[8208..] at position 8192 to
// restore the plaintext the CTR pass scrambled. The trailing 16 bytes of
// the output are harmless CTR noise inside the last meshopt stream's
// declared range — the decoder ignores them.
//
// Output is a standard GLB using EXT_meshopt_compression.
// No meshy WASM, no localhost requirement, no allowlist.

const KEY_ASCII = 'JSON{"accessors":[{"bufferView":';
const ENCRYPTED_LEN = 8192;
const TAG_LEN = 16;

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

export async function meshyToGlb(buffer) {
  if (isGlbFile(buffer)) return buffer;
  if (!isMeshyFile(buffer)) throw new Error('input is neither .meshy nor .glb');

  const bytes = new Uint8Array(buffer);
  const nonce = bytes.subarray(10, 22);
  const body = bytes.subarray(32);

  if (body.length < ENCRYPTED_LEN + TAG_LEN) {
    throw new Error('.meshy body too small');
  }

  const counter = new Uint8Array(16);
  counter.set(nonce, 0);
  counter[15] = 0x02;

  const key = await importKey();
  const prefix = new Uint8Array(await crypto.subtle.decrypt(
    { name: 'AES-CTR', counter, length: 32 },
    key,
    body.subarray(0, ENCRYPTED_LEN)
  ));

  if (new DataView(prefix.buffer).getUint32(0, true) !== 0x46546c67) {
    throw new Error('decrypted prefix is not a GLB (wrong magic)');
  }

  const plaintext = body.subarray(ENCRYPTED_LEN + TAG_LEN);
  const glbLen = ENCRYPTED_LEN + plaintext.length;
  const out = new Uint8Array(glbLen);
  out.set(prefix, 0);
  out.set(plaintext, ENCRYPTED_LEN);

  new DataView(out.buffer).setUint32(8, glbLen, true);
  return out.buffer;
}
