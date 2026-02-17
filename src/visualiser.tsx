import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  addPointClouds,
  addSelectionPrism,
  fitCameraToPointCloud,
  getPointsInScreenSelection,
} from "./geometry";
import {
  Overlay,
  type PendingRegionSelection,
  type RegionMeta,
  type SelectionRect,
} from "./overlay";
import type { Point } from "./points";

interface PendingRegionDraft extends PendingRegionSelection {
  min: Point;
  max: Point;
}

interface RegionPrism {
  key: number;
  prism: THREE.Group;
}

const REGION_DEFAULT_COLOR = 0x22d3ee;
const REGION_SELECTED_COLOR = 0xf59e0b;

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

export function Visualiser() {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const pointsRef = useRef<Point[]>([]);
  const pointOffsetRef = useRef<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 0 });
  const regionPrismsRef = useRef<RegionPrism[]>([]);
  const pendingPrismRef = useRef<THREE.Group | null>(null);
  const regionKeyRef = useRef(1);
  const [regions, setRegions] = useState<RegionMeta[]>([]);
  const [selectedRegionKey, setSelectedRegionKey] = useState<number | null>(null);
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const [pendingSelection, setPendingSelection] = useState<PendingRegionDraft | null>(null);
  const [status, setStatus] = useState("Loading points...");
  const [interactionElement, setInteractionElement] = useState<HTMLCanvasElement | null>(null);

  const latestRegion = useMemo(() => {
    if (regions.length === 0) {
      return null;
    }
    return regions[regions.length - 1] as RegionMeta;
  }, [regions]);

  const selectionRectRef = useRef<SelectionRect | null>(null);
  const pendingSelectionRef = useRef<PendingRegionDraft | null>(null);

  useEffect(() => {
    selectionRectRef.current = selectionRect;
  }, [selectionRect]);

  useEffect(() => {
    pendingSelectionRef.current = pendingSelection;
  }, [pendingSelection]);

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

    const findRegionKeyFromObject = (object: THREE.Object3D): number | null => {
      let current: THREE.Object3D | null = object;
      while (current) {
        const key = current.userData.regionKey;
        if (typeof key === "number") {
          return key;
        }
        current = current.parent;
      }
      return null;
    };

    const onSceneClick = (event: MouseEvent): void => {
      if (pendingSelectionRef.current || selectionRectRef.current) {
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

      setSelectedRegionKey(key);
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
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();

      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
      pointsRef.current = [];
      pointOffsetRef.current = { x: 0, y: 0, z: 0 };
      pendingPrismRef.current = null;
      setPendingSelection(null);
      setSelectedRegionKey(null);
      setInteractionElement(null);
    };
  }, []);

  const handleSelectionActiveChange = useCallback((active: boolean): void => {
    const controls = controlsRef.current;
    if (!controls) {
      return;
    }
    controls.enabled = !active;
  }, []);

  const handleSelectionComplete = useCallback((rect: SelectionRect): void => {
    if (pendingSelection) {
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

    pendingPrismRef.current = prism;
    const region = getRegionStats(selectedPoints);
    const pointOffset = pointOffsetRef.current;
    const suggestedId = `region-${regionKeyRef.current}`;

    setPendingSelection({
      suggestedId,
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
    });

    setStatus("Review region stats and set an ID, or cancel.");
  }, [pendingSelection]);

  const handleConfirmSelection = useCallback((regionId: string): void => {
    const pendingPrism = pendingPrismRef.current;
    const pending = pendingSelection;

    if (!pendingPrism || !pending) {
      return;
    }

    const key = regionKeyRef.current;
    regionKeyRef.current += 1;
    pendingPrism.userData.regionKey = key;
    pendingPrism.traverse((node) => {
      node.userData.regionKey = key;
    });
    regionPrismsRef.current.push({ key, prism: pendingPrism });
    pendingPrismRef.current = null;

    setRegions((prev) => [
      ...prev,
      {
        key,
        regionId,
        pointCount: pending.pointCount,
        minW: pending.minW,
        maxW: pending.maxW,
        avgW: pending.avgW,
        min: pending.min,
        max: pending.max,
      },
    ]);
    setSelectedRegionKey(key);
    setPendingSelection(null);
    setStatus("Region saved.");
  }, [pendingSelection]);

  const handleCancelSelection = useCallback((): void => {
    const scene = sceneRef.current;
    const pendingPrism = pendingPrismRef.current;

    if (scene && pendingPrism) {
      scene.remove(pendingPrism);
    }
    pendingPrismRef.current = null;
    setPendingSelection(null);
    setStatus("Region selection cancelled.");
  }, []);

  const applyRegionSelectionVisuals = useCallback((selectedKey: number | null): void => {
    for (const regionPrism of regionPrismsRef.current) {
      const isSelected = selectedKey !== null && regionPrism.key === selectedKey;
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

  const handleSelectRegion = useCallback((key: number): void => {
    setSelectedRegionKey(key);
  }, []);

  useEffect(() => {
    applyRegionSelectionVisuals(selectedRegionKey);
  }, [selectedRegionKey, applyRegionSelectionVisuals, regions.length]);

  const handleDeleteRegion = useCallback((key: number): void => {
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
    setRegions((prev) => prev.filter((region) => region.key !== key));
    setSelectedRegionKey((prev) => (prev === key ? null : prev));
  }, []);

  const handleClearRegions = useCallback((): void => {
    const scene = sceneRef.current;
    if (!scene) {
      return;
    }

    for (const regionPrism of regionPrismsRef.current) {
      scene.remove(regionPrism.prism);
    }
    regionPrismsRef.current = [];
    setRegions([]);
    setSelectedRegionKey(null);
  }, []);

  return (
    <div className="visualiser-root">
      <div ref={viewportRef} className="visualiser-viewport" />
      <Overlay
        interactionElement={interactionElement}
        selectionRect={selectionRect}
        selectionEnabled={!pendingSelection}
        onSelectionRectChange={setSelectionRect}
        onSelectionActiveChange={handleSelectionActiveChange}
        onSelectionComplete={handleSelectionComplete}
        pendingSelection={pendingSelection}
        onConfirmSelection={handleConfirmSelection}
        onCancelSelection={handleCancelSelection}
        status={status}
        regions={regions}
        latestRegion={latestRegion}
        selectedRegionKey={selectedRegionKey}
        onSelectRegion={handleSelectRegion}
        onDeleteRegion={handleDeleteRegion}
        onClearRegions={handleClearRegions}
      />
    </div>
  );
}
