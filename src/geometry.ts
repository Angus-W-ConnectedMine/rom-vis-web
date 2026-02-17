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

export function getPointsInScreenSelection(
  points: Point[],
  camera: THREE.PerspectiveCamera,
  viewportWidth: number,
  viewportHeight: number,
  selectionRect: ScreenSelectionRect,
): Point[] {
  const projected = new THREE.Vector3();
  const selected: Point[] = [];

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

    selected.push(point);
  }

  return selected;
}

function cross2D(o: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function getConvexHullXY(points: Point[]): THREE.Vector2[] {
  const sorted = points
    .map((point) => new THREE.Vector2(point.x, point.y))
    .sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));

  if (sorted.length <= 1) {
    return sorted;
  }

  const unique: THREE.Vector2[] = [];
  for (const point of sorted) {
    const last = unique[unique.length - 1];
    if (!last || last.x !== point.x || last.y !== point.y) {
      unique.push(point);
    }
  }

  if (unique.length <= 1) {
    return unique;
  }

  const lower: THREE.Vector2[] = [];
  for (const point of unique) {
    while (
      lower.length >= 2 &&
      cross2D(lower[lower.length - 2] as THREE.Vector2, lower[lower.length - 1] as THREE.Vector2, point) <= 0
    ) {
      lower.pop();
    }
    lower.push(point);
  }

  const upper: THREE.Vector2[] = [];
  for (let i = unique.length - 1; i >= 0; i -= 1) {
    const point = unique[i] as THREE.Vector2;
    while (
      upper.length >= 2 &&
      cross2D(upper[upper.length - 2] as THREE.Vector2, upper[upper.length - 1] as THREE.Vector2, point) <= 0
    ) {
      upper.pop();
    }
    upper.push(point);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function getFallbackFootprint(points: Point[]): THREE.Vector2[] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }

  const epsilon = 0.001;
  if (minX === maxX) {
    minX -= epsilon;
    maxX += epsilon;
  }
  if (minY === maxY) {
    minY -= epsilon;
    maxY += epsilon;
  }

  return [
    new THREE.Vector2(minX, minY),
    new THREE.Vector2(maxX, minY),
    new THREE.Vector2(maxX, maxY),
    new THREE.Vector2(minX, maxY),
  ];
}

function getEnclosingPolygonFromDirections(
  points: Point[],
  maxVertices: number,
): THREE.Vector2[] {
  const vertices = Math.max(3, maxVertices);
  const normals = new Array<THREE.Vector2>(vertices);
  const offsets = new Array<number>(vertices);

  for (let i = 0; i < vertices; i += 1) {
    const angle = (2 * Math.PI * i) / vertices;
    const normal = new THREE.Vector2(Math.cos(angle), Math.sin(angle));
    normals[i] = normal;

    let maxDot = -Infinity;
    for (const point of points) {
      const dot = normal.x * point.x + normal.y * point.y;
      if (dot > maxDot) {
        maxDot = dot;
      }
    }
    offsets[i] = maxDot;
  }

  const polygon: THREE.Vector2[] = [];
  for (let i = 0; i < vertices; i += 1) {
    const n1 = normals[i] as THREE.Vector2;
    const n2 = normals[(i + 1) % vertices] as THREE.Vector2;
    const d1 = offsets[i] as number;
    const d2 = offsets[(i + 1) % vertices] as number;

    const det = n1.x * n2.y - n1.y * n2.x;
    if (Math.abs(det) < 1e-8) {
      continue;
    }

    const x = (d1 * n2.y - n1.y * d2) / det;
    const y = (n1.x * d2 - d1 * n2.x) / det;
    polygon.push(new THREE.Vector2(x, y));
  }

  return polygon;
}

function getPrismFootprint(points: Point[], maxVertices: number): THREE.Vector2[] {
  const hull = getConvexHullXY(points);
  if (hull.length >= 3 && hull.length <= maxVertices) {
    return hull;
  }

  const rough = getEnclosingPolygonFromDirections(points, maxVertices);
  if (rough.length >= 3) {
    return rough;
  }

  return getFallbackFootprint(points);
}

export function addSelectionPrism(
  scene: THREE.Scene,
  selectedPoints: Point[],
  maxVertices = 20,
): THREE.Group | null {
  if (selectedPoints.length === 0) {
    return null;
  }

  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const point of selectedPoints) {
    if (point.z < minZ) minZ = point.z;
    if (point.z > maxZ) maxZ = point.z;
  }

  const footprint = getPrismFootprint(selectedPoints, maxVertices);
  if (footprint.length < 3) {
    return null;
  }

  const shape = new THREE.Shape(footprint);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(maxZ - minZ, 0.0001),
    bevelEnabled: false,
    steps: 1,
  });

  const material = new THREE.MeshBasicMaterial({
    color: 0x22d3ee,
    wireframe: false,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
  });

  const prismMesh = new THREE.Mesh(geometry, material);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.95,
    }),
  );

  const prism = new THREE.Group();
  prism.add(prismMesh);
  prism.add(edges);
  prism.position.z = minZ;
  scene.add(prism);
  return prism;
}
