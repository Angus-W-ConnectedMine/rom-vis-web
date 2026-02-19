import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import {
  getPrismSnapshot,
  addSelectionPrism,
  getPointsInScreenSelection,
  toStoredPrism,
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
  saveStoredPlan,
  saveStoredPrisms,
} from "./storage";
import { computePlanStats, computeValidStartAnglesForRegion } from "./planStats";
import type { GeneratedPlanCandidate } from "./generatePlan";
import { usePlanExtractionVolumes } from "./usePlanExtractionVolumes";
import { useSelectionController } from "./useSelectionController";
import { useVisualiserScene, type RegionPrism } from "./useVisualiserScene";
import {
  buildGeneratePlanRequest,
  candidateToPlanItems,
  createDefaultPlanItem,
  filterPlanByRegionKeys,
  formatWorkerError,
  getRegionKeys,
  getRegionLabelPosition,
  getRegionMetaFromSelection,
  getPreviewPlanForRegions,
  materializeGeneratedPlan,
  normalizePlanAngle,
  normalizePlanQuantity,
  normalizeTargetAverageW,
  normalizeTargetPointCount,
  resolveGenerationDone,
  shouldUpdatePreview,
  toggleSelectedRegionKey,
} from "./visualiserLogic";

const REGION_DEFAULT_COLOR = 0x22d3ee;
const REGION_SELECTED_COLOR = 0xf59e0b;
const GENERATOR_DEFAULT_TARGET_POINTS = 1000;
const GENERATOR_DEFAULT_TARGET_GRADE = 0;
const GENERATOR_PREVIEW_UPDATE_INTERVAL_MS = 250;
const PLAN_WORKER_SCRIPT_PATH = "/generatePlan.worker.js";

type WorkerProgressMessage = {
  type: "progress";
  runId: number;
  generation: number;
  candidate: GeneratedPlanCandidate;
};

type WorkerReadyMessage = {
  type: "ready";
  timestamp: number;
};

type WorkerDoneMessage = {
  type: "done";
  runId: number;
  candidate: GeneratedPlanCandidate;
  cancelled: boolean;
};

