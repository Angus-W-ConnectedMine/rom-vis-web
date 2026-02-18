import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import type { Point } from "./points";
import type { PlanRegionPrism } from "./planStats";
import { getAllowedAnglesByRegionKey } from "./planGenerator";

function loadPointsFromDb(path: string): Point[] {
  const db = new Database(path, { readonly: true });
  try {
    const rows = db.query("SELECT x, y, z, w FROM MockData").all() as Array<{
      x: number;
      y: number;
      z: number;
      w: number;
    }>;

    return rows
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
  } finally {
    db.close();
  }
}

describe("plan angle validity against data.db", () => {
  test("checks a fixed region+angle in repo data", () => {
    const points = loadPointsFromDb("./data/data.db");
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
});
