import { Database } from "bun:sqlite";
import { DB_PATH } from "./db";

export interface Point {
  x: number;
  y: number;
  z: number;
  w: number;
}

const USE_PROD = Bun.env.USE_PROD === "true" ? true : false;

if (!DB_PATH) {
  throw new Error("Missing DB_PATH environment variable");
}

export async function getPoints(): Promise<Point[]> {
  const db = new Database(DB_PATH, { readonly: true });

  try {
    const points: Point[] = [];

    const query = USE_PROD ?
      "SELECT XYZX as x, XYZY as y, XYZZ as z, 0 as w FROM V_PRODUCTION_EVENT WHERE ObjectTypeID = 'DipperReport'" :
      "SELECT x, y, z, w FROM MockData";

    const rows = db.query(query).all() as Array<{ x: unknown; y: unknown; z: unknown; w: unknown }>;

    for (const row of rows) {
      const x = Number(row.x);
      const y = Number(row.y);
      const z = Number(row.z);
      const w = Number(row.w);

      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        !Number.isFinite(z) ||
        !Number.isFinite(w)
      ) {
        continue;
      }

      if (x === 0 && y === 0 && z === 0) {
        continue;
      }

      points.push({ x, y, z, w });
    }

    return points;
  } finally {
    db.close();
  }
}
