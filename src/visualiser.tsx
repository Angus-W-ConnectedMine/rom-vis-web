import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import {
  addPointClouds,
  fromStoredPrism,
  getPointsInPrism,
  getPrismSnapshot,
  restorePrism,
  addSelectionPrism,
  fitCameraToPointCloud,
  getPointsInScreenSelection,
  toStoredPrism,
  type PrismSnapshot,
  getRegionCenter,
} from "./geometry";
import {
  Overlay,
  type RegionMeta,
  type SelectionRect,
} from "./overlay";
import type { PlanGrandTotal, PlanItem, PlanOutcomeItem } from "./OperationPlan";
import type { Point } from "./points";
import {
  loadStoredPlan,
  loadStoredPrisms,
  saveStoredPlan,
  saveStoredPrisms,
} from "./storage";
import { useSelectionController } from "./useSelectionController";

interface RegionPrism {
  key: string;
  regionId: string;
  prism: THREE.Group;
  snapshot: PrismSnapshot;
  label: CSS2DObject;
}

interface PlanStats {
  outcomeByItemId: Record<string, PlanOutcomeItem>;
  grandTotal: PlanGrandTotal;
  extractedPointsByItemId: Record<string, Point[]>;
}

const REGION_DEFAULT_COLOR = 0x22d3ee;
const REGION_SELECTED_COLOR = 0xf59e0b;

const PLAN_EXTRACTION_COLOR = 0xff4d00;
const PLAN_EXTRACTION_OPACITY = 0.3;
const REGION_LABEL_Z_OFFSET = 1.5;

function createScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f172a);
  return scene;
}

function createCamera(width: number, height: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
  camera.position.set(0, 6, 24);
  camera.up.set(0, 0, 1);
  return camera;
}

function createRenderer(container: HTMLElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);
  return renderer;
}

function createLabelRenderer(container: HTMLElement): CSS2DRenderer {
  const renderer = new CSS2DRenderer();
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.domElement.className = "visualiser-label-layer";
  renderer.domElement.style.position = "absolute";
  renderer.domElement.style.left = "0";
  renderer.domElement.style.top = "0";
  renderer.domElement.style.pointerEvents = "none";
  container.appendChild(renderer.domElement);
  return renderer;
}

function createRegionLabel(regionId: string): CSS2DObject {
  const element = document.createElement("div");
  element.className = "region-label";
  element.textContent = regionId;
  const label = new CSS2DObject(element);
  label.center.set(0.5, 0);
  return label;
}

function updateRegionLabel(label: CSS2DObject, regionId: string): void {
  if (label.element instanceof HTMLElement) {
    label.element.textContent = regionId;
  }
}

function getRegionLabelPosition(snapshot: PrismSnapshot): THREE.Vector3 {
  const center = getRegionCenter(snapshot);
  return new THREE.Vector3(center.x, center.y, snapshot.maxZ + REGION_LABEL_Z_OFFSET);
}

function addLights(scene: THREE.Scene): void {
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const directional = new THREE.DirectionalLight(0xffffff, 1.2);
  directional.position.set(6, 8, 10);
  scene.add(directional);
}

async function getPoints(): Promise<Point[]> {
  const response = await fetch("/points");
  if (!response.ok) {
    throw new Error(`Failed to load points: ${response.status}`);
  }
  return (await response.json()) as Point[];
}

function getRegionStats(points: Point[]): { min: Point; max: Point; avgW: number } {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let minW = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  let maxW = -Infinity;
  let sumW = 0;

  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.z < minZ) minZ = point.z;
    if (point.w < minW) minW = point.w;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
    if (point.z > maxZ) maxZ = point.z;
    if (point.w > maxW) maxW = point.w;
    sumW += point.w;
  }

  return {
    min: { x: minX, y: minY, z: minZ, w: minW },
    max: { x: maxX, y: maxY, z: maxZ, w: maxW },
    avgW: points.length > 0 ? sumW / points.length : 0,
  };
}

function getPointCloudOffset(points: Point[]): { x: number; y: number; z: number } {
  if (points.length === 0) {
    return { x: 0, y: 0, z: 0 };
  }

  let sumX = 0;
  let sumY = 0;
  let sumZ = 0;

  for (const point of points) {
    sumX += point.x;
    sumY += point.y;
    sumZ += point.z;
  }

  const invCount = 1 / points.length;
  return {
    x: sumX * invCount,
    y: sumY * invCount,
    z: sumZ * invCount,
  };
}

