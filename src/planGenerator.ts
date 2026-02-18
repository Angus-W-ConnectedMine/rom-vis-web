import * as THREE from "three";
import { getDistanceToPrismEdge, getPointsInPrism, getRegionCenter } from "./geometry";
import type { PlanItem } from "./OperationPlan";
import type { RegionMeta } from "./overlay";
import type { Point } from "./points";
import { computePlanStats, type PlanRegionPrism, type PlanStats } from "./planStats";

interface PlanGenome {
  angles: number[];
  quantities: number[];
}

interface ScoredGenome {
  genome: PlanGenome;
  score: number;
  stats: PlanStats;
}

export interface GeneratePlanProgress {
  generation: number;
  bestScore: number;
  bestPlan: PlanItem[];
  bestStats: PlanStats;
  done: boolean;
}

interface GeneratePlanParams {
  regions: RegionMeta[];
  regionPrisms: PlanRegionPrism[];
  points: Point[];
  desiredTotalPoints: number;
  desiredGrade: number;
  onProgress?: (progress: GeneratePlanProgress) => void;
  shouldContinue?: () => boolean;
  populationSize?: number;
  generations?: number;
  updateEveryGenerations?: number;
}

interface GeneratePlanResult {
  plan: PlanItem[];
  stats: PlanStats;
  score: number;
  generation: number;
  completed: boolean;
}

const ALL_ANGLES = Array.from({ length: 360 }, (_, index) => index);
function clampAngle(angle: number): number {
  if (!Number.isFinite(angle)) {
    return 0;
  }
  const rounded = Math.round(angle);
  const wrapped = rounded % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

function clampQuantity(quantity: number, max: number): number {
  if (!Number.isFinite(quantity) || max <= 0) {
    return 0;
  }
  return THREE.MathUtils.clamp(Math.round(quantity), 0, max);
}

function getCircularDistance(a: number, b: number): number {
  const diff = Math.abs(a - b);
  return Math.min(diff, 360 - diff);
}

function normalizeAllowedAngle(angle: number, allowedAngles: number[]): number {
  const normalized = clampAngle(angle);
  if (allowedAngles.length === 0) {
    return normalized;
  }

  if (allowedAngles.includes(normalized)) {
    return normalized;
  }

  let best = allowedAngles[0] ?? normalized;
  let bestDistance = getCircularDistance(normalized, best);
  for (const candidate of allowedAngles) {
    const distance = getCircularDistance(normalized, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

function pickRandomAllowedAngle(allowedAngles: number[]): number {
  if (allowedAngles.length === 0) {
    return Math.floor(Math.random() * 360);
  }
  return allowedAngles[Math.floor(Math.random() * allowedAngles.length)] ?? 0;
}

function cloneGenome(genome: PlanGenome): PlanGenome {
  return {
    angles: [...genome.angles],
    quantities: [...genome.quantities],
  };
}

function toPlanItems(regions: RegionMeta[], genome: PlanGenome): PlanItem[] {
  const items: PlanItem[] = [];
  for (let i = 0; i < regions.length; i += 1) {
    const quantity = Math.max(0, Math.round(genome.quantities[i] ?? 0));
    if (quantity === 0) {
      continue;
    }
    items.push({
      id: `ga-${regions[i]?.key ?? i}`,
      regionKey: regions[i]?.key ?? "",
      angle: clampAngle(genome.angles[i] ?? 0),
      quantity,
    });
  }
  return items;
}

function getPopulationSize(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return 32;
  }
  return THREE.MathUtils.clamp(Math.round(value ?? 32), 8, 200);
}

function getGenerationCount(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return 180;
  }
  return THREE.MathUtils.clamp(Math.round(value ?? 180), 1, 5000);
}

function getUpdateStride(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return 5;
  }
  return THREE.MathUtils.clamp(Math.round(value ?? 5), 1, 500);
}

function scoreStats(stats: PlanStats, desiredTotalPoints: number, desiredGrade: number): number {
  const pointTarget = Math.max(1, Math.round(desiredTotalPoints));
  const pointError = Math.abs(stats.grandTotal.extractedPointCount - pointTarget) / pointTarget;
  const gradeDenominator = Math.max(1, Math.abs(desiredGrade));
  const gradeError = Math.abs(stats.grandTotal.averageW - desiredGrade) / gradeDenominator;

  let score = pointError * 0.7 + gradeError * 0.3;
  if (pointTarget > 0 && stats.grandTotal.extractedPointCount === 0) {
    score += 5;
  }
  return score;
}

function getPolygonArea(footprint: Array<{ x: number; y: number }>): number {
  if (footprint.length < 3) {
    return 0;
  }

  let areaTwice = 0;
  for (let i = 0; i < footprint.length; i += 1) {
    const current = footprint[i]!;
    const next = footprint[(i + 1) % footprint.length]!;
    areaTwice += current.x * next.y - next.x * current.y;
  }
  return Math.abs(areaTwice) * 0.5;
}

function getAllowedAnglesForRegion(
  prism: PlanRegionPrism | undefined,
  regionPoints: Point[],
): number[] {
  if (!prism || regionPoints.length < 3) {
    return ALL_ANGLES;
  }

  const center = getRegionCenter(prism.snapshot);
  const allowedAngles: number[] = [];
  const footprintArea = getPolygonArea(prism.snapshot.footprint);
  const averagePointSpacing = Math.sqrt(Math.max(1e-6, footprintArea) / Math.max(1, regionPoints.length));
  const insideDistanceThreshold = Math.max(0.25, averagePointSpacing * 0.85);

  for (let angle = 0; angle < 360; angle += 1) {
    const radians = THREE.MathUtils.degToRad(angle);
    const outward = new THREE.Vector3(Math.cos(radians), Math.sin(radians), 0);
    const outwardDistance = getDistanceToPrismEdge(prism.snapshot, center, outward);
    const startX = center.x + outward.x * outwardDistance;
    const startY = center.y + outward.y * outwardDistance;
    let nearestDistance = Infinity;
    for (const point of regionPoints) {
      const dx = point.x - startX;
      const dy = point.y - startY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < nearestDistance) {
        nearestDistance = distance;
      }
      if (nearestDistance <= insideDistanceThreshold) {
        break;
      }
    }
    const angleIsInvalid = nearestDistance <= insideDistanceThreshold;

    if (!angleIsInvalid) {
      allowedAngles.push(angle);
    }
  }

  return allowedAngles;
}

