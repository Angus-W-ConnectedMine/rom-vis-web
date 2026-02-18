import * as THREE from "three";
import { getPointsInPrism, getRegionCenter, type PrismSnapshot } from "./geometry";
import type { PlanGrandTotal, PlanItem, PlanOutcomeItem } from "./OperationPlan";
import type { RegionMeta } from "./overlay";
import type { Point } from "./points";

export interface PlanStats {
  outcomeByItemId: Record<string, PlanOutcomeItem>;
  grandTotal: PlanGrandTotal;
  extractedPointsByItemId: Record<string, Point[]>;
}

export interface PlanRegionPrism {
  key: string;
  snapshot: PrismSnapshot;
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

export function createExtractionSnapshot(
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

export function computePlanStats(
  regions: RegionMeta[],
  plan: PlanItem[],
  regionPrisms: PlanRegionPrism[],
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
