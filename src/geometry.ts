import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Point } from "./points";

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