export function getAllowedAnglesByRegionKey(
  regionPrisms: PlanRegionPrism[],
  points: Point[],
): Map<string, Set<number>> {
  const byKey = new Map<string, Set<number>>();

  for (const prism of regionPrisms) {
    const regionPoints = getPointsInPrism(points, prism.snapshot);
    const allowedAngles = getAllowedAnglesForRegion(prism, regionPoints);
    byKey.set(prism.key, new Set(allowedAngles));
  }

  return byKey;
}

function createRandomGenome(
  regions: RegionMeta[],
  desiredTotalPoints: number,
  allowedAnglesByRegion: number[][],
): PlanGenome {
  const angles = regions.map((_, index) => pickRandomAllowedAngle(allowedAnglesByRegion[index] ?? ALL_ANGLES));
  const quantities = regions.map(() => 0);

  const target = Math.max(0, Math.round(desiredTotalPoints));
  if (target <= 0 || regions.length === 0) {
    return { angles, quantities };
  }

  const maxByRegion = regions.map((region) => Math.max(0, Math.round(region.pointCount)));
  const maxTotal = maxByRegion.reduce((sum, value) => sum + value, 0);
  let remaining = Math.min(target, maxTotal);

  for (let i = 0; i < regions.length; i += 1) {
    const max = maxByRegion[i] ?? 0;
    if (max <= 0 || remaining <= 0) {
      continue;
    }

    const isLast = i === regions.length - 1;
    const draw = isLast ? remaining : Math.round((remaining / (regions.length - i)) * (0.25 + Math.random()));
    const quantity = THREE.MathUtils.clamp(draw, 0, Math.min(max, remaining));
    quantities[i] = quantity;
    remaining -= quantity;
  }

  while (remaining > 0) {
    const index = Math.floor(Math.random() * regions.length);
    const max = maxByRegion[index] ?? 0;
    const current = quantities[index] ?? 0;
    if (current >= max) {
      continue;
    }
    quantities[index] = current + 1;
    remaining -= 1;
  }

  return { angles, quantities };
}

