// Bounded, getter-free discovery of exposed Three.js scene objects.
// No network hooks, WebGL interception, or decryption/authentication changes.
export function discoverScenes(roots, { maxNodes = 20000, maxDepth = 18, maxMs = 150, now = () => performance.now() } = {}) {
  const scenes = [], queue = roots.map(v => [v, 0]), seen = new Set(), sceneSet = new Set(), started = now();
  let head = 0, limited = false;
  const data = (object, key) => { try { return Object.getOwnPropertyDescriptor(object, key)?.value; } catch { return undefined; } };
  while (head < queue.length) {
    if (seen.size >= maxNodes || now() - started > maxMs) { limited = true; break; }
    const [value, depth] = queue[head++];
    if (!value || typeof value !== 'object' || seen.has(value) || depth > maxDepth) continue;
    seen.add(value);
    if (data(value, 'isScene') === true) { if (!sceneSet.has(value)) { scenes.push(value); sceneSet.add(value); } continue; }
    if (data(value, 'isObject3D') === true) {
      let parent = value; const parents = new Set();
      for (let i = 0; i < 128 && parent && !parents.has(parent); i++) {
        parents.add(parent);
        if (data(parent, 'isScene') === true) { if (!sceneSet.has(parent)) { scenes.push(parent); sceneSet.add(parent); } break; }
        parent = data(parent, 'parent');
      }
    }
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer || data(value, 'nodeType')) continue;
    let keys; try { keys = Reflect.ownKeys(value); } catch { continue; }
    if (keys.length > 200) limited = true;
    for (const key of keys.slice(0, 200)) {
      if (typeof key === 'string' && ['parentNode', 'ownerDocument', 'document', 'window', 'localStorage', 'sessionStorage'].includes(key)) continue;
      const next = data(value, key);
      if (next && typeof next === 'object' && !seen.has(next)) queue.push([next, depth + 1]);
      if (queue.length >= maxNodes * 4) { limited = true; break; }
    }
    if (queue.length >= maxNodes * 4) break;
  }
  return { scenes: scenes.slice(0, 8), visited: seen.size, limited };
}