type PlanGeneratorWorkerMessage = WorkerReadyMessage | WorkerProgressMessage | WorkerDoneMessage;

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
  const [generationTargetPointCount, setGenerationTargetPointCount] = useState<number>(GENERATOR_DEFAULT_TARGET_POINTS);
  const [generationTargetAverageW, setGenerationTargetAverageW] = useState<number>(GENERATOR_DEFAULT_TARGET_GRADE);
  const [generationRunning, setGenerationRunning] = useState(false);
  const [generationBestCandidate, setGenerationBestCandidate] = useState<GeneratedPlanCandidate | null>(null);
  const [generationBestGeneration, setGenerationBestGeneration] = useState(0);
  const [previewPlan, setPreviewPlan] = useState<PlanItem[] | null>(null);

  const selectionRectRef = useRef<SelectionRect | null>(null);
  const editingRegionKeyRef = useRef<string | null>(null);
  const regionsRef = useRef<RegionMeta[]>([]);
  const planGeneratorWorkerRef = useRef<Worker | null>(null);
  const planGeneratorRunIdRef = useRef(0);
  const lastPreviewUpdateAtRef = useRef(0);
  const displayPlan = previewPlan ?? plan;
  const planStats = useMemo(
    () => computePlanStats(regions, displayPlan, regionPrismsRef.current, pointsRef.current),
    [regions, displayPlan],
  );

  useEffect(() => {
    editingRegionKeyRef.current = editingRegionKey;
  }, [editingRegionKey]);

  useEffect(() => {
    regionsRef.current = regions;
  }, [regions]);

  const initializePlanGeneratorWorker = useCallback((): Worker => {
    const existingWorker = planGeneratorWorkerRef.current;
    if (existingWorker) {
      return existingWorker;
    }

    const worker = new Worker(PLAN_WORKER_SCRIPT_PATH, { type: "module" });
    console.log("[visualiser] plan worker created");
    worker.onerror = (event: ErrorEvent): void => {
      const message = formatWorkerError(event);
      console.error("[visualiser] plan worker error", { message, event });
      setStatus(`Plan worker error: ${message}`);
    };
    worker.onmessageerror = (event: MessageEvent): void => {
      console.error("[visualiser] plan worker message error", event);
      setStatus(`Plan worker message error: ${event.type || "unknown"}`);
    };
    worker.onmessage = (event: MessageEvent<PlanGeneratorWorkerMessage>): void => {
      const message = event.data;
      if (!message) {
        return;
      }

      if (message.type === "ready") {
        console.log("[visualiser] plan worker ready", { timestamp: message.timestamp });
        setStatus("Plan generator ready.");
        return;
      }

      const activeRunId = planGeneratorRunIdRef.current;
      if (message.runId !== activeRunId) {
        return;
      }

      if (message.type === "progress") {
        setGenerationBestCandidate(message.candidate);
        setGenerationBestGeneration(message.generation);
        const now = Date.now();
        if (shouldUpdatePreview(lastPreviewUpdateAtRef.current, now, GENERATOR_PREVIEW_UPDATE_INTERVAL_MS)) {
          lastPreviewUpdateAtRef.current = now;
          setPreviewPlan(getPreviewPlanForRegions(message.candidate, regionsRef.current));
        }
        return;
      }

      if (message.type !== "done") {
        return;
      }

      setGenerationRunning(false);
      setGenerationBestCandidate(message.candidate);
      setPreviewPlan(null);

      const done = resolveGenerationDone(
        message.candidate,
        message.cancelled,
        regionsRef.current,
        () => crypto.randomUUID(),
      );
      if (done.plan) {
        setPlan(done.plan);
        saveStoredPlan(done.plan);
      }
      setStatus(done.status);
    };
    planGeneratorWorkerRef.current = worker;
    return worker;
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch(PLAN_WORKER_SCRIPT_PATH, {
          method: "GET",
          cache: "no-store",
        });
        const contentType = response.headers.get("content-type") ?? "(missing)";
        const statusSummary = `${response.status} ${response.statusText || ""}`.trim();
        const isJavaScriptLike =
          contentType.includes("javascript") ||
          contentType.includes("ecmascript") ||
          contentType.includes("typescript");

        if (!response.ok || !isJavaScriptLike) {
          setStatus(`Plan worker precheck failed: ${statusSummary}; content-type=${contentType}`);
          console.error("[visualiser] plan worker precheck failed", {
            path: PLAN_WORKER_SCRIPT_PATH,
            status: statusSummary,
            contentType,
          });
          return;
        }

        console.log("[visualiser] plan worker precheck ok", {
          path: PLAN_WORKER_SCRIPT_PATH,
          status: statusSummary,
          contentType,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatus(`Plan worker precheck failed: ${message}`);
        console.error("[visualiser] plan worker precheck failed", {
          path: PLAN_WORKER_SCRIPT_PATH,
          message,
        });
      }
    })();

    return () => {
      planGeneratorWorkerRef.current?.terminate();
      planGeneratorWorkerRef.current = null;
    };
  }, []);

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
    regionPrismsRef.current.push({
      key,
      regionId: suggestedId,
      prism,
      snapshot: prismSnapshot,
      label,
      validStartAngles: computeValidStartAnglesForRegion(prismSnapshot, pointsRef.current),
    });
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
      const regionKeys = getRegionKeys(regions);
      const next = filterPlanByRegionKeys(prev, regionKeys);
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
    invalidStartByItemId: planStats.invalidStartByItemId,
  });

  const handleAddRegionToPlan = useCallback((region: RegionMeta): void => {
    setPlan((prev) => {
      const next = [
        ...prev,
        createDefaultPlanItem(region, () => crypto.randomUUID()),
      ];
      saveStoredPlan(next);
      return next;
    });
  }, []);

  const handleUpdatePlanAngle = useCallback((planItemId: string, angle: number): void => {
    const normalized = normalizePlanAngle(angle);
    setPlan((prev) =>
      prev.map((item) => (item.id === planItemId ? { ...item, angle: normalized } : item)),
    );
  }, []);

  const handleDeletePlanItem = useCallback((planItemId: string): void => {
    setPlan((prev) => prev.filter((item) => item.id !== planItemId));
  }, []);

  const handleUpdatePlanQuantity = useCallback((planItemId: string, quantity: number): void => {
    const normalized = normalizePlanQuantity(quantity);
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
      toggleSelectedRegionKey(prev, key),
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

  const handleStartPlanGeneration = useCallback((): void => {
    const worker = initializePlanGeneratorWorker();

    const request = buildGeneratePlanRequest(
      regions,
      regionPrismsRef.current,
      generationTargetPointCount,
      generationTargetAverageW,
    );

    if (!request) {
      setStatus("Add at least one region before generating a plan.");
      return;
    }

    const runId = planGeneratorRunIdRef.current + 1;
    planGeneratorRunIdRef.current = runId;
    setGenerationRunning(true);
    setGenerationBestCandidate(null);
    setGenerationBestGeneration(0);
    setPreviewPlan([]);
    lastPreviewUpdateAtRef.current = 0;
    setStatus("Generating plan...");
    console.log("[visualiser] starting plan generation", { runId, request });

    worker.postMessage({
      type: "start",
      runId,
      request,
    });
  }, [generationTargetAverageW, generationTargetPointCount, initializePlanGeneratorWorker, regions]);

  const handleStopPlanGeneration = useCallback((): void => {
    const worker = planGeneratorWorkerRef.current;
    if (!worker || !generationRunning) {
      return;
    }

    worker.terminate();
    planGeneratorWorkerRef.current = null;
    setGenerationRunning(false);
    setPreviewPlan(null);
    setStatus("Plan generation stopped.");
  }, [generationRunning]);

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
        plan={displayPlan}
        outcomeByItemId={planStats.outcomeByItemId}
        grandTotal={planStats.grandTotal}
        onAddRegionToPlan={handleAddRegionToPlan}
        onUpdatePlanAngle={handleUpdatePlanAngle}
        onUpdatePlanQuantity={handleUpdatePlanQuantity}
        onDeletePlanItem={handleDeletePlanItem}
        generationTargetPointCount={generationTargetPointCount}
        generationTargetAverageW={generationTargetAverageW}
        generationRunning={generationRunning}
        generationBestCandidate={generationBestCandidate}
        generationBestGeneration={generationBestGeneration}
        onUpdateGenerationTargetPointCount={(value) => setGenerationTargetPointCount(normalizeTargetPointCount(value))}
        onUpdateGenerationTargetAverageW={(value) => setGenerationTargetAverageW(normalizeTargetAverageW(value))}
        onStartGeneration={handleStartPlanGeneration}
        onStopGeneration={handleStopPlanGeneration}
      />
    </div>
  );
}
