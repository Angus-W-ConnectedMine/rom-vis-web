export interface Point {
  x: number;
  y: number;
  z: number;
}

export async function getPoints() {
    const count = 200_000;
    const spread = 160;
    const points = new Array<Point>(count);

    for (let i = 0; i < count; i += 1) {
        points[i] = {
        x: (Math.random() - 0.5) * spread,
        y: (Math.random() - 0.5) * spread,
        z: (Math.random() - 0.5) * spread,
        }
    }

    return points;
}