import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  addPointCloud,
  addSelectionPrism,
  fitCameraToPointCloud,
  getPointsInScreenSelection,
} from "./geometry";
import { Overlay, type RegionMeta, type SelectionRect } from "./overlay";
import type { Point } from "./points";

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

function getRegionMinMax(points: Point[]): { min: Point; max: Point } {
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

  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
  };
}

function getPointCloudOffset(points: Point[]): Point {
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
  const pointOffsetRef = useRef<Point>({ x: 0, y: 0, z: 0 });
  const regionPrismsRef = useRef<THREE.Group[]>([]);
  const regionIdRef = useRef(1);
  const [regions, setRegions] = useState<RegionMeta[]>([]);
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const [status, setStatus] = useState("Loading points...");
  const [interactionElement, setInteractionElement] = useState<HTMLCanvasElement | null>(null);

  const latestRegion = useMemo(() => {
    if (regions.length === 0) {
      return null;
    }
    return regions[regions.length - 1] as RegionMeta;
  }, [regions]);

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

    window.addEventListener("resize", resize);

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
        }));

        pointOffsetRef.current = pointOffset;
        pointsRef.current = renderPoints;
        addPointCloud(scene, renderPoints);
        fitCameraToPointCloud(camera, controls, renderPoints);
        setStatus(
          "Shift + drag to select. Region details panel is a placeholder for now.",
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

      for (const prism of regionPrismsRef.current) {
        scene.remove(prism);
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

    regionPrismsRef.current.push(prism);
    const region = getRegionMinMax(selectedPoints);
    const pointOffset = pointOffsetRef.current;
    const id = regionIdRef.current;
    regionIdRef.current += 1;

    setRegions((prev) => [
      ...prev,
      {
        id,
        pointCount: selectedPoints.length,
        min: {
          x: region.min.x + pointOffset.x,
          y: region.min.y + pointOffset.y,
          z: region.min.z + pointOffset.z,
        },
        max: {
          x: region.max.x + pointOffset.x,
          y: region.max.y + pointOffset.y,
          z: region.max.z + pointOffset.z,
        },
      },
    ]);
  }, []);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <div ref={viewportRef} style={{ width: "100%", height: "100%" }} />
      <Overlay
        interactionElement={interactionElement}
        selectionRect={selectionRect}
        onSelectionRectChange={setSelectionRect}
        onSelectionActiveChange={handleSelectionActiveChange}
        onSelectionComplete={handleSelectionComplete}
        status={status}
        regions={regions}
        latestRegion={latestRegion}
      />
    </div>
  );
}
