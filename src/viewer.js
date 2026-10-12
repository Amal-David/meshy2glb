import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
export function eachMaterial(root, fn) {
  const seen = new Set(); root?.traverse(o => { if (o.material) for (const m of [].concat(o.material)) if (m && !seen.has(m)) { seen.add(m); fn(m); } });
}
export function disposeObject(root) {
  const geometry = new Set(), textures = new Set(); root?.traverse(o => { if (o.geometry) geometry.add(o.geometry); });
  eachMaterial(root, m => { for (const v of Object.values(m)) if (v?.isTexture) textures.add(v); m.dispose(); });
  for (const g of geometry) g.dispose(); for (const t of textures) t.dispose();
}
export class Viewer {
  constructor({ container = document.body } = {}) {
    this.container = container; this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement); this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#1a1a2e');
    const pmrem = new THREE.PMREMGenerator(this.renderer), room = new RoomEnvironment(); this.env = pmrem.fromScene(room, 0.04).texture; this.scene.environment = this.env; pmrem.dispose(); room.dispose?.();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000); this.camera.position.set(2, 1.5, 3);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement); this.controls.enableDamping = true;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x202030, 0.6); this.direct = new THREE.DirectionalLight(0xffffff, 1.2); this.direct.position.set(3, 5, 2); this.scene.add(this.hemi, this.direct);
    this.wireframe = false; this.envIntensity = 1; this.dirty = true; this.currentModel = null;
    this.controls.addEventListener('change', () => this.dirty = true);
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(container); this.resize();
    let last = performance.now();
    this.renderer.setAnimationLoop(time => {
      const delta = Math.min(0.05, Math.max(0, (time - last) / 1000)); last = time;
      if (document.hidden) return;
      this.mixer?.update(delta); const moved = this.controls.update();
      if (moved || this.dirty || this.mixer) { this.renderer.render(this.scene, this.camera); this.dirty = false; }
    });
  }
  resize() {
    const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.dirty = true;
  }
  loadObject(object) {
    const next = clone(object);
    this.play(null);
    if (this.currentModel) { this.scene.remove(this.currentModel); eachMaterial(this.currentModel, m => m.dispose()); }
    this.currentModel = next;
    const materials = new Map(); this.currentModel.traverse(o => {
      if (!o.material) return;
      const copy = m => { if (!materials.has(m)) { const n = m.clone(); n.wireframe = this.wireframe; n.envMapIntensity = this.envIntensity; materials.set(m, n); } return materials.get(m); };
      o.material = Array.isArray(o.material) ? o.material.map(copy) : copy(o.material);
    });
    this.scene.add(this.currentModel); this.resetCamera();
  }
  resetCamera() {
    if (!this.currentModel) return;
    const box = new THREE.Box3().setFromObject(this.currentModel), center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.length() / 2, 0.001), fov = Math.min(this.camera.fov * Math.PI / 180, 2 * Math.atan(Math.tan(this.camera.fov * Math.PI / 360) * this.camera.aspect));
    const distance = radius / Math.sin(fov / 2) * 1.15;
    this.camera.position.copy(center).add(new THREE.Vector3(1, 0.65, 1).normalize().multiplyScalar(distance));
    this.camera.near = radius / 1000; this.camera.far = distance + radius * 100; this.camera.updateProjectionMatrix(); this.controls.target.copy(center); this.controls.update(); this.dirty = true;
  }
  setWireframe(on) { this.wireframe = on; eachMaterial(this.currentModel, m => m.wireframe = on); this.dirty = true; }
  setEnvIntensity(v) { this.envIntensity = v; eachMaterial(this.currentModel, m => m.envMapIntensity = v); this.dirty = true; }
  setExposure(v) { this.renderer.toneMappingExposure = v; this.dirty = true; }
  setDirectLight(v) { this.direct.intensity = v; this.dirty = true; }
  setAmbientLight(v) { this.hemi.intensity = v; this.dirty = true; }
  setBackground(v) { this.scene.background.set(v); this.dirty = true; }
  setAutoRotate(on) { this.controls.autoRotate = on; this.dirty = true; }
  play(clip) {
    if (this.mixer) { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.currentModel); this.mixer = null; }
    if (clip && this.currentModel) { this.mixer = new THREE.AnimationMixer(this.currentModel); this.mixer.clipAction(clip).play(); }
    this.dirty = true;
  }
  dispose() { this.renderer.setAnimationLoop(null); this.play(null); this.resizeObserver.disconnect(); this.controls.dispose(); eachMaterial(this.currentModel, m => m.dispose()); this.env.dispose(); this.renderer.dispose(); }
}
