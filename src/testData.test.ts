import { describe, expect, it } from "bun:test";
import { shouldInsertGeneratedPoint } from "./testData";

describe("shouldInsertGeneratedPoint", () => {
  it("allows zero W values", () => {
    expect(shouldInsertGeneratedPoint({ x: 1, y: 2, z: 3, w: 0 }, 0)).toBe(true);
  });

  it("rejects missing point or W", () => {
    expect(shouldInsertGeneratedPoint(undefined, 1)).toBe(false);
    expect(shouldInsertGeneratedPoint({ x: 1, y: 2, z: 3, w: 1 }, undefined)).toBe(false);
  });
});
