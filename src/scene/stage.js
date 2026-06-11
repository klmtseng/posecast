import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// three.js 場景:燈光 + 地板 + 攝影機,回傳渲染迴圈掛點
export function createStage(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x141824);
  scene.fog = new THREE.Fog(0x141824, 8, 22);

  const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 50);
  camera.position.set(0, 1.3, 2.6);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.0, 0);
  controls.enableDamping = true;
  controls.maxDistance = 8;
  controls.minDistance = 0.8;

  scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x30281e, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(1.5, 3, 2);
  scene.add(key);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(6, 48),
    new THREE.MeshStandardMaterial({ color: 0x1d2336, roughness: 0.9 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  scene.add(new THREE.GridHelper(12, 24, 0x2a3350, 0x222a42));

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const clock = new THREE.Clock();
  let onFrame = null;
  let running = true;

  function loop() {
    if (!running) return;
    requestAnimationFrame(loop);
    const delta = clock.getDelta();
    if (onFrame) onFrame(delta);
    controls.update();
    renderer.render(scene, camera);
  }
  loop();

  return {
    scene, camera, renderer, controls,
    set onFrame(fn) { onFrame = fn; },
    screenshot() { return renderer.domElement.toDataURL('image/png'); },
    dispose() { running = false; renderer.dispose(); renderer.domElement.remove(); },
  };
}
