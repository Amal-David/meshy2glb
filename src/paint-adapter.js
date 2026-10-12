import * as THREE from 'three';
import { snapshot } from './snapshot.js';
import { srgbToLinear } from './paint-core.js';

export function makePaintInput(root) {
  const meshes = snapshot(root, { withAttributes: true, maxTriangles: 150000 }), materials = [], triangles = [], materialMap = new Map();
  let pixels = 0;
  const mapMaterial = material => {
    if (materialMap.has(material)) return materialMap.get(material);
    if (!material || !material.color || material.isShaderMaterial) throw new Error('Painting requires authored standard/basic material colors');
    if (material.opacity < 1 || material.alphaMap) throw new Error('Transparent materials require a dedicated decal/opacity workflow');
    const item = { linear: material.color.toArray() };
    if (material.map) {
      const tex = material.map, image = tex.image;
      if (!image?.width || !image?.height || tex.isCompressedTexture) throw new Error('This texture cannot be read for paint processing');
      const width = Math.min(1024, image.width), height = Math.max(1, Math.round(image.height * width / image.width));
      if ((pixels += width * height) > 4 * 1024 * 1024) throw new Error('Paint texture budget exceeded (4 megapixels total)');
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (image.data) {
        if (!(image.data instanceof Uint8Array || image.data instanceof Uint8ClampedArray) || image.data.length !== image.width * image.height * 4) throw new Error('Only RGBA8 data textures are supported for painting');
        const source = document.createElement('canvas'); source.width = image.width; source.height = image.height;
        source.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0); ctx.drawImage(source, 0, 0, width, height);
      } else { try { ctx.drawImage(image, 0, 0, width, height); } catch { throw new Error('Texture pixels are unavailable'); } }
      let data; try { data = ctx.getImageData(0, 0, width, height).data; } catch { throw new Error('Texture host prevents pixel access. Import a local texture instead.'); }
      if (tex.matrixAutoUpdate) tex.updateMatrix();
      item.texture = { width, height, data, matrix: Array.from(tex.matrix.elements), wrapS: tex.wrapS, wrapT: tex.wrapT, flipY: tex.flipY, srgb: tex.colorSpace === THREE.SRGBColorSpace, nearest: tex.magFilter === THREE.NearestFilter };
    }
    const id = materials.length; materials.push(item); materialMap.set(material, id); return id;
  };
  meshes.forEach(mesh => mesh.triangles.forEach((vertices, i) => {
    const mat = mesh.materials[mesh.materialIds[i]], id = mapMaterial(mat);
    vertices = vertices.map(v => ({ ...v, linear: mat.vertexColors ? v.linear : v.instanceLinear }));
    if (mat.map) {
      const name = mat.map.channel ? `uv${mat.map.channel}` : 'uv', uv = mesh.geometry.attributes[name];
      if (!uv) throw new Error(`Textured mesh is missing ${name}`);
      vertices = vertices.map(v => ({ ...v, uv: [uv.getX(v.sourceIndex), uv.getY(v.sourceIndex)] }));
    }
    triangles.push({ v: vertices, group: mesh.id, material: id });
  }));
  return { triangles, materials };
}
export function paintedScene(result) {
  const group = new THREE.Group(); group.name = 'Painted static snapshot';
  const positions = new Float32Array(result.triangles.length * 9), colors = new Float32Array(positions.length);
  result.triangles.forEach((triangle, i) => {
    const color = result.palette[result.labels[i]].map(srgbToLinear);
    triangle.v.forEach((v, j) => { const at = i * 9 + j * 3; positions.set(v.p, at); colors.set(color, at); });
  });
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geo.setAttribute('color', new THREE.BufferAttribute(colors, 3)); geo.computeVertexNormals();
  group.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide }))); return group;
}
export async function painted3mf(result, unitsPerModelUnit = 1000, slicer = 'prusa') {
  if (!Number.isFinite(unitsPerModelUnit) || unitsPerModelUnit <= 0 || unitsPerModelUnit > 1e6) throw new Error('Choose a valid millimeters-per-model-unit scale');
  const { createDocument, writeDocument, identity, getTarget } = await import('./vendor/three-mf/index.js');
  const map = new Map(), vertices = [], indices = [], paint = [];
  result.triangles.forEach((t, i) => {
    const ids = t.v.map(v => {
      // Never weld across separate source objects/instances.
      const key = `${t.group}|${v.p.join(',')}`; if (map.has(key)) return map.get(key);
      const id = vertices.length / 3; const [x, y, z] = v.p; vertices.push(x * unitsPerModelUnit, -z * unitsPerModelUnit, y * unitsPerModelUnit); map.set(key, id); return id;
    });
    if (new Set(ids).size !== 3) throw new Error('Degenerate paint triangle cannot be exported');
    indices.push(...ids); paint.push({ region: result.labels[i] + 1 });
  });
  const palette = result.palette.map(c => '#' + c.map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join(''));
  const document = createDocument([{ id: 'model', name: 'Painted model', printable: true, transform: identity(), overrides: {}, parts: [{ id: 'model/paint', name: 'Painted surface', kind: 'ModelPart', mesh: { vertices, triangles: indices }, paint, transform: identity(), overrides: {} }] }], palette);
  if (!['prusa','bambu','orca'].includes(slicer)) throw new Error('Unsupported slicer target');
  const target = getTarget(slicer);
  return writeDocument(document, { mode: 'create', target: target.id }).bytes;
}
