import { describe, expect, it, beforeEach } from "bun:test";
import { loadStoredPlan, loadStoredPrisms, saveStoredPlan, saveStoredPrisms, type StoredPlanItem, type StoredPrism } from "./storage";

interface MockStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  clear: () => void;
}

function createMockStorage(): MockStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    clear: () => {
      data.clear();
    },
  };
}

describe("storage", () => {
  const mockStorage = createMockStorage();

  beforeEach(() => {
    mockStorage.clear();
    (globalThis as { window?: Window }).window = {
      localStorage: mockStorage,
    } as unknown as Window;
  });

  it("round-trips valid prisms", () => {
    const prisms: StoredPrism[] = [
      {
        key: "k1",
        regionId: "region-a",
        minZ: 1,
        maxZ: 3,
        footprint: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
        ],
      },
    ];

    saveStoredPrisms(prisms);
    expect(loadStoredPrisms()).toEqual(prisms);
  });

  it("filters invalid prism rows on load", () => {
    mockStorage.setItem("rom-vis-web.prisms.v1", JSON.stringify({
      version: 1,
      prisms: [
        {
          key: "valid",
          regionId: "region-1",
          minZ: 0,
          maxZ: 2,
          footprint: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 0, y: 1 },
          ],
        },
        {
          key: "bad",
          minZ: 0,
          maxZ: 2,
          footprint: [{ x: 0, y: 0 }],
        },
      ],
    }));

    const loaded = loadStoredPrisms();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.key).toBe("valid");
  });

  it("normalizes plan values during load", () => {
    mockStorage.setItem("rom-vis-web.plan.v1", JSON.stringify({
      version: 1,
      plan: [
        {
          id: "p1",
          regionKey: "r1",
          angle: 361.4,
          quantity: -4,
        },
      ],
    }));

    const loaded = loadStoredPlan();
    expect(loaded).toEqual([
      {
        id: "p1",
        regionKey: "r1",
        angle: 360,
        quantity: 0,
      },
    ]);
  });

  it("round-trips valid plan", () => {
    const plan: StoredPlanItem[] = [
      {
        id: "p2",
        regionKey: "r2",
        angle: 90,
        quantity: 25,
      },
    ];

    saveStoredPlan(plan);
    expect(loadStoredPlan()).toEqual(plan);
  });
});
