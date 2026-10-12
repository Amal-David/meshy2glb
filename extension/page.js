// Appended after the pure discovery/snapshot modules by build-extension.mjs.
const captureKey = Symbol.for('meshy2glb.capture.v1');
let cache = [];
window[captureKey] = {
  scan() {
    const roots = [];
    for (const key of [Symbol.for('meshy2glb.scene'), 'scene', '__THREE_SCENE__']) {
      try { const value = Object.getOwnPropertyDescriptor(window, key)?.value; if (value) roots.push(value); } catch { /* inaccessible root */ }
    }
    for (const canvas of document.querySelectorAll('canvas')) {
      for (const key of Object.getOwnPropertyNames(canvas)) if (/react|r3f/i.test(key)) {
        try { const value = Object.getOwnPropertyDescriptor(canvas, key)?.value; if (value) roots.push(value); } catch { /* no getters */ }
      }
    }
    const result = discoverScenes(roots); cache = result.scenes;
    const meshes = [];
    cache.forEach((scene, sceneIndex) => visibleMeshes(scene).forEach(({ node, id }) => {
      const geometry = node.geometry;
      meshes.push({ scene: sceneIndex, id, name: String(node.name || 'Unnamed mesh').slice(0,100), triangles: Math.floor((geometry.index?.count ?? geometry.attributes.position.count) / 3) * (node.isInstancedMesh ? node.count : 1) });
    }));
    if (meshes.length > 1000) throw new Error('Too many mesh candidates; isolate a model first');
    return { meshes, limited: result.limited };
  },
  export(selection) {
    if (!Array.isArray(selection) || selection.length > 1000) throw new Error('Invalid mesh selection');
    const output = []; let remaining = 250000;
    for (let i = 0; i < cache.length; i++) {
      const selected = selection.filter(s => s.scene === i).map(s => s.id);
      if (!selected.length) continue;
      const meshes = snapshot(cache[i], { selected, maxTriangles: remaining });
      remaining -= meshes.reduce((n, m) => n + m.indices.length / 3, 0);
      for (const { name, positions, indices } of meshes) output.push({ name, positions, indices });
    }
    if (!output.length) throw new Error('Select at least one visible mesh and scan again if the page changed');
    cache = []; return output;
  }
};