function getRegionMetaFromSelection(
  key: string,
  regionId: string,
  snapshot: PrismSnapshot,
  selectedPoints: Point[],
  pointOffset: { x: number; y: number; z: number },
): RegionMeta {
  if (selectedPoints.length > 0) {
    const region = getRegionStats(selectedPoints);
    return {
      key,
      regionId,
      pointCount: selectedPoints.length,
      minW: region.min.w,
      maxW: region.max.w,
      avgW: region.avgW,
      min: {
        x: region.min.x + pointOffset.x,
        y: region.min.y + pointOffset.y,
        z: region.min.z + pointOffset.z,
        w: region.min.w,
      },
      max: {
        x: region.max.x + pointOffset.x,
        y: region.max.y + pointOffset.y,
        z: region.max.z + pointOffset.z,
        w: region.max.w,
      },
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of snapshot.footprint) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }

  return {
    key,
    regionId,
    pointCount: 0,
    minW: 0,
    maxW: 0,
    avgW: 0,
    min: { x: minX + pointOffset.x, y: minY + pointOffset.y, z: snapshot.minZ + pointOffset.z, w: 0 },
    max: { x: maxX + pointOffset.x, y: maxY + pointOffset.y, z: snapshot.maxZ + pointOffset.z, w: 0 },
  };
}

function getDepthFromRegionEdge(
  point: Point,
  center: THREE.Vector3,
  outward: THREE.Vector3,
  maxProjection: number,
): number {
  const projection =
    (point.x - center.x) * outward.x +
    (point.y - center.y) * outward.y;
  return maxProjection - projection;
}

function clipPolygonByHalfPlane(
  polygon: Array<{ x: number; y: number }>,
  outward: THREE.Vector3,
  threshold: number,
): Array<{ x: number; y: number }> {
  if (polygon.length < 3) {
    return [];
  }

  const inside = (point: { x: number; y: number }): boolean =>
    (point.x * outward.x + point.y * outward.y) >= threshold;

  const intersect = (
    start: { x: number; y: number },
    end: { x: number; y: number },
  ): { x: number; y: number } | null => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const denominator = dx * outward.x + dy * outward.y;
    if (Math.abs(denominator) < 1e-8) {
      return null;
    }
    const t = (threshold - (start.x * outward.x + start.y * outward.y)) / denominator;
    if (t < 0 || t > 1) {
      return null;
    }
    return {
      x: start.x + t * dx,
      y: start.y + t * dy,
    };
  };

  const result: Array<{ x: number; y: number }> = [];

  for (let i = 0; i < polygon.length; i += 1) {
    const current = polygon[i] as { x: number; y: number };
    const next = polygon[(i + 1) % polygon.length] as { x: number; y: number };
    const currentInside = inside(current);
    const nextInside = inside(next);

    if (currentInside && nextInside) {
      result.push(next);
      continue;
    }

    if (currentInside && !nextInside) {
      const crossing = intersect(current, next);
      if (crossing) {
        result.push(crossing);
      }
      continue;
    }

    if (!currentInside && nextInside) {
      const crossing = intersect(current, next);
      if (crossing) {
        result.push(crossing);
      }
      result.push(next);
    }
  }

  return result;
}

function createExtractionSnapshot(
  regionSnapshot: PrismSnapshot,
  itemAngle: number,
  takenPoints: Point[],
): PrismSnapshot | null {
  if (takenPoints.length === 0 || regionSnapshot.footprint.length < 3) {
    return null;
  }

  const angleRadians = THREE.MathUtils.degToRad(itemAngle);
  const outward = new THREE.Vector3(Math.cos(angleRadians), Math.sin(angleRadians), 0);

  let threshold = Infinity;
  for (const point of takenPoints) {
    const projection = point.x * outward.x + point.y * outward.y;
    if (projection < threshold) {
      threshold = projection;
    }
  }

  if (!Number.isFinite(threshold)) {
    return null;
  }

  const clippedFootprint = clipPolygonByHalfPlane(regionSnapshot.footprint, outward, threshold);
  if (clippedFootprint.length < 3) {
    return null;
  }

  return {
    minZ: regionSnapshot.minZ,
    maxZ: regionSnapshot.maxZ,
    footprint: clippedFootprint,
  };
}

