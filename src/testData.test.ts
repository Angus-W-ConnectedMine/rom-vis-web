import { describe, expect, it } from "bun:test";
import { toInsertableGeneratedPoint } from "./testData";

describe("toInsertableGeneratedPoint", () => {
  it("allows zero W values", () => {
    expect(toInsertableGeneratedPoint({ x: 1, y: 2, z: 3, w: 0 }, 0)).toEqual({
      point: { x: 1, y: 2, z: 3, w: 0 },
      w: 0,
    });
  });

  it("rejects missing point or W", () => {
    expect(toInsertableGeneratedPoint(undefined, 1)).toBeNull();
    expect(toInsertableGeneratedPoint({ x: 1, y: 2, z: 3, w: 1 }, undefined)).toBeNull();
  });
});
