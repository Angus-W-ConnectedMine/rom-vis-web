import { Database } from "bun:sqlite";
import { getPoints, type Point } from "./points";

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

export async function generateTestData() {
  console.log("Generating test data...");
  const points = await getPoints();
  const wValues = generateWValues(points.length);
  const db = new Database(Bun.env.DB_PATH);
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