function crossover(
  parentA: PlanGenome,
  parentB: PlanGenome,
  maxByRegion: number[],
  allowedAnglesByRegion: number[][],
): PlanGenome {
  const length = parentA.angles.length;
  if (length === 0) {
    return { angles: [], quantities: [] };
  }

  const pivot = Math.floor(Math.random() * length);
  const angles = new Array<number>(length);
  const quantities = new Array<number>(length);

  for (let i = 0; i < length; i += 1) {
    const useA = i <= pivot;
    const angleSource = useA ? parentA : parentB;
    const quantitySource = useA ? parentB : parentA;
    angles[i] = normalizeAllowedAngle(angleSource.angles[i] ?? 0, allowedAnglesByRegion[i] ?? ALL_ANGLES);
    quantities[i] = clampQuantity(quantitySource.quantities[i] ?? 0, maxByRegion[i] ?? 0);
  }

  return { angles, quantities };
}

function mutate(
  genome: PlanGenome,
  maxByRegion: number[],
  desiredTotalPoints: number,
  allowedAnglesByRegion: number[][],
): void {
  for (let i = 0; i < genome.angles.length; i += 1) {
    if (Math.random() < 0.25) {
      genome.angles[i] = normalizeAllowedAngle(
        (genome.angles[i] ?? 0) + (Math.random() * 80 - 40),
        allowedAnglesByRegion[i] ?? ALL_ANGLES,
      );
    }

    if (Math.random() < 0.4) {
      const jitter = Math.round((Math.random() * 2 - 1) * Math.max(1, desiredTotalPoints * 0.08));
      genome.quantities[i] = clampQuantity((genome.quantities[i] ?? 0) + jitter, maxByRegion[i] ?? 0);
    }
  }

  if (Math.random() < 0.35 && genome.quantities.length > 0) {
    const from = Math.floor(Math.random() * genome.quantities.length);
    const to = Math.floor(Math.random() * genome.quantities.length);
    if (from !== to && (genome.quantities[from] ?? 0) > 0) {
      const transfer = Math.max(1, Math.round(Math.random() * (genome.quantities[from] ?? 0)));
      const destinationMax = maxByRegion[to] ?? 0;
      const toRoom = Math.max(0, destinationMax - (genome.quantities[to] ?? 0));
      const moved = Math.min(transfer, toRoom);
      genome.quantities[from] = clampQuantity((genome.quantities[from] ?? 0) - moved, maxByRegion[from] ?? 0);
      genome.quantities[to] = clampQuantity((genome.quantities[to] ?? 0) + moved, destinationMax);
    }
  }
}

function evaluateGenome(
  regions: RegionMeta[],
  regionPrisms: PlanRegionPrism[],
  points: Point[],
  genome: PlanGenome,
  desiredTotalPoints: number,
  desiredGrade: number,
): ScoredGenome {
  const candidatePlan = toPlanItems(regions, genome);
  const stats = computePlanStats(regions, candidatePlan, regionPrisms, points);
  return {
    genome,
    score: scoreStats(stats, desiredTotalPoints, desiredGrade),
    stats,
  };
}

function sortByScore(population: ScoredGenome[]): void {
  population.sort((a, b) => a.score - b.score);
}

