import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  addPointCloud,
  addSelectionPrism,
  fitCameraToPointCloud,
  getPointsInScreenSelection,
} from "./geometry";
import type { Point } from "./points";

interface SelectionRegion {
  min: Point;
  max: Point;
  prism: THREE.Group;
}

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
  camera.up.set(0, 0, 1);
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

function bindRegionSelection(
  root: HTMLElement,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer,
  controls: OrbitControls,
  points: Point[],
): void {
  root.style.position = "relative";

  const overlay = document.createElement("div");
  overlay.style.position = "absolute";
  overlay.style.pointerEvents = "none";
  overlay.style.border = "1px solid #22d3ee";
  overlay.style.background = "rgba(34, 211, 238, 0.2)";
  overlay.style.display = "none";
  root.appendChild(overlay);

  const regions: SelectionRegion[] = [];

  let isSelecting = false;
  let pointerId = -1;
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let currentY = 0;

  function updateOverlay(): void {
    const minX = Math.min(startX, currentX);
    const maxX = Math.max(startX, currentX);
    const minY = Math.min(startY, currentY);
    const maxY = Math.max(startY, currentY);

    overlay.style.left = `${minX}px`;
    overlay.style.top = `${minY}px`;
    overlay.style.width = `${maxX - minX}px`;
    overlay.style.height = `${maxY - minY}px`;
  }

  function getCanvasPosition(event: PointerEvent): { x: number; y: number } {
    const rect = renderer.domElement.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function finishSelection(event: PointerEvent): void {
    if (!isSelecting || event.pointerId !== pointerId) {
      return;
    }

    isSelecting = false;
    controls.enabled = true;
    overlay.style.display = "none";

    if (renderer.domElement.hasPointerCapture(pointerId)) {
      renderer.domElement.releasePointerCapture(pointerId);
    }

    const minX = Math.min(startX, currentX);
    const maxX = Math.max(startX, currentX);
    const minY = Math.min(startY, currentY);
    const maxY = Math.max(startY, currentY);

    if (maxX - minX < 2 || maxY - minY < 2) {
      return;
    }

    const selectedPoints = getPointsInScreenSelection(
      points,
      camera,
      renderer.domElement.clientWidth,
      renderer.domElement.clientHeight,
      { minX, maxX, minY, maxY },
    );

    if (selectedPoints.length === 0) {
      return;
    }

    let regionMinX = Infinity;
    let regionMinY = Infinity;
    let regionMinZ = Infinity;
    let regionMaxX = -Infinity;
    let regionMaxY = -Infinity;
    let regionMaxZ = -Infinity;

    for (const point of selectedPoints) {
      if (point.x < regionMinX) regionMinX = point.x;
      if (point.y < regionMinY) regionMinY = point.y;
      if (point.z < regionMinZ) regionMinZ = point.z;
      if (point.x > regionMaxX) regionMaxX = point.x;
      if (point.y > regionMaxY) regionMaxY = point.y;
      if (point.z > regionMaxZ) regionMaxZ = point.z;
    }

    const prism = addSelectionPrism(scene, selectedPoints, 20);
    if (!prism) {
      return;
    }

    regions.push({
      min: { x: regionMinX, y: regionMinY, z: regionMinZ },
      max: { x: regionMaxX, y: regionMaxY, z: regionMaxZ },
      prism,
    });
  }

  renderer.domElement.addEventListener(
    "pointerdown",
    (event: PointerEvent) => {
      if (!event.shiftKey || event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const position = getCanvasPosition(event);
      isSelecting = true;
      pointerId = event.pointerId;
      startX = position.x;
      startY = position.y;
      currentX = position.x;
      currentY = position.y;

      controls.enabled = false;
      updateOverlay();
      overlay.style.display = "block";
      renderer.domElement.setPointerCapture(pointerId);
    },
    { capture: true },
  );

  renderer.domElement.addEventListener("pointermove", (event: PointerEvent) => {
    if (!isSelecting || event.pointerId !== pointerId) {
      return;
    }

    const position = getCanvasPosition(event);
    currentX = position.x;
    currentY = position.y;
    updateOverlay();
  });

  renderer.domElement.addEventListener("pointerup", finishSelection);
  renderer.domElement.addEventListener("pointercancel", finishSelection);
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

async function getPoints(): Promise<Point[]> {
  const response = await fetch("/points");
  if (!response.ok) {
    throw new Error(`Failed to load points: ${response.status}`);
  }
  const points = await response.json() as Point[];
  return points;
}

async function main(): Promise<void> {
  const root = getRootElement();
  const scene = createScene();
  const camera = createCamera();
  const renderer = createRenderer(root);
  const controls = createControls(camera, renderer);

  const points = await getPoints();

  addLights(scene);
  addPointCloud(scene, points);
  fitCameraToPointCloud(camera, controls, points);
  bindRegionSelection(root, scene, camera, renderer, controls, points);

  bindResize(camera, renderer);
  startRenderLoop(scene, camera, renderer, controls);
}

void main();
