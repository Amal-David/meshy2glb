import * as THREE          from 'three';
import { GLTFLoader }       from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls }    from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment }  from 'three/addons/environments/RoomEnvironment.js';

export class Viewer {
  constructor({ container = document.body, background = 0x1a1a2e } = {}) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(devicePixelRatio);
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(background);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this._envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this._envTexture;
    this._envIntensity = 1.0;

    this.camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.01, 1000);
    this.camera.position.set(2, 1.5, 3);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.autoRotate = false;
    this.controls.autoRotateSpeed = 2.0;

    this._hemiLight = new THREE.HemisphereLight(0xffffff, 0x202030, 0.6);
    this.scene.add(this._hemiLight);
    this._dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    this._dirLight.position.set(3, 5, 2);
    this.scene.add(this._dirLight);

    this._wireframe = false;

    addEventListener('resize', () => this._onResize());

    this.currentModel = null;
    this.loader = new GLTFLoader();
    this._lastBlobUrl = null;

    this._tick();
  }

  _onResize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    if (this.currentModel) this._frame(this.currentModel);
  }

  _tick = () => {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this._tick);
  };

  _frame(obj) {
    const box    = new THREE.Box3().setFromObject(obj);
    const size   = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    obj.position.sub(center);
    const dist = maxDim * (this.camera.aspect < 1 ? 2.6 : 1.8);
    this.camera.position.set(dist, dist * 0.7, dist);
    this.camera.near = maxDim / 100;
    this.camera.far  = maxDim * 50;
    this.camera.updateProjectionMatrix();
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  setExposure(v) {
    this.renderer.toneMappingExposure = v;
  }

  setEnvIntensity(v) {
    this._envIntensity = v;
    if (this.currentModel) {
      this.currentModel.traverse(o => {
        if (o.isMesh && o.material) o.material.envMapIntensity = v;
      });
    }
  }

  setDirectLight(v) {
    this._dirLight.intensity = v;
  }

  setAmbientLight(v) {
    this._hemiLight.intensity = v;
  }

  setBackground(hex) {
    this.scene.background = new THREE.Color(hex);
  }

  setAutoRotate(on) {
    this.controls.autoRotate = on;
  }

  setWireframe(on) {
    this._wireframe = on;
    if (this.currentModel) {
      this.currentModel.traverse(o => {
        if (o.isMesh && o.material) o.material.wireframe = on;
      });
    }
  }

  resetCamera() {
    if (this.currentModel) this._frame(this.currentModel);
  }

  _applyMaterialSettings(obj) {
    obj.traverse(o => {
      if (o.isMesh && o.material) {
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        for (const material of materials) {
          material.envMapIntensity = this._envIntensity;
          material.wireframe = this._wireframe;
        }
      }
    });
  }

  countTriangles(scene) {
    let n = 0;
    scene.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      const idx = o.geometry.index;
      n += (idx ? idx.count : o.geometry.attributes.position.count) / 3;
    });
    return n;
  }

  loadObject(object) {
    if (this.currentModel) this.scene.remove(this.currentModel);
    this.currentModel = object;
    this._applyMaterialSettings(this.currentModel);
    this.scene.add(this.currentModel);
    this._frame(this.currentModel);

    return {
      triangles: this.countTriangles(this.currentModel),
    };
  }

  async loadGLB(glbBuffer) {
    const blob = new Blob([glbBuffer], { type: 'model/gltf-binary' });
    const url  = URL.createObjectURL(blob);
    const gltf = await this.loader.loadAsync(url);
    const loaded = this.loadObject(gltf.scene);

    if (this._lastBlobUrl) URL.revokeObjectURL(this._lastBlobUrl);
    this._lastBlobUrl = url;

    return {
      blobUrl: url,
      triangles: loaded.triangles,
      sceneJson: gltf.parser?.json,
    };
  }
}