function tick(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

export async function generatePlan(params: GeneratePlanParams): Promise<GeneratePlanResult> {
  const {
    regions,
    regionPrisms,
    points,
    desiredTotalPoints,
    desiredGrade,
    onProgress,
    shouldContinue,
    populationSize,
    generations,
    updateEveryGenerations,
  } = params;

  if (regions.length === 0 || points.length === 0 || regionPrisms.length === 0) {
    const emptyPlan: PlanItem[] = [];
    const emptyStats = computePlanStats(regions, emptyPlan, regionPrisms, points);
    return {
      plan: emptyPlan,
      stats: emptyStats,
      score: scoreStats(emptyStats, desiredTotalPoints, desiredGrade),
      generation: 0,
      completed: true,
    };
  }

  const maxByRegion = regions.map((region) => Math.max(0, Math.round(region.pointCount)));
  const prismByKey = new Map(regionPrisms.map((regionPrism) => [regionPrism.key, regionPrism]));
  const allowedAngleSetByRegionKey = getAllowedAnglesByRegionKey(regionPrisms, points);
  const allowedAnglesByRegion = regions.map((region) => {
    const allowedSet = allowedAngleSetByRegionKey.get(region.key);
    if (!allowedSet) {
      return ALL_ANGLES;
    }
    return [...allowedSet];
  });
  const popSize = getPopulationSize(populationSize);
  const maxGenerations = getGenerationCount(generations);
  const updateStride = getUpdateStride(updateEveryGenerations);
  const eliteCount = Math.max(1, Math.floor(popSize * 0.15));

  let population: ScoredGenome[] = [];
  for (let i = 0; i < popSize; i += 1) {
    const genome = createRandomGenome(regions, desiredTotalPoints, allowedAnglesByRegion);
    population.push(
      evaluateGenome(
        regions,
        regionPrisms,
        points,
        genome,
        desiredTotalPoints,
        desiredGrade,
      ),
    );
  }
  sortByScore(population);

  let best = population[0] as ScoredGenome;
  let generation = 0;
  onProgress?.({
    generation,
    bestScore: best.score,
    bestPlan: toPlanItems(regions, best.genome),
    bestStats: best.stats,
    done: false,
  });

  while (generation < maxGenerations) {
    if (shouldContinue && !shouldContinue()) {
      return {
        plan: toPlanItems(regions, best.genome),
        stats: best.stats,
        score: best.score,
        generation,
        completed: false,
      };
    }

    const nextPopulation: ScoredGenome[] = population.slice(0, eliteCount).map((item) => ({
      genome: cloneGenome(item.genome),
      score: item.score,
      stats: item.stats,
    }));

    while (nextPopulation.length < popSize) {
      const fallbackParent = best;
      const a = population[Math.floor(Math.random() * Math.max(2, popSize / 2))] ?? fallbackParent;
      const b = population[Math.floor(Math.random() * Math.max(2, popSize / 2))] ?? fallbackParent;
      const childGenome = crossover(a.genome, b.genome, maxByRegion, allowedAnglesByRegion);
      mutate(childGenome, maxByRegion, desiredTotalPoints, allowedAnglesByRegion);
      nextPopulation.push(
        evaluateGenome(
          regions,
          regionPrisms,
          points,
          childGenome,
          desiredTotalPoints,
          desiredGrade,
        ),
      );
    }

    sortByScore(nextPopulation);
    population = nextPopulation;
    generation += 1;

    const currentBest = population[0];
    if (currentBest && currentBest.score < best.score) {
      best = currentBest;
    }

    if (generation % updateStride === 0 || generation === maxGenerations) {
      onProgress?.({
        generation,
        bestScore: best.score,
        bestPlan: toPlanItems(regions, best.genome),
        bestStats: best.stats,
        done: generation === maxGenerations,
      });
      await tick();
    }
  }

  const bestPlan = toPlanItems(regions, best.genome);
  onProgress?.({
    generation,
    bestScore: best.score,
    bestPlan,
    bestStats: best.stats,
    done: true,
  });

  return {
    plan: bestPlan,
    stats: best.stats,
    score: best.score,
    generation,
    completed: true,
  };
}
