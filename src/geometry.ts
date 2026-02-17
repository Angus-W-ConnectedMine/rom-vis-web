import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Point } from "./points";

export interface ScreenSelectionRect {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function addPointCloud(scene: THREE.Scene, points: Point[]): THREE.Points {
  const positions = new Float32Array(points.length * 3);

  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    if (!point) {
      continue;
    }

    positions[i * 3 + 0] = point.x;
    positions[i * 3 + 1] = point.y;
    positions[i * 3 + 2] = point.z;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0x2563eb,
    size: 1,
    sizeAttenuation: true,
  });

  const pointCloud = new THREE.Points(geometry, material);
  scene.add(pointCloud);
  return pointCloud;
}

function swap(values: number[], i: number, j: number): void {
  const temp = values[i];
  values[i] = values[j] as number;
  values[j] = temp as number;
}

function partition(values: number[], left: number, right: number, pivotIndex: number): number {
  const pivotValue = values[pivotIndex] as number;
  swap(values, pivotIndex, right);
  let storeIndex = left;

  for (let i = left; i < right; i += 1) {
    if ((values[i] as number) < pivotValue) {
      swap(values, storeIndex, i);
      storeIndex += 1;
    }
  }

  swap(values, right, storeIndex);
  return storeIndex;
}

function quickSelect(values: number[], k: number): number {
  let left = 0;
  let right = values.length - 1;

  while (left <= right) {
    const pivotIndex = left + Math.floor((right - left) / 2);
    const nextPivotIndex = partition(values, left, right, pivotIndex);

    if (nextPivotIndex === k) {
      return values[k] as number;
    }

    if (k < nextPivotIndex) {
      right = nextPivotIndex - 1;
    } else {
      left = nextPivotIndex + 1;
    }
  }

  return values[k] as number;
}

function getPointCloudCenter(points: Point[]): THREE.Vector3 {
  let sumX = 0;
  let sumY = 0;
  let sumZ = 0;

  for (const point of points) {
    sumX += point.x;
    sumY += point.y;
    sumZ += point.z;
  }

  const invCount = 1 / points.length;
  return new THREE.Vector3(sumX * invCount, sumY * invCount, sumZ * invCount);
}

function getPercentileRadius(points: Point[], center: THREE.Vector3, percentile: number): number {
  const clampedPercentile = THREE.MathUtils.clamp(percentile, 0, 1);
  const distancesSquared = new Array<number>(points.length);

  for (let i = 0; i < points.length; i += 1) {
    const point = points[i] as Point;
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const dz = point.z - center.z;
    distancesSquared[i] = dx * dx + dy * dy + dz * dz;
  }

  const k = Math.floor((distancesSquared.length - 1) * clampedPercentile);
  const radiusSquared = quickSelect(distancesSquared, k);
  return Math.sqrt(Math.max(radiusSquared, 1));
}

export function fitCameraToPointCloud(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  points: Point[],
): void {
  if (points.length === 0) {
    return;
  }

  const center = getPointCloudCenter(points);
  const radius = getPercentileRadius(points, center, 0.80);

  controls.target.copy(center);

  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const fitHeightDistance = radius / Math.tan(vFov / 2);
  const fitWidthDistance = radius / Math.tan(hFov / 2);
  const distance = Math.max(fitHeightDistance, fitWidthDistance) * 1.2;

  const direction = camera.position.clone().sub(controls.target);
  if (direction.lengthSq() === 0) {
    direction.set(1, 1, 1);
  }
  direction.normalize();

  camera.position.copy(center).add(direction.multiplyScalar(distance));
  camera.near = Math.max(distance / 1000, 0.1);
  camera.far = Math.max(distance * 20, 1000);
  camera.updateProjectionMatrix();

  controls.minDistance = radius * 0.05;
  controls.maxDistance = radius * 20;
  controls.update();
}

export function getPointBoundsInScreenSelection(
  points: Point[],
  camera: THREE.PerspectiveCamera,
  viewportWidth: number,
  viewportHeight: number,
  selectionRect: ScreenSelectionRect,
): THREE.Box3 | null {
  const projected = new THREE.Vector3();

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (const point of points) {
    projected.set(point.x, point.y, point.z).project(camera);

    if (projected.z < -1 || projected.z > 1) {
      continue;
    }

    const screenX = (projected.x * 0.5 + 0.5) * viewportWidth;
    const screenY = (-projected.y * 0.5 + 0.5) * viewportHeight;

    if (
      screenX < selectionRect.minX ||
      screenX > selectionRect.maxX ||
      screenY < selectionRect.minY ||
      screenY > selectionRect.maxY
    ) {
      continue;
    }

    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.z < minZ) minZ = point.z;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
    if (point.z > maxZ) maxZ = point.z;
  }

  if (!Number.isFinite(minX)) {
    return null;
  }

  return new THREE.Box3(
    new THREE.Vector3(minX, minY, minZ),
    new THREE.Vector3(maxX, maxY, maxZ),
  );
}

export function addSelectionCube(
  scene: THREE.Scene,
  bounds: THREE.Box3,
): THREE.Mesh {
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const epsilon = 0.0001;

  const geometry = new THREE.BoxGeometry(
    Math.max(size.x, epsilon),
    Math.max(size.y, epsilon),
    Math.max(size.z, epsilon),
  );

  const material = new THREE.MeshBasicMaterial({
    color: 0x22d3ee,
    wireframe: true,
    transparent: true,
    opacity: 0.9,
  });

  const cube = new THREE.Mesh(geometry, material);
  cube.position.copy(center);
  scene.add(cube);
  return cube;
}
