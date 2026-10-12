import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { geometryGlb, parseGlb } from './glb.js';
import { snapshot, visibleMeshes } from './snapshot.js';
import { painted3mf } from './paint-adapter.js';

export const formatNotes = {
  glb: 'Original GLB bytes are retained when possible. Regenerated GLBs preserve supported scene data and clips, not every custom extension.',
  gltf: 'Self-contained glTF with supported clips and embedded resources. Unknown extensions may not survive regeneration.',
  obj: 'Geometry and UVs only. This exporter does not produce an MTL or texture package; animations are omitted.',
  stl: 'Geometry only; no colors, textures or animation. STL does not record units.',
  ply: 'Static geometry, normals and supported vertex colors; no image textures or animation.',
  usdz: 'Static export. Basic/Phong materials are approximated as PBR. This build rejects unsupported groups, rigs and vertex colors rather than silently dropping them.',
  '3mf': 'Painted static snapshot, up to 16 filament regions. Prusa 2 / Bambu paint encoding. Choose units and assign printer/filament slots in the slicer. Not mesh repair.'
};
export function download(data, name, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export async function exportModel(asset, { format = 'glb', mode = 'original', painted, paintedRoot, geometryRoot, scale = 1000, slicer = 'prusa' } = {}) {
  if (!asset?.object) throw new Error('No model loaded');
  if (mode === 'geometry') {
    if (format !== 'glb') throw new Error('Geometry snapshot exports GLB. Reopen that GLB to convert to other formats.');
    return geometryGlb(snapshot(geometryRoot ?? asset.object));
  }
  if (mode === 'painted' && (!painted || !paintedRoot)) throw new Error('Generate a painted snapshot first');
  if (format === '3mf') {
    if (mode !== 'painted') throw new Error('3MF requires the painted snapshot');
    return painted3mf(painted, scale, slicer);
  }
  const root = mode === 'painted' ? paintedRoot : asset.object;
  const clips = mode === 'painted' ? [] : asset.animations;
  root.updateWorldMatrix(true, true);
  if (format === 'glb' && mode === 'original' && asset.sourceBuffer) { parseGlb(asset.sourceBuffer); return asset.sourceBuffer; }
  if (format === 'glb' || format === 'gltf') {
    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
    const out = await new GLTFExporter().parseAsync(root, { binary: format === 'glb', onlyVisible: false, animations: clips ?? [] });
    if (format === 'glb') { parseGlb(out); return out; }
    return JSON.stringify(out, null, 2);
  }
  if (format === 'obj') { const { OBJExporter } = await import('three/addons/exporters/OBJExporter.js'); return new OBJExporter().parse(root); }
  if (format === 'stl') { const { STLExporter } = await import('three/addons/exporters/STLExporter.js'); return new STLExporter().parse(root, { binary: true }); }
  if (format === 'ply') { const { PLYExporter } = await import('three/addons/exporters/PLYExporter.js'); return new Promise((resolve, reject) => { try { new PLYExporter().parse(root, resolve, { binary: false }); } catch (e) { reject(e); } }); }
  if (format === 'usdz') {
    const nodes = visibleMeshes(root); if (!nodes.length) throw new Error('No visible mesh for USDZ');
    for (const { node } of nodes) {
      if (Array.isArray(node.material) || node.isSkinnedMesh || node.isInstancedMesh || node.geometry.morphAttributes?.position?.length || node.material?.vertexColors) throw new Error('This USDZ path cannot faithfully export multi-material, rigged, instanced or vertex-colored meshes. Use GLB instead.');
      if (!node.material?.color || node.material.isShaderMaterial) throw new Error('Unsupported material for USDZ; use GLB');
    }
    const copied = clone(root), owned = [];
    copied.traverse(o => {
      if (!o.isMesh) return;
      const source = o.material;
      const material = source.isMeshStandardMaterial ? source.clone() : new THREE.MeshStandardMaterial({
        color: source.color, map: source.map, normalMap: source.normalMap,
        alphaMap: source.alphaMap, transparent: source.transparent, opacity: source.opacity,
        alphaTest: source.alphaTest, side: source.side, roughness: 0.8, metalness: 0
      });
      material.wireframe = false; o.material = material; owned.push(material);
    });
    try { const { USDZExporter } = await import('three/addons/exporters/USDZExporter.js'); return await new USDZExporter().parseAsync(copied, { maxTextureSize: 4096 }); }
    finally { owned.forEach(m => m.dispose()); }
  }
  throw new Error('Unsupported export format');
}
