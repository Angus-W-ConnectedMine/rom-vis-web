import { Database } from "bun:sqlite";
import { getPoints, type Point } from "./points";
import { DB_PATH } from "./db";

const MIN_W = 0.5;
const MAX_W = 10.0;
const Q1_W = 1.0;
const Q3_W = 2.0;

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function generateWValues(count: number): Float64Array {
  const values = new Float64Array(count);

  const q1Count = Math.floor(count * 0.25);
  const q3Count = Math.floor(count * 0.75);

  for (let i = 0; i < count; i++) {
    if (i < q1Count) {
      values[i] = rand(MIN_W, Q1_W);
    } else if (i < q3Count) {
      values[i] = rand(Q1_W, Q3_W);
    } else {
      values[i] = rand(Q3_W, MAX_W);
    }
  }

  // Shuffle
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    const temp = values[i]!;
    values[i] = values[j]!;
    values[j] = temp;
  }

  return values;
}

function addHigherValueRegions(points: Point[], values: Float64Array): void {
  const NUM_REGIONS = 12;
  const VALUE_CHANGE = 2;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    if (!point) continue;

    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.z < minZ) minZ = point.z;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
    if (point.z > maxZ) maxZ = point.z;
  }

  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const spanZ = maxZ - minZ;
  const maxSpan = Math.max(spanX, spanY, spanZ);
  const minRadius = maxSpan * 0.03;
  const maxRadius = maxSpan * 0.08;

  for (let regionIndex = 0; regionIndex < NUM_REGIONS; regionIndex += 1) {
    const center = points[Math.floor(Math.random() * points.length)];
    if (!center) continue;

    const radius = rand(minRadius, maxRadius);
    const radiusSq = radius * radius;

    for (let i = 0; i < points.length; i += 1) {
      const point = points[i];
      if (!point) continue;

      const dx = point.x - center.x;
      const dy = point.y - center.y;
      const dz = point.z - center.z;
      const distanceSq = dx * dx + dy * dy + dz * dz;

      if (distanceSq <= radiusSq) {
        const currentValue = values[i];
        if (currentValue === undefined) continue;

        values[i] = currentValue + VALUE_CHANGE;
      }
    }
  }
}

export async function generateTestData() {
  console.log("Generating test data...");
  const points = await getPoints();
  const wValues = generateWValues(points.length);
  addHigherValueRegions(points, wValues);
  const db = new Database(DB_PATH);
  const tableName = "MockData";
  db.run(`DROP TABLE IF EXISTS ${tableName}`);

  db.run(`
    CREATE TABLE ${tableName} (
      id INTEGER PRIMARY KEY,
      x REAL,
      y REAL,
      z REAL,
      w REAL
    )
  `);

  console.log(`Inserting ${points.length} points into ${tableName}...`);

  const insert = db.prepare(
    `INSERT INTO ${tableName} (x, y, z, w) VALUES (?, ?, ?, ?)`
  );

  const insertMany = db.transaction((data: Point[], values: Float64Array) => {
    for (let i = 0; i < data.length; i += 1) {
      const point = data[i];
      const w = values[i];

      if (!point || !w) continue;

      insert.run(point.x, point.y, point.z, w);
    }
  });

  insertMany(points, wValues);

  db.close();

  console.log("Done")
}
