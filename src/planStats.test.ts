import { describe, expect, it } from "bun:test";
import type { PrismSnapshot } from "./geometry";
import { createExtractionSnapshot, computePlanStats, computeValidStartAnglesForRegion, getNormalizedAngleIndex } from "./planStats";
import type { Point } from "./points";
import type { PlanItem } from "./OperationPlan";

function createSquareSnapshot(min: number, max: number): PrismSnapshot {
  return {
    minZ: -1,
    maxZ: 1,
    footprint: [
      { x: min, y: min },
      { x: max, y: min },
      { x: max, y: max },
      { x: min, y: max },
    ],
  };
}

describe("getNormalizedAngleIndex", () => {
  it("normalizes negative and overflow angles", () => {
    expect(getNormalizedAngleIndex(-1)).toBe(359);
    expect(getNormalizedAngleIndex(360)).toBe(0);
    expect(getNormalizedAngleIndex(721)).toBe(1);
  });
});

describe("computeValidStartAnglesForRegion", () => {
  it("marks all angles valid when no points are near start positions", () => {
    const snapshot = createSquareSnapshot(-1, 1);
    const valid = computeValidStartAnglesForRegion(snapshot, [], {
      startOffsetFromRegionEdge: 0,
      startClearanceRadius: 0.1,
    });

    expect(valid).toHaveLength(360);
    expect(valid.every(Boolean)).toBe(true);
  });

  it("marks an angle invalid when the start point is blocked", () => {
    const snapshot = createSquareSnapshot(-1, 1);
    const blockingPoints: Point[] = [{ x: 1, y: 0, z: 0, w: 1 }];

    const valid = computeValidStartAnglesForRegion(snapshot, blockingPoints, {
      startOffsetFromRegionEdge: 0,
      startClearanceRadius: 0.01,
    });

    expect(valid[0]).toBe(false);
  });
});

describe("createExtractionSnapshot", () => {
  it("clips region footprint to extraction half-plane", () => {
    const snapshot = createSquareSnapshot(-1, 1);
    const takenPoints: Point[] = [
      { x: 0.2, y: 0, z: 0, w: 2 },
      { x: 0.8, y: 0.2, z: 0, w: 3 },
    ];

    const extraction = createExtractionSnapshot(snapshot, 0, takenPoints);

    expect(extraction).not.toBeNull();
    expect(extraction!.footprint.length).toBeGreaterThanOrEqual(3);
    for (const vertex of extraction!.footprint) {
      expect(vertex.x).toBeGreaterThanOrEqual(0.2 - 1e-9);
    }
  });
});

describe("computePlanStats", () => {
  it("computes outcomes, totals, extracted points, and invalid starts", () => {
    const snapshot = createSquareSnapshot(-2, 2);

    const regions = [{
      key: "r1",
      regionId: "region-1",
      pointCount: 3,
      minW: 2,
      maxW: 10,
      avgW: 6,
      min: { x: -1, y: -1, z: 0, w: 2 },
      max: { x: 1, y: 1, z: 0, w: 10 },
    }];

    const plan: PlanItem[] = [
      { id: "p1", regionKey: "r1", angle: 0, quantity: 2 },
      { id: "p2", regionKey: "r1", angle: 180, quantity: 2 },
    ];

    const points: Point[] = [
      { x: 1, y: 0, z: 0, w: 10 },
      { x: 0, y: 0, z: 0, w: 6 },
      { x: -1, y: 0, z: 0, w: 2 },
    ];

    const validStartAngles = new Array<boolean>(360).fill(true);
    validStartAngles[180] = false;

    const stats = computePlanStats(regions, plan, [{
      key: "r1",
      snapshot,
      validStartAngles,
    }], points);

    expect(stats.outcomeByItemId.p1.extractedPointCount).toBe(2);
    expect(stats.outcomeByItemId.p1.extractedAverageW).toBe(8);
    expect(stats.outcomeByItemId.p2.extractedPointCount).toBe(1);
    expect(stats.outcomeByItemId.p2.extractedAverageW).toBe(2);

    expect(stats.grandTotal.extractedPointCount).toBe(3);
    expect(stats.grandTotal.averageW).toBe(6);

    expect(stats.extractedPointsByItemId.p1).toHaveLength(2);
    expect(stats.extractedPointsByItemId.p2).toHaveLength(1);
    expect(stats.invalidStartByItemId.p1).toBe(false);
    expect(stats.invalidStartByItemId.p2).toBe(true);
  });
});
