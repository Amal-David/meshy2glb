// The reverse-engineered v1 container encrypts only an 8192-byte prefix.
// The following 16-byte tag is skipped, not authenticated; validate the output.
import { asBuffer, MAX_BYTES } from './glb.js';
const KEY = 'JSON{"accessors":[{"bufferView":';
let key;
export function isMeshyFile(value) {
  if (!value || value.byteLength < 32) return false;
  return new TextDecoder().decode(new Uint8Array(asBuffer(value), 0, 8)) === 'MESHY.AI';
}
export function isGlbFile(value) {
  if (!value || value.byteLength < 4) return false;
  return new DataView(asBuffer(value)).getUint32(0, true) === 0x46546c67;
}
export async function meshyToGlb(value) {
  const buffer = asBuffer(value);
  if (isGlbFile(buffer)) return buffer;
  if (!isMeshyFile(buffer)) throw new Error('input is neither .meshy nor .glb');
  if (buffer.byteLength < 8240) throw new Error('.meshy body too small');
  if (buffer.byteLength > MAX_BYTES) throw new Error('Model exceeds 256 MiB');
  if (new DataView(buffer).getUint16(8, true) !== 1) throw new Error('Unsupported .meshy version (only v1 is verified)');
  const bytes = new Uint8Array(buffer), counter = new Uint8Array(16);
  counter.set(bytes.subarray(10, 22)); counter[15] = 2;
  key ??= crypto.subtle.importKey('raw', new TextEncoder().encode(KEY), 'AES-CTR', false, ['decrypt']);
  const prefix = await crypto.subtle.decrypt({ name: 'AES-CTR', counter, length: 32 }, await key, bytes.subarray(32, 8224));
  if (!isGlbFile(prefix) || new DataView(prefix).getUint32(4, true) !== 2) throw new Error('Decrypted prefix is not a GLB v2');
  const out = new Uint8Array(buffer.byteLength - 48); out.set(new Uint8Array(prefix)); out.set(bytes.subarray(8240), 8192);
  new DataView(out.buffer).setUint32(8, out.length, true);
  return out.buffer;
}
