export interface StoredPrismPoint {
  x: number;
  y: number;
}

export interface StoredPrism {
  key: string;
  regionId: string;
  minZ: number;
  maxZ: number;
  footprint: StoredPrismPoint[];
}

interface StoredPrismsPayload {
  version: 1;
  prisms: StoredPrism[];
}

export interface StoredPlanItem {
  id: string;
  regionKey: string;
  angle: number;
  quantity: number;
}

interface StoredPlanPayload {
  version: 1;
  plan: StoredPlanItem[];
}

const STORAGE_KEY = "rom-vis-web.prisms.v1";
const PLAN_STORAGE_KEY = "rom-vis-web.plan.v1";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
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

  const prism = value as StoredPrism;

  if (
    !isNonEmptyString(prism.key) ||
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
    regionId: prism.regionId,
    minZ: prism.minZ,
    maxZ: prism.maxZ,
    footprint: prism.footprint,
  };
}

function toStoredPlanItem(value: unknown): StoredPlanItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as Partial<StoredPlanItem>;
  if (
    !isNonEmptyString(item.id) ||
    !isNonEmptyString(item.regionKey) ||
    !isFiniteNumber(item.angle)
  ) {
    return null;
  }

  const quantity = isFiniteNumber(item.quantity) ? item.quantity : 0;
  return {
    id: item.id,
    regionKey: item.regionKey,
    angle: Math.min(360, Math.max(0, Math.round(item.angle))),
    quantity: Math.max(0, Math.round(quantity)),
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

export function loadStoredPlan(): StoredPlanItem[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(PLAN_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const payload = JSON.parse(raw) as Partial<StoredPlanPayload>;
    if (payload.version !== 1 || !Array.isArray(payload.plan)) {
      return [];
    }

    const plan: StoredPlanItem[] = [];
    for (const item of payload.plan) {
      const normalized = toStoredPlanItem(item);
      if (normalized) {
        plan.push(normalized);
      }
    }
    return plan;
  } catch {
    return [];
  }
}

export function saveStoredPlan(plan: StoredPlanItem[]): void {
  if (typeof window === "undefined") {
    return;
  }

  const payload: StoredPlanPayload = {
    version: 1,
    plan,
  };

  window.localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(payload));
}
