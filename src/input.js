import { MAX_BYTES } from './glb.js';
export const ASSET_LENS = 'https://github.com/Amal-David/asset-capture';
export const FORMATS = new Set(['meshy', 'glb', 'gltf', 'obj', 'stl', 'ply', 'dae', '3mf', 'fbx']);
export const extension = name => (name.split(/[?#]/)[0].split('.').pop() || '').toLowerCase();
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function safeUrl(input) {
  let url; try { url = new URL(input.trim()); } catch { throw new Error('Enter a complete HTTPS model URL'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Only HTTPS URLs without embedded credentials are accepted');
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.includes(':') || /^\d+\.\d+\.\d+\.\d+$/.test(host) || !host.includes('.')) throw new Error('Use a public model hostname, not a local or IP address');
  url.hash = ''; return url;
}
export function classifyUrl(input) {
  const url = safeUrl(input);
  if ((url.hostname === 'meshy.ai' || url.hostname === 'www.meshy.ai') && url.pathname.includes('/3d-models/')) {
    const id = url.pathname.replace(/\/$/, '').match(UUID)?.[0];
    if (!id) throw new Error('The Meshy model page must end in its task UUID');
    return { kind: 'meshy-page', url: url.href, id: id.toLowerCase() };
  }
  if ((url.hostname === 'meshy.ai' || url.hostname === 'www.meshy.ai') && !FORMATS.has(extension(url.pathname))) throw new Error('Use a public Meshy model page or a direct asset URL, not a workspace URL. Asset Lens can help locate your file.');
  return { kind: 'asset', url: url.href };
}
export function chooseMeshyAsset(payload) {
  if (payload.code != null && payload.code !== 'OK') throw new Error('Meshy did not expose this public task');
  const task = payload.result;
  if (!task || typeof task !== 'object') throw new Error('Unexpected Meshy public-task response');
  for (const section of ['texture', 'generate', 'remesh', 'draft', 'stylize']) {
    const u = task.result?.[section]?.modelUrl;
    if (typeof u === 'string' && u) return safeUrl(u).href;
  }
  throw new Error('No accessible model in this public task. It may be private, unavailable, or still processing.');
}
export async function fetchBytes(input, { fetchImpl = fetch, signal, limit = MAX_BYTES, progress = () => {} } = {}) {
  const url = safeUrl(input), controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error('Download timed out')), 60000);
  try {
    const response = await fetchImpl(url.href, { credentials: 'omit', referrerPolicy: 'no-referrer', mode: 'cors', signal: controller.signal });
    if (!response.ok) throw new Error(`Download returned HTTP ${response.status}. Refresh expired links; private models require an authorized export.`);
    if (response.url) safeUrl(response.url);
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > limit) throw new Error('Download exceeds the size budget');
    if (!response.body) { const buffer = await response.arrayBuffer(); if (buffer.byteLength > limit) throw new Error('Download exceeds the size budget'); return { buffer, url: response.url || url.href }; }
    const reader = response.body.getReader(), chunks = []; let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        total += value.byteLength; if (total > limit) { await reader.cancel(); throw new Error('Download exceeds the size budget'); }
        chunks.push(value); progress(total, declared);
      }
    } finally { reader.releaseLock(); }
    const data = new Uint8Array(total); let at = 0; for (const part of chunks) { data.set(part, at); at += part.length; }
    return { buffer: data.buffer, url: response.url || url.href };
  } catch (error) {
    if (controller.signal.aborted) throw new Error(signal?.aborted ? 'Import cancelled' : 'Download timed out');
    if (error instanceof TypeError) throw new Error('The host blocked browser access (CORS), or the network failed. Download the file yourself or use Asset Lens. No proxy or login bypass is used.');
    throw error;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); controller.abort(); }
}
export async function importUrl(input, options = {}) {
  const source = classifyUrl(input); let assetUrl = source.url;
  if (source.kind === 'meshy-page') {
    const metadata = await fetchBytes(`https://www.meshy.ai/meshyd-api/web/public/v2/tasks/${source.id}`, { ...options, limit: 2 * 1024 * 1024 });
    assetUrl = chooseMeshyAsset(JSON.parse(new TextDecoder().decode(metadata.buffer)));
  }
  const downloaded = await fetchBytes(assetUrl, options);
  let name; try { name = decodeURIComponent(new URL(downloaded.url).pathname.split('/').pop()); } catch { name = 'model'; }
  name = (name || 'model').replace(/[\x00-\x1f<>:"/\\|?*]/g, '_').slice(0, 120);
  // An extensionless asset is still identified by its binary magic on import.
  return { ...downloaded, name, baseUrl: new URL('.', downloaded.url).href, sourceKind: source.kind };
}
export function normalizePath(path) {
  let text; try { text = decodeURIComponent(path.split(/[?#]/)[0]); } catch { throw new Error('Malformed resource path'); }
  const parts = [];
  for (const p of text.replace(/\\/g, '/').split('/')) {
    if (!p || p === '.') continue;
    if (p === '..') { if (!parts.length) throw new Error('Resource escapes the selected folder'); parts.pop(); }
    else parts.push(p);
  }
  return parts.join('/');
}
// Relative paths first. A basename fallback is allowed only when unambiguous.
export function resourceIndex(files) {
  const exact = new Map(), basenames = new Map();
  for (const file of files) {
    const key = normalizePath(file.webkitRelativePath || file.name), base = key.split('/').pop();
    if (exact.has(key)) throw new Error(`Duplicate resource path: ${key}`);
    exact.set(key, file); basenames.set(base, basenames.has(base) ? null : file);
  }
  return (request, root = '') => {
    const key = normalizePath(root + request), exactFile = exact.get(key);
    if (exactFile) return exactFile;
    const name = key.split('/').pop();
    if (basenames.has(name) && !basenames.get(name)) throw new Error(`Ambiguous companion file: ${name}. Select its complete folder.`);
    const file = basenames.get(name); if (!file) throw new Error(`Missing companion file: ${name}. Select the model, BIN and textures together.`);
    return file;
  };
}
