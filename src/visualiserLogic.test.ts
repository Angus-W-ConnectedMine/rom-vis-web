import { describe, expect, it } from "bun:test";
import type { GeneratedPlanCandidate } from "./generatePlan";
import {
  buildGeneratePlanRequest,
  candidateToPlanItems,
  createDefaultPlanItem,
  filterPlanByRegionKeys,
  formatWorkerError,
  getRegionKeys,
  getRegionLabelPosition,
  getRegionMetaFromSelection,
  getRegionStats,
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

describe("visualiserLogic", () => {
  it("formats worker errors with message and location", () => {
    const message = formatWorkerError({
      message: "boom",
      filename: "worker.js",
      lineno: 12,
      colno: 4,
    });

    expect(message).toBe("boom @ worker.js:12:4");
  });

  it("formats fallback worker errors", () => {
    expect(formatWorkerError({ type: "error" })).toBe("event type: error");
    expect(formatWorkerError({})).toBe("unknown worker error");
  });

  it("converts generated candidates to preview plan items", () => {
    const candidate: GeneratedPlanCandidate = {
      items: [
        { regionKey: "a", angle: 10, quantity: 4 },
        { regionKey: "b", angle: 90, quantity: 0 },
      ],
      totalPoints: 4,
      averageW: 1.2,
      score: 0.2,
    };

    expect(candidateToPlanItems(candidate)).toEqual([
      { id: "ga-preview-a-0", regionKey: "a", angle: 10, quantity: 4 },
    ]);
  });

  it("materializes generated plan with fresh ids and region filtering", () => {
    const candidate: GeneratedPlanCandidate = {
      items: [
        { regionKey: "a", angle: 10, quantity: 4 },
        { regionKey: "b", angle: 20, quantity: 3 },
      ],
      totalPoints: 7,
      averageW: 2,
      score: 1,
    };

    let nextId = 0;
    const plan = materializeGeneratedPlan(candidate, new Set(["b"]), () => `id-${++nextId}`);

    expect(plan).toEqual([
      { id: "id-1", regionKey: "b", angle: 20, quantity: 3 },
    ]);
  });

  it("computes preview update cadence", () => {
    expect(shouldUpdatePreview(1000, 1249, 250)).toBe(false);
    expect(shouldUpdatePreview(1000, 1250, 250)).toBe(true);
  });

  it("builds preview plans from active regions only", () => {
    const candidate: GeneratedPlanCandidate = {
      items: [
        { regionKey: "a", angle: 10, quantity: 4 },
        { regionKey: "b", angle: 20, quantity: 3 },
      ],
      totalPoints: 7,
      averageW: 2,
      score: 1,
    };

    const preview = getPreviewPlanForRegions(candidate, [
      {
        key: "b",
        regionId: "region-b",
        pointCount: 1,
        minW: 0,
        maxW: 0,
        avgW: 0,
        min: { x: 0, y: 0, z: 0, w: 0 },
        max: { x: 0, y: 0, z: 0, w: 0 },
      },
    ]);

    expect(preview).toEqual([
      { id: "ga-preview-b-1", regionKey: "b", angle: 20, quantity: 3 },
    ]);
  });

  it("normalizes plan and target values", () => {
    expect(normalizePlanAngle(361.7)).toBe(360);
    expect(normalizePlanAngle(Number.NaN)).toBe(0);
    expect(normalizePlanQuantity(-2.8)).toBe(0);
    expect(normalizePlanQuantity(3.4)).toBe(3);
    expect(normalizeTargetPointCount(-10.2)).toBe(0);
    expect(normalizeTargetPointCount(18.6)).toBe(19);
    expect(normalizeTargetAverageW(Number.NaN)).toBe(0);
    expect(normalizeTargetAverageW(2.5)).toBe(2.5);
  });

  it("toggles selected keys", () => {
    expect(toggleSelectedRegionKey(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleSelectedRegionKey(["a", "b"], "a")).toEqual(["b"]);
  });

  it("filters plan items by region keys", () => {
    const filtered = filterPlanByRegionKeys([
      { id: "1", regionKey: "a", angle: 0, quantity: 1 },
      { id: "2", regionKey: "b", angle: 0, quantity: 1 },
    ], new Set(["b"]));

    expect(filtered).toEqual([{ id: "2", regionKey: "b", angle: 0, quantity: 1 }]);
  });

  it("creates default plan items with bounded quantity", () => {
    const item = createDefaultPlanItem({
      key: "r1",
      regionId: "region-1",
      pointCount: 180,
      minW: 0,
      maxW: 0,
      avgW: 0,
      min: { x: 0, y: 0, z: 0, w: 0 },
      max: { x: 0, y: 0, z: 0, w: 0 },
    }, () => "new-id");

    expect(item).toEqual({
      id: "new-id",
      regionKey: "r1",
      angle: 0,
      quantity: 100,
    });
  });

  it("builds generation request from regions and prisms", () => {
    const regions = [{
      key: "r1",
      regionId: "region-1",
      pointCount: 23.6,
      minW: 0,
      maxW: 0,
      avgW: 2.3,
      min: { x: 0, y: 0, z: 0, w: 0 },
      max: { x: 0, y: 0, z: 0, w: 0 },
    }];

    const request = buildGeneratePlanRequest(
      regions,
      [{ key: "r1", validStartAngles: new Array<boolean>(360).fill(true) }],
      120.2,
      Number.NaN,
    );

    expect(request).not.toBeNull();
    expect(request!.regions).toHaveLength(1);
    expect(request!.regions[0]).toEqual({
      key: "r1",
      maxQuantity: 24,
      averageW: 2.3,
      validStartAngles: new Array<boolean>(360).fill(true),
    });
    expect(request!.targetPointCount).toBe(120);
    expect(request!.targetAverageW).toBe(0);
    expect(request!.populationSize).toBe(140);
  });

  it("returns null generation request when no region has a prism", () => {
    const request = buildGeneratePlanRequest([
      {
        key: "r1",
        regionId: "region-1",
        pointCount: 10,
        minW: 0,
        maxW: 0,
        avgW: 1,
        min: { x: 0, y: 0, z: 0, w: 0 },
        max: { x: 0, y: 0, z: 0, w: 0 },
      },
    ], [], 10, 1);

    expect(request).toBeNull();
  });

  it("resolves generation completion state", () => {
    const candidate: GeneratedPlanCandidate = {
      items: [{ regionKey: "a", angle: 30, quantity: 2 }],
      totalPoints: 2,
      averageW: 1.5,
      score: 0.2,
    };

    const regions = [{
      key: "a",
      regionId: "region-a",
      pointCount: 1,
      minW: 0,
      maxW: 0,
      avgW: 0,
      min: { x: 0, y: 0, z: 0, w: 0 },
      max: { x: 0, y: 0, z: 0, w: 0 },
    }];

    const runningDone = resolveGenerationDone(candidate, false, regions, () => "id-1");
    expect(runningDone.status).toBe("Plan generation complete.");
    expect(runningDone.plan).toEqual([{ id: "id-1", regionKey: "a", angle: 30, quantity: 2 }]);

    const cancelledDone = resolveGenerationDone(candidate, true, regions, () => "id-2");
    expect(cancelledDone.status).toBe("Plan generation stopped.");
    expect(cancelledDone.plan).toBeNull();
  });

  it("computes region keys, region stats and derived region meta", () => {
    const regions = [
      {
        key: "a",
        regionId: "region-a",
        pointCount: 1,
        minW: 0,
        maxW: 0,
        avgW: 0,
        min: { x: 0, y: 0, z: 0, w: 0 },
        max: { x: 0, y: 0, z: 0, w: 0 },
      },
      {
        key: "b",
        regionId: "region-b",
        pointCount: 1,
        minW: 0,
        maxW: 0,
        avgW: 0,
        min: { x: 0, y: 0, z: 0, w: 0 },
        max: { x: 0, y: 0, z: 0, w: 0 },
      },
    ];
    expect(getRegionKeys(regions)).toEqual(new Set(["a", "b"]));

    const points = [
      { x: -1, y: 2, z: 0, w: 2 },
      { x: 3, y: -2, z: 4, w: 8 },
    ];

    const stats = getRegionStats(points);
    expect(stats.min).toEqual({ x: -1, y: -2, z: 0, w: 2 });
    expect(stats.max).toEqual({ x: 3, y: 2, z: 4, w: 8 });
    expect(stats.avgW).toBe(5);

    const snapshot = {
      minZ: -2,
      maxZ: 6,
      footprint: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 2 },
      ],
    };

    const meta = getRegionMetaFromSelection("k1", "region", snapshot, points, { x: 10, y: 20, z: 30 });
    expect(meta.pointCount).toBe(2);
    expect(meta.min).toEqual({ x: 9, y: 18, z: 30, w: 2 });
    expect(meta.max).toEqual({ x: 13, y: 22, z: 34, w: 8 });

    const emptyMeta = getRegionMetaFromSelection("k2", "region", snapshot, [], { x: 1, y: 2, z: 3 });
    expect(emptyMeta.pointCount).toBe(0);
    expect(emptyMeta.min).toEqual({ x: 1, y: 2, z: 1, w: 0 });
    expect(emptyMeta.max).toEqual({ x: 3, y: 4, z: 9, w: 0 });
  });

  it("computes region label position above prism", () => {
    const position = getRegionLabelPosition({
      minZ: 0,
      maxZ: 5,
      footprint: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 2 },
        { x: 0, y: 2 },
      ],
    });

    expect(position.x).toBe(1);
    expect(position.y).toBe(1);
    expect(position.z).toBe(6.5);
  });
});
