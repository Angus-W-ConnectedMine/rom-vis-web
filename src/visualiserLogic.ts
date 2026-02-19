import * as THREE from "three";
import type { GeneratePlanRequest, GeneratedPlanCandidate } from "./generatePlan";
import { getRegionCenter, type PrismSnapshot } from "./geometry";
import type { PlanItem } from "./OperationPlan";
import type { RegionMeta } from "./overlay";
import type { Point } from "./points";

export const REGION_LABEL_Z_OFFSET = 1.5;

export interface RegionPrismForGeneration {
  key: string;
  validStartAngles: boolean[];
}

export interface WorkerErrorLike {
  type?: unknown;
  message?: unknown;
  filename?: unknown;
  lineno?: unknown;
  colno?: unknown;
  error?: unknown;
}

export function formatWorkerError(event: WorkerErrorLike): string {
  const details: string[] = [];

  if (typeof event.message === "string" && event.message.length > 0) {
    details.push(event.message);
  }

  if (typeof event.filename === "string" && event.filename.length > 0) {
    const line = Number.isFinite(event.lineno) ? Number(event.lineno) : 0;
    const column = Number.isFinite(event.colno) ? Number(event.colno) : 0;
    details.push(`${event.filename}:${line}:${column}`);
  }

  if (details.length > 0) {
    return details.join(" @ ");
  }

  if (event.error instanceof Error && event.error.message.length > 0) {
    return event.error.message;
  }

  if (typeof event.type === "string" && event.type.length > 0) {
    return `event type: ${event.type}`;
  }

  return "unknown worker error";
}

export function candidateToPlanItems(candidate: GeneratedPlanCandidate): PlanItem[] {
  return candidate.items
    .filter((item) => item.quantity > 0)
    .map((item, index) => ({
      id: `ga-preview-${item.regionKey}-${index}`,
      regionKey: item.regionKey,
      angle: item.angle,
      quantity: item.quantity,
    }));
}

export function materializeGeneratedPlan(
  candidate: GeneratedPlanCandidate,
  regionKeys: Set<string>,
  idFactory: () => string,
): PlanItem[] {
  return candidateToPlanItems(candidate)
    .filter((item) => regionKeys.has(item.regionKey))
    .map((item) => ({
      ...item,
      id: idFactory(),
    }));
}

export function shouldUpdatePreview(
  lastUpdatedAt: number,
  now: number,
  intervalMs: number,
): boolean {
  return (now - lastUpdatedAt) >= intervalMs;
}

export function getPreviewPlanForRegions(
  candidate: GeneratedPlanCandidate,
  regions: RegionMeta[],
): PlanItem[] {
  return filterPlanByRegionKeys(candidateToPlanItems(candidate), getRegionKeys(regions));
}

export function resolveGenerationDone(
  candidate: GeneratedPlanCandidate,
  cancelled: boolean,
  regions: RegionMeta[],
  idFactory: () => string,
): { status: string; plan: PlanItem[] | null } {
  if (cancelled) {
    return {
      status: "Plan generation stopped.",
      plan: null,
    };
  }

  return {
    status: "Plan generation complete.",
    plan: materializeGeneratedPlan(candidate, getRegionKeys(regions), idFactory),
  };
}

export function normalizePlanAngle(angle: number): number {
  return Number.isFinite(angle)
    ? THREE.MathUtils.clamp(Math.round(angle), 0, 360)
    : 0;
}

export function normalizePlanQuantity(quantity: number): number {
  return Number.isFinite(quantity)
    ? Math.max(0, Math.round(quantity))
    : 0;
}

export function normalizeTargetPointCount(value: number): number {
  return Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : 0;
}

export function normalizeTargetAverageW(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export function toggleSelectedRegionKey(previousKeys: string[], key: string): string[] {
  return previousKeys.includes(key)
    ? previousKeys.filter((value) => value !== key)
    : [...previousKeys, key];
}

export function filterPlanByRegionKeys(plan: PlanItem[], regionKeys: Set<string>): PlanItem[] {
  return plan.filter((item) => regionKeys.has(item.regionKey));
}

export function getRegionKeys(regions: RegionMeta[]): Set<string> {
  return new Set(regions.map((region) => region.key));
}

export function createDefaultPlanItem(region: RegionMeta, idFactory: () => string): PlanItem {
  return {
    id: idFactory(),
    regionKey: region.key,
    angle: 0,
    quantity: Math.max(0, Math.min(region.pointCount, 100)),
  };
}

export function buildGeneratePlanRequest(
  regions: RegionMeta[],
  regionPrisms: RegionPrismForGeneration[],
  targetPointCount: number,
  targetAverageW: number,
): GeneratePlanRequest | null {
  const prismByKey = new Map(regionPrisms.map((regionPrism) => [regionPrism.key, regionPrism]));

  const requestRegions = regions
    .map((region) => {
      const prism = prismByKey.get(region.key);
      if (!prism) {
        return null;
      }

      return {
        key: region.key,
        maxQuantity: Math.max(0, Math.round(region.pointCount)),
        averageW: region.avgW,
        validStartAngles: prism.validStartAngles,
      };
    })
    .filter((region): region is NonNullable<typeof region> => region !== null);

  if (requestRegions.length === 0) {
    return null;
  }

  return {
    regions: requestRegions,
    targetPointCount: normalizeTargetPointCount(targetPointCount),
    targetAverageW: normalizeTargetAverageW(targetAverageW),
    populationSize: 140,
    maxGenerations: 3500,
    reportEveryGenerations: 10,
    mutationRate: 0.14,
    eliteCount: 8,
    stallGenerations: 700,
  };
}

export function getRegionLabelPosition(snapshot: PrismSnapshot): THREE.Vector3 {
  const center = getRegionCenter(snapshot);
  return new THREE.Vector3(center.x, center.y, snapshot.maxZ + REGION_LABEL_Z_OFFSET);
}

export function getRegionStats(points: Point[]): { min: Point; max: Point; avgW: number } {
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

export function getRegionMetaFromSelection(
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
