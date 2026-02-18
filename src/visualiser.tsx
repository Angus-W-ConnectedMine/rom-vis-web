import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
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
  getDistanceToPrismEdge,
  getRegionCenter,
} from "./geometry";
import {
  Overlay,
  type RegionMeta,
  type SelectionRect,
} from "./overlay";
import type { PlanItem } from "./OperationPlan";
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
}

const REGION_DEFAULT_COLOR = 0x22d3ee;
const REGION_SELECTED_COLOR = 0xf59e0b;

const PLAN_ARROW_COLOR = 0xf8fafc;
const PLAN_ARROW_LENGTH = 12;
const PLAN_ARROW_HEAD_LENGTH = 4;
const PLAN_ARROW_HEAD_WIDTH = 4;
const PLAN_ARROW_EDGE_GAP = 4;

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

export function Visualiser() {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const pointsRef = useRef<Point[]>([]);
  const pointOffsetRef = useRef<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 0 });
  const regionPrismsRef = useRef<RegionPrism[]>([]);
  const planArrowsRef = useRef<Map<string, THREE.ArrowHelper>>(new Map());
  const [regions, setRegions] = useState<RegionMeta[]>([]);
  const [selectedRegionKeys, setSelectedRegionKeys] = useState<string[]>([]);
  const [plan, setPlan] = useState<PlanItem[]>(() => loadStoredPlan());
  const [regionsHydrated, setRegionsHydrated] = useState(false);
  const [editingRegionKey, setEditingRegionKey] = useState<string | null>(null);
  const [status, setStatus] = useState("Loading points...");
  const [interactionElement, setInteractionElement] = useState<HTMLCanvasElement | null>(null);

  const selectionRectRef = useRef<SelectionRect | null>(null);
  const editingRegionKeyRef = useRef<string | null>(null);

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

  const syncPlanArrows = useCallback((items: PlanItem[]): void => {
    const scene = sceneRef.current;
    if (!scene) {
      return;
    }

    const prismByKey = new Map(regionPrismsRef.current.map((regionPrism) => [regionPrism.key, regionPrism]));
    const activeKeys = new Set<string>();

    for (const item of items) {
      const regionPrism = prismByKey.get(item.regionKey);
      if (!regionPrism) {
        continue;
      }

      activeKeys.add(item.id);
      const center = getRegionCenter(regionPrism.snapshot);
      const angleRadians = THREE.MathUtils.degToRad(item.angle);
      const outward = new THREE.Vector3(Math.cos(angleRadians), Math.sin(angleRadians), 0);
      const edgeDistance = getDistanceToPrismEdge(regionPrism.snapshot, center, outward);
      const tip = center.clone().add(outward.clone().multiplyScalar(edgeDistance + PLAN_ARROW_EDGE_GAP));
      const direction = center.clone().sub(tip).normalize();
      const origin = tip.clone().add(outward.clone().multiplyScalar(PLAN_ARROW_LENGTH));

      const existingArrow = planArrowsRef.current.get(item.id);
      if (existingArrow) {
        existingArrow.position.copy(origin);
        existingArrow.setDirection(direction);
        existingArrow.setLength(PLAN_ARROW_LENGTH, PLAN_ARROW_HEAD_LENGTH, PLAN_ARROW_HEAD_WIDTH);
      } else {
        const arrow = new THREE.ArrowHelper(
          direction,
          origin,
          PLAN_ARROW_LENGTH,
          PLAN_ARROW_COLOR,
          PLAN_ARROW_HEAD_LENGTH,
          PLAN_ARROW_HEAD_WIDTH,
        );
        scene.add(arrow);
        planArrowsRef.current.set(item.id, arrow);
      }
    }

    for (const [key, arrow] of planArrowsRef.current) {
      if (!activeKeys.has(key)) {
        scene.remove(arrow);
        planArrowsRef.current.delete(key);
      }
    }
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
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.update();
    addLights(scene);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;
    setInteractionElement(renderer.domElement);
    regionPrismsRef.current = [];
    planArrowsRef.current.clear();

    const resize = (): void => {
      if (disposed) {
        return;
      }
      const width = viewport.clientWidth;
      const height = viewport.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    const animate = (): void => {
      if (disposed) {
        return;
      }
      controls.update();
      renderer.render(scene, camera);
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
            const selectedPoints = getPointsInPrism(renderPoints, snapshot);
            prism.userData.regionKey = key;
            prism.traverse((node) => {
              node.userData.regionKey = key;
            });
            restoredRegionPrisms.push({ key, regionId, prism, snapshot });
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
      }
      regionPrismsRef.current = [];
      for (const arrow of planArrowsRef.current.values()) {
        scene.remove(arrow);
      }
      planArrowsRef.current.clear();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();

      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
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

    prism.userData.regionKey = key;
    prism.traverse((node) => {
      node.userData.regionKey = key;
    });
    regionPrismsRef.current.push({ key, regionId: suggestedId, prism, snapshot: prismSnapshot });
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
    syncPlanArrows(plan);
  }, [plan, regions.length, syncPlanArrows]);

  const handleAddRegionToPlan = useCallback((region: RegionMeta): void => {
    const planItemId = crypto.randomUUID();
    setPlan((prev) => {
      const next = [...prev, { id: planItemId, regionKey: region.key, angle: 0 }];
      saveStoredPlan(next);
      return next;
    });
  }, []);

  const handleUpdatePlanAngle = useCallback((planItemId: string, angle: number): void => {
    const normalized = THREE.MathUtils.clamp(Math.round(angle), 0, 360);
    setPlan((prev) =>
      prev.map((item) => (item.id === planItemId ? { ...item, angle: normalized } : item)),
    );
  }, []);

  const handleDeletePlanItem = useCallback((planItemId: string): void => {
    setPlan((prev) => prev.filter((item) => item.id !== planItemId));
  }, []);

  const handleRequestRegionEdit = useCallback((key: string): void => {
    setEditingRegionKey(key);
  }, []);

  const handleSaveRegionEdit = useCallback((key: string, regionId: string): void => {
    for (const regionPrism of regionPrismsRef.current) {
      if (regionPrism.key === key) {
        regionPrism.regionId = regionId;
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
        onAddRegionToPlan={handleAddRegionToPlan}
        onUpdatePlanAngle={handleUpdatePlanAngle}
        onDeletePlanItem={handleDeletePlanItem}
      />
    </div>
  );
}
