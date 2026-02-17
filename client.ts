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

function addSpheres(scene: THREE.Scene): void {
  const sphereGeometry = new THREE.SphereGeometry(0.8, 32, 32);
  const sphereMaterial = new THREE.MeshStandardMaterial({
    color: 0x2563eb,
    roughness: 0.35,
    metalness: 0.15,
  });

  const count = 10;
  const spacing = 2.2;
  for (let i = 0; i < count; i += 1) {
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.position.set((i - (count - 1) / 2) * spacing, 0, 0);
    scene.add(sphere);
  }
}

function createControls(
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer,
): OrbitControls {
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.minDistance = 8;
  controls.maxDistance = 60;
  controls.minPolarAngle = Math.PI / 2 - 1.3;
  controls.maxPolarAngle = Math.PI / 2 + 1.3;
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
  addSpheres(scene);

  const controls = createControls(camera, renderer);
  bindResize(camera, renderer);
  startRenderLoop(scene, camera, renderer, controls);
}

main();