function sumW(points: Point[]): number {
  let total = 0;
  for (const point of points) {
    total += point.w;
  }
  return total;
}

function getEmptyGrandTotal(): PlanGrandTotal {
  return {
    extractedPointCount: 0,
    totalW: 0,
    averageW: 0,
  };
}

function computePlanStats(
  regions: RegionMeta[],
  plan: PlanItem[],
  regionPrisms: RegionPrism[],
  points: Point[],
): PlanStats {
  if (plan.length === 0 || regions.length === 0 || regionPrisms.length === 0 || points.length === 0) {
    return {
      outcomeByItemId: {},
      grandTotal: getEmptyGrandTotal(),
      extractedPointsByItemId: {},
    };
  }

  const regionByKey = new Map(regions.map((region) => [region.key, region]));
  const prismByKey = new Map(regionPrisms.map((regionPrism) => [regionPrism.key, regionPrism]));
  const itemsByRegionKey = new Map<string, PlanItem[]>();

  for (const item of plan) {
    const list = itemsByRegionKey.get(item.regionKey) ?? [];
    list.push(item);
    itemsByRegionKey.set(item.regionKey, list);
  }

  const outcomeByItemId: Record<string, PlanOutcomeItem> = {};
  const extractedPointsByItemId: Record<string, Point[]> = {};
  let grandExtractedPointCount = 0;
  let grandTotalW = 0;

  for (const item of plan) {
    const region = regionByKey.get(item.regionKey);
    if (!region) {
      continue;
    }

    const regionTotalW = region.avgW * region.pointCount;
    outcomeByItemId[item.id] = {
      planItemId: item.id,
      regionId: region.regionId,
      regionPointCount: region.pointCount,
      regionTotalW,
      regionAverageW: region.avgW,
      extractedPointCount: 0,
      extractedTotalW: 0,
      extractedAverageW: 0,
    };
    extractedPointsByItemId[item.id] = [];
  }

  for (const [regionKey, items] of itemsByRegionKey) {
    const region = regionByKey.get(regionKey);
    const regionPrism = prismByKey.get(regionKey);
    if (!region || !regionPrism) {
      continue;
    }

    const regionPoints = getPointsInPrism(points, regionPrism.snapshot);
    const regionPointCount = regionPoints.length;
    const regionTotalW = sumW(regionPoints);
    const regionAverageW = regionPointCount > 0 ? regionTotalW / regionPointCount : 0;
    let remaining = regionPoints;

    const center = getRegionCenter(regionPrism.snapshot);

    for (const item of items) {
      const quantity = Math.max(0, Math.round(item.quantity));
      if (quantity === 0 || remaining.length === 0) {
        outcomeByItemId[item.id] = {
          planItemId: item.id,
          regionId: region.regionId,
          regionPointCount,
          regionTotalW,
          regionAverageW,
          extractedPointCount: 0,
          extractedTotalW: 0,
          extractedAverageW: 0,
        };
        extractedPointsByItemId[item.id] = [];
        continue;
      }

      const angleRadians = THREE.MathUtils.degToRad(item.angle);
      const outward = new THREE.Vector3(Math.cos(angleRadians), Math.sin(angleRadians), 0);

      let maxProjection = -Infinity;
      for (const point of remaining) {
        const projection =
          (point.x - center.x) * outward.x +
          (point.y - center.y) * outward.y;
        if (projection > maxProjection) {
          maxProjection = projection;
        }
      }

      remaining = [...remaining]
        .sort((a, b) =>
          getDepthFromRegionEdge(a, center, outward, maxProjection) -
          getDepthFromRegionEdge(b, center, outward, maxProjection),
        );

      const takeCount = Math.min(quantity, remaining.length);
      const takenPoints = remaining.slice(0, takeCount);
      const extractedTotalW = sumW(takenPoints);
      const extractedAverageW = takeCount > 0 ? extractedTotalW / takeCount : 0;
      grandExtractedPointCount += takeCount;
      grandTotalW += extractedTotalW;
      outcomeByItemId[item.id] = {
        planItemId: item.id,
        regionId: region.regionId,
        regionPointCount,
        regionTotalW,
        regionAverageW,
        extractedPointCount: takeCount,
        extractedTotalW,
        extractedAverageW,
      };
      extractedPointsByItemId[item.id] = takenPoints;
      remaining = remaining.slice(takeCount);
    }
  }

  return {
    outcomeByItemId,
    grandTotal: {
      extractedPointCount: grandExtractedPointCount,
      totalW: grandTotalW,
      averageW: grandExtractedPointCount > 0 ? grandTotalW / grandExtractedPointCount : 0,
    },
    extractedPointsByItemId,
  };
}

