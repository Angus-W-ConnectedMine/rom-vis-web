import { describe, expect, test } from "bun:test";
import type { Point } from "./points";
import type { PlanRegionPrism } from "./planStats";
import { getAllowedAnglesByRegionKey } from "./planGenerator";

function makeRectPrism(
  key: string,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): PlanRegionPrism {
  return {
    key,
    snapshot: {
      minZ: 0,
      maxZ: 10,
      footprint: [
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: maxX, y: maxY },
        { x: minX, y: maxY },
      ],
    },
  };
}

function gridPoints(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  step: number,
): Point[] {
  const points: Point[] = [];
  for (let x = minX; x <= maxX; x += step) {
    for (let y = minY; y <= maxY; y += step) {
      points.push({ x, y, z: 5, w: 1 });
    }
  }
  return points;
}

describe("plan angle validity", () => {
  test("marks all angles invalid when cloud fully covers the prism footprint", () => {
    const prism = makeRectPrism("region-a", -10, -10, 10, 10);
    const points = gridPoints(-10, -10, 10, 10, 1);

    const allowedByRegion = getAllowedAnglesByRegionKey([prism], points);
    const allowed = allowedByRegion.get("region-a");

    expect(allowed).toBeDefined();
    expect(allowed?.size).toBe(0);
  });

  test("keeps at least some angles valid when cloud is compact in the center", () => {
    const prism = makeRectPrism("region-b", -10, -10, 10, 10);
    const points = gridPoints(-2, -2, 2, 2, 1);

    const allowedByRegion = getAllowedAnglesByRegionKey([prism], points);
    const allowed = allowedByRegion.get("region-b");

    expect(allowed).toBeDefined();
    expect((allowed?.size ?? 0) > 0).toBe(true);
  });

  test("treats an angle through the gap between two blobs as valid", () => {
    const prism = makeRectPrism("region-c", -12, -12, 12, 12);
    const leftBlob = gridPoints(-9, -2, -5, 2, 1);
    const rightBlob = gridPoints(5, -2, 9, 2, 1);
    const points = [...leftBlob, ...rightBlob];

    const allowedByRegion = getAllowedAnglesByRegionKey([prism], points);
    const allowed = allowedByRegion.get("region-c");

    expect(allowed).toBeDefined();
    expect(allowed?.has(0)).toBe(true);
  });
});
