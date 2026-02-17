import type { Point, ValuePoint } from "./points";

const MIN_W = 0.5;
const MAX_W = 10.0;
const Q1_W = 1.0;
const Q3_W = 2.0;

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    const temp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = temp;
  }
  return arr;
}

function generateWValues(count: number): number[] {
  const values: number[] = [];

  const q1Count = Math.floor(count * 0.25);
  const q3Count = Math.floor(count * 0.75);

  for (let i = 0; i < count; i++) {
    if (i < q1Count) {
      values.push(rand(MIN_W, Q1_W));
    } else if (i < q3Count) {
      values.push(rand(Q1_W, Q3_W));
    } else {
      values.push(rand(Q3_W, MAX_W));
    }
  }

  return shuffle(values);
}

export function generateXYZW(points: Point[]): ValuePoint[] {
  const wValues = generateWValues(points.length);

  return points.map((point, i) => ({
    ...point,
    w: wValues[i] ?? 0,
  }));
}
