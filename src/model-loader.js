import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { isGlbFile, isMeshyFile } from './decrypt.js';
import { parseGlb, MAX_BYTES } from './glb.js';
import { extension, resourceIndex, fetchBytes } from './input.js';
import { workerJob } from './jobs.js';

export async function loadModel({ buffer, name, files = [], primaryFile, baseUrl = '', signal }) {
  if (buffer.byteLength > MAX_BYTES) throw new Error('Model exceeds 256 MiB');
  const urls = [], urlByFile = new Map(), remote = new Map(), manager = new THREE.LoadingManager(), resolve = resourceIndex(files);
  const primary = primaryFile ?? files.find(f => f.name === name), path = primary?.webkitRelativePath || name, localBase = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
  const resources = { dispose: () => urls.forEach(u => URL.revokeObjectURL(u)) };
  let pending = 0, complete;
  const failures = [], start = manager.itemStart.bind(manager), end = manager.itemEnd.bind(manager);
  manager.itemStart = url => { pending++; start(url); };
  manager.itemEnd = url => { end(url); pending--; if (pending === 0) complete?.(); };
  manager.onError = () => failures.push('A companion image could not be decoded');
  async function waitForResources() {
    if (signal?.aborted) throw new Error('Import cancelled');
    if (pending) await new Promise((resolve, reject) => {
      const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(new Error('Import cancelled')); };
      const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); reject(new Error('Companion image loading timed out')); }, 30000);
      complete = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); resolve(); };
      signal?.addEventListener('abort', abort, { once: true });
    });
    if (failures.length) throw new Error(failures[0]);
  }
  const objectUrl = file => { if (!urlByFile.has(file)) { const url = URL.createObjectURL(file); urlByFile.set(file, url); urls.push(url); } return urlByFile.get(file); };
  manager.setURLModifier(url => {
    if (url.startsWith('data:')) { if (url.length > MAX_BYTES * 1.4) throw new Error('Embedded resource exceeds budget'); return url; }
    // Embedded GLB/FBX images create blob URLs inside the loader. Source GLTF references are preflighted below.
    if (url.startsWith('blob:')) return url;
    if (baseUrl) {
      const key = new URL(url, baseUrl).href;
      if (remote.has(key)) return objectUrl(remote.get(key));
      throw new Error('Unresolved URL companion. Import a complete local folder for this format.');
    }
    if (/^[a-z]+:/i.test(url)) throw new Error('Local model refers to a remote asset. Download its companions explicitly first.');
    return objectUrl(resolve(url, localBase));
  });
  let type = extension(name), sourceBuffer = null, sourceJson, object, animations = [];
  try {
    if (isMeshyFile(buffer)) { buffer = await workerJob('./decode-worker.js', { buffer }, { signal, transfer: [buffer] }); type = 'meshy'; sourceBuffer = buffer; }
    if (isGlbFile(buffer)) { sourceJson = parseGlb(buffer).json; sourceBuffer = buffer; if (type !== 'meshy') type = 'glb'; }
    else if (type === 'glb' || type === 'meshy') throw new Error(`Invalid .${type} model`);
    if (type === 'gltf') sourceJson = JSON.parse(new TextDecoder().decode(buffer));
    if (sourceJson) {
      const unsupported = (sourceJson.extensionsRequired ?? []).filter(e => ['KHR_draco_mesh_compression', 'KHR_texture_basisu'].includes(e));
      if (unsupported.length) throw new Error(`This build does not decode ${unsupported.join(', ')}. Export an uncompressed GLB first.`);
      const uris = [...(sourceJson.buffers ?? []), ...(sourceJson.images ?? [])].map(r => r.uri).filter(u => u && !u.startsWith('data:'));
      if (uris.some(u => /^[a-z]+:/i.test(u) && (!baseUrl || !u.startsWith('https:')))) throw new Error('Unsupported external resource URI; use local companion files');
      if (uris.length > 128) throw new Error('Too many companion resources');
      if (baseUrl) {
        let remaining = MAX_BYTES - buffer.byteLength;
        for (const uri of new Set(uris)) {
          const url = new URL(uri, baseUrl); if (url.origin !== new URL(baseUrl).origin) throw new Error('Cross-origin companions require an explicit local asset package');
          const data = await fetchBytes(url.href, { signal, limit: remaining }); remaining -= data.buffer.byteLength;
          remote.set(url.href, new Blob([data.buffer]));
        }
      }
      const loader = new GLTFLoader(manager); loader.setMeshoptDecoder(MeshoptDecoder);
      const result = await loader.parseAsync(type === 'gltf' ? JSON.stringify(sourceJson) : buffer, ''); object = result.scene; animations = result.animations;
    } else if (type === 'obj') {
      const { OBJLoader } = await import('three/addons/loaders/OBJLoader.js'); const loader = new OBJLoader(manager), text = new TextDecoder().decode(buffer);
      const mtls = [...text.matchAll(/^mtllib\s+(.+)$/gm)].map(m => m[1].trim());
      if (mtls.length > 1) throw new Error('Multiple OBJ material libraries need consolidation before import');
      if (mtls.length) {
        if (baseUrl) throw new Error('OBJ with MTL: import a local folder including its textures');
        const { MTLLoader } = await import('three/addons/loaders/MTLLoader.js'); const file = resolve(mtls[0], localBase);
        const materialPath = mtls[0].includes('/') ? mtls[0].slice(0, mtls[0].lastIndexOf('/') + 1) : '';
        const library = new MTLLoader(manager).parse(await file.text(), materialPath); library.preload(); loader.setMaterials(library);
      }
      object = loader.parse(text);
    } else if (type === 'stl' || type === 'ply') {
      const { [type === 'stl' ? 'STLLoader' : 'PLYLoader']: Loader } = await import(type === 'stl' ? 'three/addons/loaders/STLLoader.js' : 'three/addons/loaders/PLYLoader.js');
      const geometry = new Loader(manager).parse(buffer); if (!geometry.attributes.normal) geometry.computeVertexNormals();
      object = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: !!geometry.attributes.color, roughness: 0.8 }));
    } else if (type === 'fbx') { const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js'); object = new FBXLoader(manager).parse(buffer, ''); animations = object.animations ?? []; }
    else if (type === 'dae') { const { ColladaLoader } = await import('three/addons/loaders/ColladaLoader.js'); const result = new ColladaLoader(manager).parse(new TextDecoder().decode(buffer), ''); object = result.scene; animations = result.animations ?? object.animations ?? []; }
    else if (type === '3mf') { const { ThreeMFLoader } = await import('three/addons/loaders/3MFLoader.js'); object = new ThreeMFLoader(manager).parse(buffer); }
    else throw new Error('Unsupported model type. Use a .meshy, GLB, glTF, OBJ, STL, PLY, DAE, 3MF or FBX file.');
    await waitForResources();
    let meshes = 0, triangles = 0; object.traverse(o => { if (o.isMesh && o.geometry?.attributes.position) { meshes++; triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3; } });
    if (!meshes || !Number.isInteger(triangles) || triangles === 0) throw new Error('No triangle mesh found');
    return { object, animations, type, name, sourceBuffer, sourceJson, triangles, resources };
  } catch (error) { resources.dispose(); throw error; }
}
