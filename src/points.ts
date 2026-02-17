import { Database } from "bun:sqlite";

export interface Point {
  x: number;
  y: number;
  z: number;
}

export interface ValuePoint extends Point {
  w: number;
};

const DB_PATH = Bun.env.DB_PATH;

if (!DB_PATH) {
  throw new Error("Missing DB_PATH environment variable");
}

export async function getPoints(): Promise<Point[]> {
  const db = new Database(DB_PATH, { readonly: true });

  try {
    const rows = db.query("SELECT XYZX as x, XYZY as y, XYZZ as z FROM V_PRODUCTION_EVENT WHERE ObjectTypeID = ?").all("DipperReport") as Array<{ x: unknown; y: unknown; z: unknown }>;

    const points: Point[] = [];

    for (const row of rows) {
      const x = Number(row.x);
      const y = Number(row.y);
      const z = Number(row.z);

      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        continue;
      }

      if (x === 0 && y === 0 && z === 0) {
        continue;
      }

      points.push({ x, y, z });
    }

    return points;
  } finally {
    db.close();
  }
}