export function Visualiser() {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const labelRendererRef = useRef<CSS2DRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const pointsRef = useRef<Point[]>([]);
  const pointOffsetRef = useRef<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 0 });
  const regionPrismsRef = useRef<RegionPrism[]>([]);
  const planExtractionVolumesRef = useRef<Map<string, THREE.Group>>(new Map());
  const [regions, setRegions] = useState<RegionMeta[]>([]);
  const [selectedRegionKeys, setSelectedRegionKeys] = useState<string[]>([]);
  const [plan, setPlan] = useState<PlanItem[]>(() => loadStoredPlan());
  const [regionsHydrated, setRegionsHydrated] = useState(false);
  const [editingRegionKey, setEditingRegionKey] = useState<string | null>(null);
  const [status, setStatus] = useState("Loading points...");
  const [interactionElement, setInteractionElement] = useState<HTMLCanvasElement | null>(null);

  const selectionRectRef = useRef<SelectionRect | null>(null);
  const editingRegionKeyRef = useRef<string | null>(null);
  const planStats = useMemo(
    () => computePlanStats(regions, plan, regionPrismsRef.current, pointsRef.current),
    [regions, plan],
  );

  useEffect(() => {
    editingRegionKeyRef.current = editingRegionKey;
  }, [editingRegionKey]);

  const persistRegionPrisms = useCallback((): void => {
    saveStoredPrisms(
      regionPrismsRef.current.map((regionPrism) =>
        toStoredPrism(regionPrism.key, regionPrism.regionId, regionPrism.snapshot)
      ),
    );
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    let disposed = false;
    let frameId = 0;

    const scene = createScene();
    const camera = createCamera(viewport.clientWidth, viewport.clientHeight);
    const renderer = createRenderer(viewport);
    const labelRenderer = createLabelRenderer(viewport);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.update();
    addLights(scene);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    labelRendererRef.current = labelRenderer;
    controlsRef.current = controls;
    setInteractionElement(renderer.domElement);
    regionPrismsRef.current = [];
    planExtractionVolumesRef.current.clear();

    const resize = (): void => {
      if (disposed) {
        return;
      }
      const width = viewport.clientWidth;
      const height = viewport.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      labelRenderer.setSize(width, height);
    };

    const animate = (): void => {
      if (disposed) {
        return;
      }
      controls.update();
      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const findRegionKeyFromObject = (object: THREE.Object3D): string | null => {
      let current: THREE.Object3D | null = object;
      while (current) {
        const key = current.userData.regionKey;
        if (typeof key === "string") {
          return key;
        }
        current = current.parent;
      }
      return null;
    };

    const onSceneClick = (event: MouseEvent): void => {
      if (editingRegionKeyRef.current !== null || selectionRectRef.current) {
        return;
      }

      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return;
      }

      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      const regionObjects = regionPrismsRef.current.map((regionPrism) => regionPrism.prism);
      const intersections = raycaster.intersectObjects(regionObjects, true);
      if (intersections.length === 0) {
        return;
      }

      const key = findRegionKeyFromObject(intersections[0]!.object);
      if (key === null) {
        return;
      }

      setSelectedRegionKeys((prev) =>
        prev.includes(key) ? prev.filter((value) => value !== key) : [...prev, key],
      );
    };

    window.addEventListener("resize", resize);
    renderer.domElement.addEventListener("click", onSceneClick);

    void (async () => {
      try {
        const sourcePoints = await getPoints();
        if (disposed) {
          return;
        }

        const pointOffset = getPointCloudOffset(sourcePoints);
        const renderPoints = sourcePoints.map((point) => ({
          x: point.x - pointOffset.x,
          y: point.y - pointOffset.y,
          z: point.z - pointOffset.z,
          w: point.w,
        }));

        pointOffsetRef.current = pointOffset;
        pointsRef.current = renderPoints;
        addPointClouds(scene, renderPoints);

        const storedPrisms = loadStoredPrisms();
        if (storedPrisms.length > 0) {
          const restoredRegionPrisms: RegionPrism[] = [];
          const restoredRegions: RegionMeta[] = [];

          for (const storedPrism of storedPrisms) {
            const snapshot = fromStoredPrism(storedPrism);
            const prism = restorePrism(scene, snapshot);
            if (!prism) {
              continue;
            }

            const key = storedPrism.key;
            const regionId = storedPrism.regionId;
            const label = createRegionLabel(regionId);
            label.position.copy(getRegionLabelPosition(snapshot));
            scene.add(label);
            const selectedPoints = getPointsInPrism(renderPoints, snapshot);
            prism.userData.regionKey = key;
            prism.traverse((node) => {
              node.userData.regionKey = key;
            });
            restoredRegionPrisms.push({ key, regionId, prism, snapshot, label });
            restoredRegions.push(
              getRegionMetaFromSelection(key, regionId, snapshot, selectedPoints, pointOffset),
            );
          }

          regionPrismsRef.current = restoredRegionPrisms;
          setRegions(restoredRegions);
        }
        setRegionsHydrated(true);

        fitCameraToPointCloud(camera, controls, renderPoints);
        setStatus(
          "Shift + drag to select",
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatus(`Failed to initialize scene: ${message}`);
      } finally {
        if (!disposed) {
          animate();
        }
      }
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);

      window.removeEventListener("resize", resize);
      renderer.domElement.removeEventListener("click", onSceneClick);

      for (const regionPrism of regionPrismsRef.current) {
        scene.remove(regionPrism.prism);
        scene.remove(regionPrism.label);
      }
      regionPrismsRef.current = [];
      for (const volume of planExtractionVolumesRef.current.values()) {
        scene.remove(volume);
      }
      planExtractionVolumesRef.current.clear();
      controls.dispose();
      renderer.dispose();
      labelRenderer.domElement.remove();
      renderer.domElement.remove();

      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      labelRendererRef.current = null;
      controlsRef.current = null;
      pointsRef.current = [];
      pointOffsetRef.current = { x: 0, y: 0, z: 0 };
      setSelectedRegionKeys([]);
      setPlan([]);
      setRegionsHydrated(false);
      setEditingRegionKey(null);
      setInteractionElement(null);
    };
  }, []);

  // Disable controls while selecting to prevent conflicts
  const onCurrentlySelectingChange = useCallback((currentlySelecting: boolean): void => {
    const controls = controlsRef.current;

    if (!controls) {
      return;
    }

    controls.enabled = !currentlySelecting;
  }, []);

  const handleSelectionComplete = useCallback((rect: SelectionRect): void => {
    if (editingRegionKey !== null) {
      return;
    }

    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    const points = pointsRef.current;

    if (!scene || !camera || !renderer || points.length === 0) {
      return;
    }

    const selectedPoints = getPointsInScreenSelection(
      points,
      camera,
      renderer.domElement.clientWidth,
      renderer.domElement.clientHeight,
      {
        minX: rect.left,
        maxX: rect.left + rect.width,
        minY: rect.top,
        maxY: rect.top + rect.height,
      },
    );

    if (selectedPoints.length === 0) {
      return;
    }

    const prism = addSelectionPrism(scene, selectedPoints, 20);
    if (!prism) {
      return;
    }

    const prismSnapshot = getPrismSnapshot(prism);
    if (!prismSnapshot) {
      scene.remove(prism);
      return;
    }

    const pointOffset = pointOffsetRef.current;
    const key = crypto.randomUUID();
    const suggestedId = `region-${Math.floor(Math.random() * 1000)}`;
    const label = createRegionLabel(suggestedId);
    label.position.copy(getRegionLabelPosition(prismSnapshot));
    scene.add(label);

    prism.userData.regionKey = key;
    prism.traverse((node) => {
      node.userData.regionKey = key;
    });
    regionPrismsRef.current.push({ key, regionId: suggestedId, prism, snapshot: prismSnapshot, label });
    persistRegionPrisms();

    setRegions((prev) => [
      ...prev,
      getRegionMetaFromSelection(key, suggestedId, prismSnapshot, selectedPoints, pointOffset),
    ]);
    setStatus("Region added. Use Edit to rename.");
  }, [editingRegionKey, persistRegionPrisms]);

  const { selectionRect } = useSelectionController({
    interactionElement,
    selectionEnabled: editingRegionKey === null,
    onCurrentlySelectingChange,
    onSelectionComplete: handleSelectionComplete,
  });

  useEffect(() => {
    selectionRectRef.current = selectionRect;
  }, [selectionRect]);

  useEffect(() => {
    if (!regionsHydrated) {
      return;
    }

    setPlan((prev) => {
      const regionKeys = new Set(regions.map((region) => region.key));
      const next = prev.filter((item) => regionKeys.has(item.regionKey));
      return next.length === prev.length ? prev : next;
    });
  }, [regions, regionsHydrated]);

  useEffect(() => {
    if (!regionsHydrated) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      saveStoredPlan(plan);
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [plan, regionsHydrated]);

  useEffect(() => {
    syncPlanExtractionVolumes(plan, planStats.extractedPointsByItemId);
  }, [plan, planStats.extractedPointsByItemId]);

  const handleAddRegionToPlan = useCallback((region: RegionMeta): void => {
    const planItemId = crypto.randomUUID();
    setPlan((prev) => {
      const next = [
        ...prev,
        {
          id: planItemId,
          regionKey: region.key,
          angle: 0,
          quantity: Math.max(0, Math.min(region.pointCount, 100)),
        },
      ];
      saveStoredPlan(next);
      return next;
    });
  }, []);

  function syncPlanExtractionVolumes(items: PlanItem[], extractedPointsByItemId: Record<string, Point[]>): void {
    const scene = sceneRef.current;
    if (!scene) {
      return;
    }

    const prismByKey = new Map(regionPrismsRef.current.map((regionPrism) => [regionPrism.key, regionPrism]));

    for (const volume of planExtractionVolumesRef.current.values()) {
      scene.remove(volume);
    }
    planExtractionVolumesRef.current.clear();

    for (const item of items) {
      const extractedPoints = extractedPointsByItemId[item.id] ?? [];
      if (extractedPoints.length === 0) {
        continue;
      }

      const regionPrism = prismByKey.get(item.regionKey);
      if (!regionPrism) {
        continue;
      }

      const extractionSnapshot = createExtractionSnapshot(
        regionPrism.snapshot,
        item.angle,
        extractedPoints,
      );
      if (!extractionSnapshot) {
        continue;
      }

      const extractionVolume = restorePrism(scene, extractionSnapshot);
      if (!extractionVolume) {
        continue;
      }

      extractionVolume.traverse((node) => {
        if (node instanceof THREE.Mesh && node.material instanceof THREE.MeshBasicMaterial) {
          node.material.color.setHex(PLAN_EXTRACTION_COLOR);
          node.material.opacity = PLAN_EXTRACTION_OPACITY;
          node.material.needsUpdate = true;
        }
        if (node instanceof THREE.LineSegments && node.material instanceof THREE.LineBasicMaterial) {
          node.material.color.setHex(PLAN_EXTRACTION_COLOR);
          node.material.opacity = 0.9;
          node.material.needsUpdate = true;
        }
      });

      planExtractionVolumesRef.current.set(item.id, extractionVolume);
    }
  }

  const handleUpdatePlanAngle = useCallback((planItemId: string, angle: number): void => {
    const normalized = Number.isFinite(angle)
      ? THREE.MathUtils.clamp(Math.round(angle), 0, 360)
      : 0;
    setPlan((prev) =>
      prev.map((item) => (item.id === planItemId ? { ...item, angle: normalized } : item)),
    );
  }, []);

  const handleDeletePlanItem = useCallback((planItemId: string): void => {
    setPlan((prev) => prev.filter((item) => item.id !== planItemId));
  }, []);

  const handleUpdatePlanQuantity = useCallback((planItemId: string, quantity: number): void => {
    const normalized = Number.isFinite(quantity)
      ? Math.max(0, Math.round(quantity))
      : 0;
    setPlan((prev) =>
      prev.map((item) => (item.id === planItemId ? { ...item, quantity: normalized } : item)),
    );
  }, []);

  const handleRequestRegionEdit = useCallback((key: string): void => {
    setEditingRegionKey(key);
  }, []);

  const handleSaveRegionEdit = useCallback((key: string, regionId: string): void => {
    for (const regionPrism of regionPrismsRef.current) {
      if (regionPrism.key === key) {
        regionPrism.regionId = regionId;
        updateRegionLabel(regionPrism.label, regionId);
        break;
      }
    }
    persistRegionPrisms();
    setRegions((prev) =>
      prev.map((region) =>
        region.key === key
          ? {
            ...region,
            regionId,
          }
          : region,
      ),
    );
    setEditingRegionKey(null);
    setStatus("Region updated.");
  }, [persistRegionPrisms]);

  const handleCancelRegionEdit = useCallback((): void => {
    setEditingRegionKey(null);
    setStatus("Edit cancelled.");
  }, []);

  const applyRegionSelectionVisuals = useCallback((selectedKeys: string[]): void => {
    const selected = new Set(selectedKeys);
    for (const regionPrism of regionPrismsRef.current) {
      const isSelected = selected.has(regionPrism.key);
      regionPrism.prism.traverse((node) => {
        if (node instanceof THREE.Mesh && node.material instanceof THREE.MeshBasicMaterial) {
          node.material.color.setHex(isSelected ? REGION_SELECTED_COLOR : REGION_DEFAULT_COLOR);
          node.material.opacity = isSelected ? 0.3 : 0.12;
          node.material.needsUpdate = true;
        }
        if (node instanceof THREE.LineSegments && node.material instanceof THREE.LineBasicMaterial) {
          node.material.color.setHex(isSelected ? REGION_SELECTED_COLOR : REGION_DEFAULT_COLOR);
          node.material.opacity = isSelected ? 1 : 0.95;
          node.material.needsUpdate = true;
        }
      });
    }
  }, []);

  const handleSelectRegion = useCallback((key: string): void => {
    setSelectedRegionKeys((prev) =>
      prev.includes(key) ? prev.filter((value) => value !== key) : [...prev, key],
    );
  }, []);

  useEffect(() => {
    applyRegionSelectionVisuals(selectedRegionKeys);
  }, [selectedRegionKeys, applyRegionSelectionVisuals, regions.length]);

  const handleDeleteRegion = useCallback((key: string): void => {
    const scene = sceneRef.current;
    if (!scene) {
      return;
    }

    const nextRegionPrisms: RegionPrism[] = [];
    for (const regionPrism of regionPrismsRef.current) {
      if (regionPrism.key === key) {
        scene.remove(regionPrism.prism);
        scene.remove(regionPrism.label);
      } else {
        nextRegionPrisms.push(regionPrism);
      }
    }
    regionPrismsRef.current = nextRegionPrisms;
    persistRegionPrisms();
    setRegions((prev) => prev.filter((region) => region.key !== key));
    setSelectedRegionKeys((prev) => prev.filter((value) => value !== key));
    setPlan((prev) => prev.filter((item) => item.regionKey !== key));
    setEditingRegionKey((prev) => (prev === key ? null : prev));
  }, [persistRegionPrisms]);

  const handleClearSelections = useCallback((): void => {
    setSelectedRegionKeys([]);
  }, []);

  const editingRegion = editingRegionKey === null
    ? null
    : regions.find((region) => region.key === editingRegionKey) ?? null;

  return (
    <div className="visualiser-root">
      <div ref={viewportRef} className="visualiser-viewport" />
      <Overlay
        selectionRect={selectionRect}
        editingRegion={editingRegion}
        onSaveRegionEdit={handleSaveRegionEdit}
        onCancelRegionEdit={handleCancelRegionEdit}
        onRequestRegionEdit={handleRequestRegionEdit}
        status={status}
        regions={regions}
        selectedRegionKeys={selectedRegionKeys}
        onSelectRegion={handleSelectRegion}
        onDeleteRegion={handleDeleteRegion}
        onClearSelections={handleClearSelections}
        plan={plan}
        outcomeByItemId={planStats.outcomeByItemId}
        grandTotal={planStats.grandTotal}
        onAddRegionToPlan={handleAddRegionToPlan}
        onUpdatePlanAngle={handleUpdatePlanAngle}
        onUpdatePlanQuantity={handleUpdatePlanQuantity}
        onDeletePlanItem={handleDeletePlanItem}
      />
    </div>
  );
}
