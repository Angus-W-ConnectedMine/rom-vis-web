import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Point } from "./points";
import type { StoredPrism } from "./storage";

export interface ScreenSelectionRect {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface PrismSnapshot {
  minZ: number;
  maxZ: number;
  footprint: Array<{ x: number; y: number }>;
}

const POLYGON_EPSILON = 1e-9;

// Keep this as a constant so we can wire to UI/config later.
export const POINT_COLOR_STEPS = [
  0x991b1b, // Red
  0xdc2626,
  0xea580c,
  0xca8a04,
  0x65a30d,
  0x16a34a, // Green
] as const;

function getColorStepIndex(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || max <= min) {
    return 0;
  }

  const normalized = THREE.MathUtils.clamp((value - min) / (max - min), 0, 1);
  const steps = POINT_COLOR_STEPS.length;
  return Math.min(Math.floor(normalized * steps), steps - 1);
}

export function addPointCloud(
  scene: THREE.Scene,
  points: Point[],
  color: number,
): THREE.Points {
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
    color,
    size: 1,
    sizeAttenuation: true,
  });

  const pointCloud = new THREE.Points(geometry, material);
  scene.add(pointCloud);
  return pointCloud;
}

/** Splits points into different colourised point clouds */
export function addPointClouds(scene: THREE.Scene, allPoints: Point[]): THREE.Group {
  let minW = Infinity;
  let maxW = -Infinity;
  for (const point of allPoints) {
    if (point.w < minW) minW = point.w;
    if (point.w > maxW) maxW = point.w;
  }

  const numBuckets = POINT_COLOR_STEPS.length;
  const buckets: Point[][] = Array.from({ length: numBuckets }, () => [] as Point[]);

  for (const point of allPoints) {
    const index = getColorStepIndex(point.w, minW, maxW);
    const bucket = buckets[index]!;
    bucket.push(point);
  }

  const pointClouds = new THREE.Group();

  for (let i = 0; i < numBuckets; i += 1) {
    const points = buckets[i] as Point[];

    if (points.length === 0) {
      continue;
    }

    const color = POINT_COLOR_STEPS[i]!;

    const cloud = addPointCloud(scene, points, color);

    pointClouds.add(cloud);
  }

  scene.add(pointClouds);

  return pointClouds;
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

  // 45-degrees
  const direction = new THREE.Vector3(0, 1, 1).normalize();

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

function isPointOnSegment2D(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): boolean {
  const cross = (px - ax) * (by - ay) - (py - ay) * (bx - ax);
  if (Math.abs(cross) > POLYGON_EPSILON) {
    return false;
  }

  const dot = (px - ax) * (bx - ax) + (py - ay) * (by - ay);
  if (dot < -POLYGON_EPSILON) {
    return false;
  }

  const lengthSquared = (bx - ax) * (bx - ax) + (by - ay) * (by - ay);
  return dot <= lengthSquared + POLYGON_EPSILON;
}

function isPointInPolygon2D(x: number, y: number, polygon: Array<{ x: number; y: number }>): boolean {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const current = polygon[i] as { x: number; y: number };
    const previous = polygon[j] as { x: number; y: number };

    if (isPointOnSegment2D(x, y, current.x, current.y, previous.x, previous.y)) {
      return true;
    }

    const intersects = ((current.y > y) !== (previous.y > y)) &&
      (x < (previous.x - current.x) * (y - current.y) / (previous.y - current.y) + current.x);

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

export function getPointsInPrism(points: Point[], snapshot: PrismSnapshot): Point[] {
  if (snapshot.footprint.length < 3) {
    return [];
  }

  const minZ = Math.min(snapshot.minZ, snapshot.maxZ);
  const maxZ = Math.max(snapshot.minZ, snapshot.maxZ);
  const selected: Point[] = [];

  for (const point of points) {
    if (point.z < minZ || point.z > maxZ) {
      continue;
    }

    if (isPointInPolygon2D(point.x, point.y, snapshot.footprint)) {
      selected.push(point);
    }
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
    while (lower.length >= 2 && cross2D(lower[lower.length - 2] as THREE.Vector2, lower[lower.length - 1] as THREE.Vector2, point) <= 0) {
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

function getRectangularFootprint(points: Point[]): THREE.Vector2[] {
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

  return getRectangularFootprint(points);
}

function addPrismFromSnapshot(
  scene: THREE.Scene,
  snapshot: PrismSnapshot,
): THREE.Group | null {
  const { minZ, maxZ } = snapshot;

  if (!Number.isFinite(minZ) || !Number.isFinite(maxZ)) {
    return null;
  }

  const footprint = snapshot.footprint
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .map((point) => new THREE.Vector2(point.x, point.y));

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
  prism.userData.prismSnapshot = snapshot;
  scene.add(prism);

  return prism;
}

export function toStoredPrism(key: number, regionId: string, snapshot: PrismSnapshot): StoredPrism {
  return {
    key,
    regionId,
    minZ: snapshot.minZ,
    maxZ: snapshot.maxZ,
    footprint: snapshot.footprint.map((point) => ({ x: point.x, y: point.y })),
  };
}

export function fromStoredPrism(storedPrism: StoredPrism): PrismSnapshot {
  return {
    minZ: storedPrism.minZ,
    maxZ: storedPrism.maxZ,
    footprint: storedPrism.footprint.map((point) => ({ x: point.x, y: point.y })),
  };
}

export function restorePrism(
  scene: THREE.Scene,
  snapshot: PrismSnapshot,
): THREE.Group | null {
  return addPrismFromSnapshot(scene, snapshot);
}

export function getPrismSnapshot(prism: THREE.Group): PrismSnapshot | null {
  const snapshot = prism.userData.prismSnapshot as PrismSnapshot | undefined;
  if (!snapshot) {
    return null;
  }

  return {
    minZ: snapshot.minZ,
    maxZ: snapshot.maxZ,
    footprint: snapshot.footprint.map((point) => ({ x: point.x, y: point.y })),
  };
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

  return addPrismFromSnapshot(scene, {
    minZ,
    maxZ,
    footprint: footprint.map((point) => ({ x: point.x, y: point.y })),
  });
}
