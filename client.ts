import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

function getRootElement(): HTMLElement {
  const root = document.getElementById("scene-root");

  if (!root) {
    throw new Error("Missing #scene-root element");
  }

  return root;
}

function createScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f172a);
  return scene;
}

function createCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    1000,
  );
  camera.position.set(0, 6, 24);
  return camera;
}

function createRenderer(root: HTMLElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  root.appendChild(renderer.domElement);
  return renderer;
}

function addLights(scene: THREE.Scene): void {
  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambient);

  const directional = new THREE.DirectionalLight(0xffffff, 1.2);
  directional.position.set(6, 8, 10);
  scene.add(directional);
}

function addPointCloud(scene: THREE.Scene): void {
  const count = 200_000;
  const spread = 160;
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i += 1) {
    const offset = i * 3;
    positions[offset] = (Math.random() - 0.5) * spread;
    positions[offset + 1] = (Math.random() - 0.5) * spread;
    positions[offset + 2] = (Math.random() - 0.5) * spread;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0x2563eb,
    size: 0.35,
    sizeAttenuation: true,
  });

  const pointCloud = new THREE.Points(geometry, material);
  scene.add(pointCloud);
}

function createControls(
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer,
): OrbitControls {
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.update();
  return controls;
}

function bindResize(
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer,
): void {
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function startRenderLoop(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer,
  controls: OrbitControls,
): void {
  function animate(): void {
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  animate();
}

function main(): void {
  const root = getRootElement();
  const scene = createScene();
  const camera = createCamera();
  const renderer = createRenderer(root);

  addLights(scene);
  addPointCloud(scene);

  const controls = createControls(camera, renderer);
  bindResize(camera, renderer);
  startRenderLoop(scene, camera, renderer, controls);
}

main();
