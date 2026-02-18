import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import {
  addPointClouds,
  getPointsInPrism,
  getPrismSnapshot,
  addSelectionPrism,
  getPointsInScreenSelection,
  restorePrism,
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
  saveStoredPlan,
  saveStoredPrisms,
} from "./storage";
import { computePlanStats } from "./planStats";
import {
  generatePlan,
  getAllowedAnglesByRegionKey,
  type GeneratePlanProgress,
} from "./planGenerator";
import { usePlanExtractionVolumes } from "./usePlanExtractionVolumes";
import { useSelectionController } from "./useSelectionController";
import { useVisualiserScene, type RegionPrism } from "./useVisualiserScene";

const REGION_DEFAULT_COLOR = 0x22d3ee;
const REGION_SELECTED_COLOR = 0xf59e0b;

const REGION_LABEL_Z_OFFSET = 1.5;

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

function cross2D(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function getConvexHull2D(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  if (points.length <= 1) {
    return points;
  }

  const sorted = [...points].sort((left, right) => (
    left.x === right.x ? left.y - right.y : left.x - right.x
  ));

  const unique: Array<{ x: number; y: number }> = [];
  for (const point of sorted) {
    const last = unique[unique.length - 1];
    if (!last || last.x !== point.x || last.y !== point.y) {
      unique.push(point);
    }
  }

  if (unique.length <= 2) {
    return unique;
  }

  const lower: Array<{ x: number; y: number }> = [];
  for (const point of unique) {
    while (lower.length >= 2 && cross2D(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }

  const upper: Array<{ x: number; y: number }> = [];
  for (let i = unique.length - 1; i >= 0; i -= 1) {
    const point = unique[i]!;
    while (upper.length >= 2 && cross2D(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function buildInsideDebugSnapshots(points: Point[], gridResolution = 64): PrismSnapshot[] {
  if (points.length === 0) {
    return [];
  }

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.z < minZ) minZ = point.z;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
    if (point.z > maxZ) maxZ = point.z;
  }

  const columns = Math.max(8, gridResolution);
  const rows = Math.max(8, gridResolution);
  const width = Math.max(1e-6, maxX - minX);
  const height = Math.max(1e-6, maxY - minY);
  const cellWidth = width / columns;
  const cellHeight = height / rows;
  const pointsByCell = new Map<number, Point[]>();

  for (const point of points) {
    const xNorm = (point.x - minX) / width;
    const yNorm = (point.y - minY) / height;
    const column = THREE.MathUtils.clamp(Math.floor(xNorm * columns), 0, columns - 1);
    const row = THREE.MathUtils.clamp(Math.floor(yNorm * rows), 0, rows - 1);
    const index = row * columns + column;
    const cellPoints = pointsByCell.get(index);
    if (cellPoints) {
      cellPoints.push(point);
    } else {
      pointsByCell.set(index, [point]);
    }
  }

  const occupied = new Set(pointsByCell.keys());
  const visited = new Set<number>();
  const snapshots: PrismSnapshot[] = [];

  const minComponentPointCount = 20;

  for (const startIndex of occupied) {
    if (visited.has(startIndex)) {
      continue;
    }

    const queue = [startIndex];
    visited.add(startIndex);
    const componentPoints: Point[] = [];

    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) {
        continue;
      }

      const pointsInCell = pointsByCell.get(current);
      if (pointsInCell) {
        componentPoints.push(...pointsInCell);
      }

      const row = Math.floor(current / columns);
      const column = current % columns;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) {
            continue;
          }
          const nextRow = row + dy;
          const nextColumn = column + dx;
          if (nextRow < 0 || nextRow >= rows || nextColumn < 0 || nextColumn >= columns) {
            continue;
          }
          const neighbor = nextRow * columns + nextColumn;
          if (!occupied.has(neighbor) || visited.has(neighbor)) {
            continue;
          }
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    if (componentPoints.length < minComponentPointCount) {
      continue;
    }

    let componentMinZ = Infinity;
    let componentMaxZ = -Infinity;
    const hull = getConvexHull2D(componentPoints.map((point) => ({ x: point.x, y: point.y })));
    if (hull.length < 3) {
      continue;
    }

    for (const point of componentPoints) {
      if (point.z < componentMinZ) componentMinZ = point.z;
      if (point.z > componentMaxZ) componentMaxZ = point.z;
    }

    snapshots.push({
      minZ: componentMinZ,
      maxZ: componentMaxZ,
      footprint: hull,
    });
  }

  if (snapshots.length === 0) {
    const x0 = minX;
    const x1 = minX + cellWidth;
    const y0 = minY;
    const y1 = minY + cellHeight;
    snapshots.push({
      minZ,
      maxZ,
      footprint: [
        { x: x0, y: y0 },
        { x: x1, y: y0 },
        { x: x1, y: y1 },
        { x: x0, y: y1 },
      ],
    });
  }

  return snapshots;
}

function clearDebugPrisms(scene: THREE.Scene, prismGroups: THREE.Group[]): void {
  for (const prism of prismGroups) {
    scene.remove(prism);
    prism.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        node.geometry.dispose();
        if (node.material instanceof THREE.Material) {
          node.material.dispose();
        }
      }
      if (node instanceof THREE.LineSegments) {
        node.geometry.dispose();
        if (node.material instanceof THREE.Material) {
          node.material.dispose();
        }
      }
    });
  }
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
  const [targetTotalPoints, setTargetTotalPoints] = useState(500);
  const [targetGrade, setTargetGrade] = useState(1);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [planGenerationProgress, setPlanGenerationProgress] = useState<GeneratePlanProgress | null>(null);
  const [showInsideDebugPrisms, setShowInsideDebugPrisms] = useState(false);
  const [insideDebugPrismCount, setInsideDebugPrismCount] = useState(0);
  const generateRunIdRef = useRef(0);
  const debugInsidePrismsRef = useRef<THREE.Group[]>([]);

  const selectionRectRef = useRef<SelectionRect | null>(null);
  const editingRegionKeyRef = useRef<string | null>(null);
  const planStats = useMemo(
    () => computePlanStats(regions, plan, regionPrismsRef.current, pointsRef.current),
    [regions, plan],
  );
  const invalidPlanItemIds = useMemo(() => {
    const allowedByRegionKey = getAllowedAnglesByRegionKey(regionPrismsRef.current, pointsRef.current);
    const invalid = new Set<string>();

    for (const item of plan) {
      const allowedAngles = allowedByRegionKey.get(item.regionKey);
      if (!allowedAngles) {
        continue;
      }

      const normalizedAngle = ((Math.round(item.angle) % 360) + 360) % 360;
      if (!allowedAngles.has(normalizedAngle)) {
        invalid.add(item.id);
      }
    }

    return invalid;
  }, [plan, regions]);

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

  useVisualiserScene({
    viewportRef,
    selectionRectRef,
    editingRegionKeyRef,
    sceneRef,
    cameraRef,
    rendererRef,
    labelRendererRef,
    controlsRef,
    pointsRef,
    pointOffsetRef,
    regionPrismsRef,
    planExtractionVolumesRef,
    setInteractionElement,
    setRegions,
    setRegionsHydrated,
    setStatus,
    setSelectedRegionKeys,
    setPlan,
    setEditingRegionKey,
    createRegionLabel,
    getRegionLabelPosition,
    getRegionMetaFromSelection,
  });

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

  usePlanExtractionVolumes({
    sceneRef,
    regionPrismsRef,
    planExtractionVolumesRef,
    plan,
    extractedPointsByItemId: planStats.extractedPointsByItemId,
    invalidPlanItemIds,
  });

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) {
      return;
    }

    clearDebugPrisms(scene, debugInsidePrismsRef.current);
    debugInsidePrismsRef.current = [];
    setInsideDebugPrismCount(0);

    if (!showInsideDebugPrisms) {
      return;
    }

    const snapshots = buildInsideDebugSnapshots(pointsRef.current);
    const created: THREE.Group[] = [];
    for (const snapshot of snapshots) {
      const prism = restorePrism(scene, snapshot);
      if (!prism) {
        continue;
      }
      prism.traverse((node) => {
        if (node instanceof THREE.Mesh && node.material instanceof THREE.MeshBasicMaterial) {
          node.material.color.setHex(0x38bdf8);
          node.material.opacity = 0.08;
          node.material.needsUpdate = true;
        }
        if (node instanceof THREE.LineSegments && node.material instanceof THREE.LineBasicMaterial) {
          node.material.color.setHex(0x7dd3fc);
          node.material.opacity = 0.35;
          node.material.needsUpdate = true;
        }
      });
      created.push(prism);
    }

    debugInsidePrismsRef.current = created;
    setInsideDebugPrismCount(created.length);
  }, [showInsideDebugPrisms, regions.length, regionsHydrated]);

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

  const handleUpdateTargetTotalPoints = useCallback((value: number): void => {
    const normalized = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
    setTargetTotalPoints(normalized);
  }, []);

  const handleUpdateTargetGrade = useCallback((value: number): void => {
    const normalized = Number.isFinite(value) ? value : 0;
    setTargetGrade(normalized);
  }, []);

  const handleStopGeneratePlan = useCallback((): void => {
    if (!isGeneratingPlan) {
      return;
    }
    generateRunIdRef.current += 1;
    setIsGeneratingPlan(false);
    setStatus("Plan generation stopped.");
  }, [isGeneratingPlan]);

  const handleGeneratePlan = useCallback(async (): Promise<void> => {
    if (isGeneratingPlan) {
      return;
    }

    const selectedKeySet = new Set(selectedRegionKeys);
    const selectedRegions = selectedRegionKeys.length > 0
      ? regions.filter((region) => selectedKeySet.has(region.key))
      : regions;

    if (selectedRegions.length === 0) {
      setStatus("No regions available for plan generation.");
      return;
    }

    const runId = generateRunIdRef.current + 1;
    generateRunIdRef.current = runId;
    setIsGeneratingPlan(true);
    setPlanGenerationProgress(null);
    setStatus("Generating plan...");

    try {
      const result = await generatePlan({
        regions: selectedRegions,
        regionPrisms: regionPrismsRef.current,
        points: pointsRef.current,
        desiredTotalPoints: targetTotalPoints,
        desiredGrade: targetGrade,
        shouldContinue: () => generateRunIdRef.current === runId,
        onProgress: (progress) => {
          if (generateRunIdRef.current !== runId) {
            return;
          }
          setPlanGenerationProgress(progress);
          setPlan(progress.bestPlan);
          setStatus(
            `Generating plan (gen ${progress.generation}) - points ${progress.bestStats.grandTotal.extractedPointCount}, grade ${progress.bestStats.grandTotal.averageW.toFixed(2)}`,
          );
        },
      });

      if (generateRunIdRef.current !== runId) {
        return;
      }

      setPlan(result.plan);
      setPlanGenerationProgress((prev) =>
        prev ?? {
          generation: result.generation,
          bestScore: result.score,
          bestPlan: result.plan,
          bestStats: result.stats,
          done: result.completed,
        },
      );

      if (result.completed) {
        setStatus(
          `Plan generated in ${result.generation} generations - points ${result.stats.grandTotal.extractedPointCount}, grade ${result.stats.grandTotal.averageW.toFixed(2)}`,
        );
      } else {
        setStatus("Plan generation stopped.");
      }
    } finally {
      if (generateRunIdRef.current === runId) {
        setIsGeneratingPlan(false);
      }
    }
  }, [isGeneratingPlan, selectedRegionKeys, regions, targetTotalPoints, targetGrade]);

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

  const handleToggleInsideDebugPrisms = useCallback((): void => {
    setShowInsideDebugPrisms((prev) => !prev);
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
        targetTotalPoints={targetTotalPoints}
        targetGrade={targetGrade}
        selectedRegionCount={selectedRegionKeys.length}
        isGeneratingPlan={isGeneratingPlan}
        planGenerationProgress={planGenerationProgress}
        onUpdateTargetTotalPoints={handleUpdateTargetTotalPoints}
        onUpdateTargetGrade={handleUpdateTargetGrade}
        onGeneratePlan={handleGeneratePlan}
        onStopGeneratePlan={handleStopGeneratePlan}
        showInsideDebugPrisms={showInsideDebugPrisms}
        insideDebugPrismCount={insideDebugPrismCount}
        onToggleInsideDebugPrisms={handleToggleInsideDebugPrisms}
      />
    </div>
  );
}
