import { useEffect } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DRenderer, type CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import {
  addPointClouds,
  fitCameraToPointCloud,
  fromStoredPrism,
  getPointsInPrism,
  type PrismSnapshot,
  restorePrism,
} from "./geometry";
import type { PlanItem } from "./OperationPlan";
import type { RegionMeta, SelectionRect } from "./overlay";
import { computeValidStartAnglesForRegion } from "./planStats";
import type { Point } from "./points";
import { loadStoredPrisms } from "./storage";

export interface RegionPrism {
  key: string;
  regionId: string;
  prism: THREE.Group;
  snapshot: PrismSnapshot;
  label: CSS2DObject;
  validStartAngles: boolean[];
}

interface UseVisualiserSceneArgs {
  viewportRef: React.RefObject<HTMLDivElement | null>;
  selectionRectRef: React.RefObject<SelectionRect | null>;
  editingRegionKeyRef: React.RefObject<string | null>;
  sceneRef: React.RefObject<THREE.Scene | null>;
  cameraRef: React.RefObject<THREE.PerspectiveCamera | null>;
  rendererRef: React.RefObject<THREE.WebGLRenderer | null>;
  labelRendererRef: React.RefObject<CSS2DRenderer | null>;
  controlsRef: React.RefObject<OrbitControls | null>;
  pointsRef: React.RefObject<Point[]>;
  pointOffsetRef: React.RefObject<{ x: number; y: number; z: number }>;
  regionPrismsRef: React.RefObject<RegionPrism[]>;
  planExtractionVolumesRef: React.RefObject<Map<string, THREE.Group>>;
  setInteractionElement: (element: HTMLCanvasElement | null) => void;
  setRegions: (updater: (prev: RegionMeta[]) => RegionMeta[]) => void;
  setRegionsHydrated: (value: boolean) => void;
  setStatus: (value: string) => void;
  setSelectedRegionKeys: (updater: (prev: string[]) => string[]) => void;
  setPlan: (updater: (prev: PlanItem[]) => PlanItem[]) => void;
  setEditingRegionKey: (value: string | null) => void;
  createRegionLabel: (regionId: string) => CSS2DObject;
  getRegionLabelPosition: (snapshot: PrismSnapshot) => THREE.Vector3;
  getRegionMetaFromSelection: (
    key: string,
    regionId: string,
    snapshot: PrismSnapshot,
    selectedPoints: Point[],
    pointOffset: { x: number; y: number; z: number },
  ) => RegionMeta;
}

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

function addLights(scene: THREE.Scene): void {
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const directional = new THREE.DirectionalLight(0xffffff, 1.2);
  directional.position.set(6, 8, 10);
  scene.add(directional);
}

async function fetchPoints(): Promise<Point[]> {
  const response = await fetch("/points");
  if (!response.ok) {
    throw new Error(`Failed to load points: ${response.status}`);
  }
  return (await response.json()) as Point[];
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

export function useVisualiserScene({
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
}: UseVisualiserSceneArgs): void {
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
        const sourcePoints = await fetchPoints();
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
            restoredRegionPrisms.push({
              key,
              regionId,
              prism,
              snapshot,
              label,
              validStartAngles: computeValidStartAnglesForRegion(snapshot, renderPoints),
            });
            restoredRegions.push(
              getRegionMetaFromSelection(key, regionId, snapshot, selectedPoints, pointOffset),
            );
          }

          regionPrismsRef.current = restoredRegionPrisms;
          setRegions(() => restoredRegions);
        } else {
          setRegions(() => []);
        }
        setRegionsHydrated(true);

        fitCameraToPointCloud(camera, controls, renderPoints);
        setStatus("Shift + drag to select");
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
      setSelectedRegionKeys(() => []);
      setPlan(() => []);
      setRegionsHydrated(false);
      setEditingRegionKey(null);
      setInteractionElement(null);
    };
  }, [
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
  ]);
}
