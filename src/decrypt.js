// Decryption pipeline for the `.meshy` container format.
//
// File layout:
//   bytes 0-7    "MESHY.AI" magic
//   bytes 8-9    version
//   bytes 10-21  AES-GCM nonce
//   bytes 22-31  reserved / length
//   bytes 32..   AES-256-GCM ciphertext
//   last 16      GCM authentication tag
// The decrypted payload is a standard GLB using `EXT_meshopt_compression`.
//
// We drive the upstream WASM rather than reimplementing the cipher.
// The viewer must be served from `localhost` for the worker to authorize.

// Deterministic auth signature: FNV-1a + MurmurHash3 fmix64 over
// hostname:timestamp seeded with the salt below.
const AUTH_SALT = 'Meshy_Crypto_Key';

export function meshySignature(hostname, timestamp) {
  const OFFSET = 14695981039346656037n;
  const PRIME  = 1099511628211n;
  const MASK   = 0xFFFFFFFFFFFFFFFFn;
  const e = hostname + ':' + timestamp;
  let r = OFFSET;
  for (let i = 0; i < AUTH_SALT.length; i++) { r ^= BigInt(AUTH_SALT.charCodeAt(i)); r = (r * PRIME) & MASK; }
  for (let i = 0; i < e.length; i++)         { r ^= BigInt(e.charCodeAt(i));         r = (r * PRIME) & MASK; }
  r ^= r >> 33n;
  r = (r * 0xff51afd7ed558ccdn) & MASK;
  r ^= r >> 33n;
  r = (r * 0xc4ceb9fe1a85ec53n) & MASK;
  r ^= r >> 33n;
  return r.toString(16).padStart(16, '0');
}

export function isMeshyFile(buffer) {
  if (!buffer || buffer.byteLength < 8) return false;
  const head = new Uint8Array(buffer, 0, 8);
  return new TextDecoder().decode(head).startsWith('MESHY.AI');
}

export function isGlbFile(buffer) {
  if (!buffer || buffer.byteLength < 4) return false;
  return new Uint32Array(buffer.slice(0, 4))[0] === 0x46546C67; // 'glTF'
}

export class MeshyDecryptor {
  constructor({ workerUrl = './vendor/loader-worker.min.js', onStatus } = {}) {
    this.workerUrl = workerUrl;
    this.onStatus = onStatus ?? (() => {});
    this.worker = null;
    this.ready = null;
    this.nextId = 0;
    this.pending = new Map();
  }

  boot() {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      this.worker = new Worker(this.workerUrl, { type: 'module' });
      this.worker.onerror = (e) => reject(new Error(`worker error: ${e.message}`));
      this.worker.onmessage = (ev) => this._handle(ev.data, resolve, reject);
    });
    return this.ready;
  }

  _handle(msg, resolveReady, rejectReady) {
    if (!msg || !msg.type) return;
    if (msg.type === 'loaded') {
      const hostname = location.hostname;
      const timestamp = Date.now();
      const signature = meshySignature(hostname, timestamp);
      this.onStatus(`worker loaded, authorizing for ${hostname}…`);
      this.worker.postMessage({ type: 'authorize', hostname, timestamp, signature });
    } else if (msg.type === 'ready') {
      this.onStatus('authorized — ready');
      resolveReady();
    } else if (msg.type === 'auth_error') {
      rejectReady(new Error(
        `${msg.error}\n\n` +
        `Make sure the URL bar shows "localhost" exactly ` +
        `(not 127.0.0.1, not a LAN IP).`
      ));
    } else if (msg.type === 'error') {
      rejectReady(new Error(`worker error: ${msg.error}`));
    } else if (msg.type === 'process') {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      msg.success ? p.resolve(msg.data) : p.reject(new Error(msg.error));
    }
  }

  decrypt(buffer, mode = 'default') {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, type: 'process', data: buffer, mode }, [buffer]);
    });
  }

  async meshyToGlb(buffer) {
    await this.boot();
    if (isGlbFile(buffer)) return buffer;            // already decrypted
    if (!isMeshyFile(buffer)) throw new Error('input is neither MESHY.AI nor GLB');
    return await this.decrypt(buffer);
  }
}
