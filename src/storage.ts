export interface StoredPrismPoint {
  x: number;
  y: number;
}

export interface StoredPrism {
  key: number;
  regionId: string;
  minZ: number;
  maxZ: number;
  footprint: StoredPrismPoint[];
}

interface StoredPrismsPayload {
  version: 1;
  prisms: StoredPrism[];
}

const STORAGE_KEY = "rom-vis-web.prisms.v1";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isStoredPrismPoint(value: unknown): value is StoredPrismPoint {
  if (!value || typeof value !== "object") {
    return false;
  }

  const point = value as Partial<StoredPrismPoint>;
  return isFiniteNumber(point.x) && isFiniteNumber(point.y);
}

function toStoredPrism(value: unknown): StoredPrism | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const prism = value as Partial<StoredPrism>;
  if (
    !isFiniteNumber(prism.key) ||
    !isFiniteNumber(prism.minZ) ||
    !isFiniteNumber(prism.maxZ)
  ) {
    return null;
  }

  if (!Array.isArray(prism.footprint) || prism.footprint.length < 3) {
    return null;
  }

  if (!prism.footprint.every(isStoredPrismPoint)) {
    return null;
  }

  return {
    key: prism.key,
    regionId: typeof prism.regionId === "string" ? prism.regionId : `region-${prism.key}`,
    minZ: prism.minZ,
    maxZ: prism.maxZ,
    footprint: prism.footprint,
  };
}

export function loadStoredPrisms(): StoredPrism[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const payload = JSON.parse(raw) as Partial<StoredPrismsPayload>;
    if (payload.version !== 1 || !Array.isArray(payload.prisms)) {
      return [];
    }

    const prisms: StoredPrism[] = [];
    for (const prism of payload.prisms) {
      const normalized = toStoredPrism(prism);
      if (normalized) {
        prisms.push(normalized);
      }
    }
    return prisms;
  } catch {
    return [];
  }
}

export function saveStoredPrisms(prisms: StoredPrism[]): void {
  if (typeof window === "undefined") {
    return;
  }

  const payload: StoredPrismsPayload = {
    version: 1,
    prisms,
  };

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}
