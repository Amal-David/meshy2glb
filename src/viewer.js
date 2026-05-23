import * as THREE          from 'three';
import { GLTFLoader }       from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls }    from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment }  from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder }   from 'three/addons/libs/meshopt_decoder.module.js';

export class Viewer {
  constructor({ container = document.body, background = 0x111111 } = {}) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(devicePixelRatio);
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(background);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    this.camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.01, 1000);
    this.camera.position.set(2, 1.5, 3);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x202030, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(3, 5, 2);
    this.scene.add(dir);

    addEventListener('resize', () => this._onResize());

    this.currentModel = null;
    this.loader = new GLTFLoader();
    // The decrypted .meshy payload is a GLB that uses EXT_meshopt_compression.
    // Wire up MeshoptDecoder so the loader can stream-decode it.
    this.loader.setMeshoptDecoder(MeshoptDecoder);
    this._lastBlobUrl = null;

    this._tick();
  }

  _onResize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
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
    const dist = maxDim * 1.8;
    this.camera.position.set(dist, dist * 0.7, dist);
    this.camera.near = maxDim / 100;
    this.camera.far  = maxDim * 50;
    this.camera.updateProjectionMatrix();
    this.controls.target.set(0, 0, 0);
    this.controls.update();
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

  async loadGLB(glbBuffer) {
    const blob = new Blob([glbBuffer], { type: 'model/gltf-binary' });
    const url  = URL.createObjectURL(blob);
    const gltf = await this.loader.loadAsync(url);
    if (this.currentModel) this.scene.remove(this.currentModel);
    this.currentModel = gltf.scene;
    this.scene.add(this.currentModel);
    this._frame(this.currentModel);

    if (this._lastBlobUrl) URL.revokeObjectURL(this._lastBlobUrl);
    this._lastBlobUrl = url;

    return {
      blobUrl: url,
      triangles: this.countTriangles(gltf.scene),
      sceneJson: gltf.parser?.json,
    };
  }
}
