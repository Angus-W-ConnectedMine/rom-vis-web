import * as THREE from "three";

const root = document.getElementById("scene-root");

if (!root) {
  throw new Error("Missing #scene-root element");
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f172a);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
root.appendChild(renderer.domElement);

const ambient = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambient);

const directional = new THREE.DirectionalLight(0xffffff, 1.2);
directional.position.set(6, 8, 10);
scene.add(directional);

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

const target = new THREE.Vector3(0, 0, 0);
let radius = 24;
let yaw = 0;
let pitch = 0.25;

function updateCamera(): void {
  const cosPitch = Math.cos(pitch);
  camera.position.set(
    target.x + radius * cosPitch * Math.sin(yaw),
    target.y + radius * Math.sin(pitch),
    target.z + radius * cosPitch * Math.cos(yaw),
  );
  camera.lookAt(target);
}

updateCamera();

let isDragging = false;
let lastX = 0;
let lastY = 0;

renderer.domElement.addEventListener("pointerdown", (event: PointerEvent) => {
  isDragging = true;
  lastX = event.clientX;
  lastY = event.clientY;
  renderer.domElement.setPointerCapture(event.pointerId);
});

renderer.domElement.addEventListener("pointermove", (event: PointerEvent) => {
  if (!isDragging) {
    return;
  }

  const dx = event.clientX - lastX;
  const dy = event.clientY - lastY;
  lastX = event.clientX;
  lastY = event.clientY;

  yaw -= dx * 0.005;
  pitch -= dy * 0.005;
  pitch = Math.max(-1.3, Math.min(1.3, pitch));
  updateCamera();
});

function endDrag(event: PointerEvent): void {
  if (isDragging) {
    isDragging = false;
    renderer.domElement.releasePointerCapture(event.pointerId);
  }
}

renderer.domElement.addEventListener("pointerup", endDrag);
renderer.domElement.addEventListener("pointercancel", endDrag);
renderer.domElement.addEventListener("pointerleave", endDrag);

window.addEventListener("wheel", (event: WheelEvent) => {
  radius += event.deltaY * 0.01;
  radius = Math.max(8, Math.min(60, radius));
  updateCamera();
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate(): void {
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
