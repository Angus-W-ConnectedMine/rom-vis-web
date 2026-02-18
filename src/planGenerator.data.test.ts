import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import type { Point } from "./points";
import type { PlanRegionPrism } from "./planStats";
import { getAllowedAnglesByRegionKey } from "./planGenerator";

function loadPointsFromDbInRenderSpace(path: string): Point[] {
  const db = new Database(path, { readonly: true });
  try {
    const rows = db.query("SELECT x, y, z, w FROM MockData").all() as Array<{
      x: number;
      y: number;
      z: number;
      w: number;
    }>;

    let sumX = 0;
    let sumY = 0;
    let sumZ = 0;
    const numericRows = rows
      .map((row) => ({
        x: Number(row.x),
        y: Number(row.y),
        z: Number(row.z),
        w: Number(row.w),
      }))
      .filter((point) =>
        Number.isFinite(point.x) &&
        Number.isFinite(point.y) &&
        Number.isFinite(point.z) &&
        Number.isFinite(point.w),
      );

    for (const point of numericRows) {
      sumX += point.x;
      sumY += point.y;
      sumZ += point.z;
    }

    const count = Math.max(1, numericRows.length);
    const offset = { x: sumX / count, y: sumY / count, z: sumZ / count };

    return numericRows.map((point) => ({
      x: point.x - offset.x,
      y: point.y - offset.y,
      z: point.z - offset.z,
      w: point.w,
    }));
  } finally {
    db.close();
  }
}

describe("plan angle validity against data.db", () => {
  test("checks a fixed region+angle in repo data", () => {
    const points = loadPointsFromDbInRenderSpace("./data/data.db");
    expect(points.length > 0).toBe(true);

    const minX = 542920;
    const minY = 3827600;
    const maxX = 543050;
    const maxY = 3827750;
    const minZ = 1159;
    const maxZ = 1182;
    const angle = 0;

    const prism: PlanRegionPrism = {
      key: "db-region",
      snapshot: {
        minZ,
        maxZ,
        footprint: [
          { x: minX, y: minY },
          { x: maxX, y: minY },
          { x: maxX, y: maxY },
          { x: minX, y: maxY },
        ],
      },
    };

    const allowed = getAllowedAnglesByRegionKey([prism], points).get("db-region");
    expect(allowed).toBeDefined();

    const normalizedAngle = ((Math.round(angle) % 360) + 360) % 360;
    const isValid = allowed?.has(normalizedAngle) ?? false;
    const invalidCount = 360 - (allowed?.size ?? 0);
    console.log(`db angle check: validCount=${allowed?.size ?? 0} invalidCount=${invalidCount} angle=${normalizedAngle} isValid=${isValid}`);

    expect(isValid).toBe(true);
  });

  test("uses provided prism and expected angle validity", () => {
    const points = loadPointsFromDbInRenderSpace("./data/data.db");
    expect(points.length > 0).toBe(true);

    const prism: PlanRegionPrism = {
      key: "90ba0334-7d8f-4b4e-ab81-8213cd58ca71",
      snapshot: {
        minZ: 1.2546848191095705,
        maxZ: 3.9246848191096433,
        footprint: [
          { x: 27.891839795862325, y: -15.260792620945722 },
          { x: 28.461839795927517, y: -16.890792620833963 },
          { x: 37.00183979596477, y: -26.260792620945722 },
          { x: 38.8618397959508, y: -27.490792620927095 },
          { x: 42.05183979589492, y: -25.420792621094733 },
          { x: 44.531839795876294, y: -22.69079262111336 },
          { x: 47.341839795932174, y: -19.210792621131986 },
          { x: 51.66183979588095, y: -13.670792621094733 },
          { x: 43.49183979595546, y: -7.310792620759457 },
          { x: 39.83183979592286, y: -4.630792621057481 },
          { x: 37.201839795918204, y: -5.090792621020228 },
          { x: 35.481839795946144, y: -6.7007926208898425 },
          { x: 30.311839795904234, y: -11.94079262111336 },
          { x: 29.97183979593683, y: -12.340792621020228 },
        ],
      },
    };

    const allowed = getAllowedAnglesByRegionKey([prism], points).get(prism.key);
    expect(allowed).toBeDefined();

    // Expected from manual UI verification.
    expect(allowed?.has(19)).toBe(false);
    expect(allowed?.has(329)).toBe(false);
    expect(allowed?.has(211)).toBe(true);
  });
});
