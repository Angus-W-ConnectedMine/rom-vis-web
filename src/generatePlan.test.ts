import { describe, expect, it } from "bun:test";
import { generatePlan, type GeneratePlanRequest } from "./generatePlan";

function createValidAngles(allowed: number[]): boolean[] {
  const flags = new Array<boolean>(360).fill(false);
  for (const angle of allowed) {
    flags[angle] = true;
  }
  return flags;
}

describe("generatePlan", () => {
  it("returns empty candidate for invalid/empty region input", () => {
    const candidate = generatePlan({
      regions: [{
        key: "bad",
        maxQuantity: 100,
        averageW: 1,
        validStartAngles: new Array<boolean>(100).fill(true),
      }],
      targetPointCount: 50,
      targetAverageW: 1.5,
    });

    expect(candidate.items).toEqual([]);
    expect(candidate.totalPoints).toBe(0);
    expect(candidate.averageW).toBe(0);
    expect(candidate.score).toBe(Number.POSITIVE_INFINITY);
  });

  it("is deterministic with the same random seed", () => {
    const request: GeneratePlanRequest = {
      regions: [
        {
          key: "a",
          maxQuantity: 400,
          averageW: 1.2,
          validStartAngles: createValidAngles([45]),
        },
        {
          key: "b",
          maxQuantity: 400,
          averageW: 2.8,
          validStartAngles: createValidAngles([90]),
        },
      ],
      targetPointCount: 300,
      targetAverageW: 2.0,
      randomSeed: 12345,
      maxGenerations: 600,
      populationSize: 80,
      reportEveryGenerations: 20,
    };

    const first = generatePlan(request);
    const second = generatePlan(request);

    expect(second).toEqual(first);
  });

  it("respects region max quantities and valid angle constraints", () => {
    const request: GeneratePlanRequest = {
      regions: [
        {
          key: "a",
          maxQuantity: 120,
          averageW: 1,
          validStartAngles: createValidAngles([45]),
        },
        {
          key: "b",
          maxQuantity: 80,
          averageW: 3,
          validStartAngles: createValidAngles([90]),
        },
      ],
      targetPointCount: 160,
      targetAverageW: 2,
      randomSeed: 7,
      maxGenerations: 500,
      populationSize: 70,
      mutationRate: 0.2,
      reportEveryGenerations: 25,
    };

    const result = generatePlan(request);

    expect(result.totalPoints).toBe(160);

    for (const item of result.items) {
      const region = request.regions.find((entry) => entry.key === item.regionKey);
      expect(region).toBeDefined();
      expect(item.quantity).toBeGreaterThanOrEqual(0);
      expect(item.quantity).toBeLessThanOrEqual(region!.maxQuantity);

      if (item.regionKey === "a") {
        expect(item.angle).toBe(45);
      }
      if (item.regionKey === "b") {
        expect(item.angle).toBe(90);
      }
    }
  });
});
