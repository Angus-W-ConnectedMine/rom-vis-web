export interface GeneratePlanRegionInput {
  key: string;
  maxQuantity: number;
  averageW: number;
  validStartAngles: boolean[];
}

export interface GeneratePlanRequest {
  regions: GeneratePlanRegionInput[];
  targetPointCount: number;
  targetAverageW: number;
  populationSize?: number;
  maxGenerations?: number;
  mutationRate?: number;
  reportEveryGenerations?: number;
  eliteCount?: number;
  stallGenerations?: number;
  randomSeed?: number;
}

export interface GeneratedPlanItem {
  regionKey: string;
  angle: number;
  quantity: number;
}

export interface GeneratedPlanCandidate {
  items: GeneratedPlanItem[];
  totalPoints: number;
  averageW: number;
  score: number;
}

export interface GeneratePlanProgress {
  generation: number;
  best: GeneratedPlanCandidate;
}

interface NormalizedGeneratePlanRequest {
  regions: GeneratePlanRegionInput[];
  targetPointCount: number;
  targetAverageW: number;
  populationSize: number;
  maxGenerations: number;
  mutationRate: number;
  reportEveryGenerations: number;
  eliteCount: number;
  stallGenerations: number;
}

interface Genome {
  quantities: number[];
  angles: number[];
}

interface EvaluatedGenome {
  genome: Genome;
  candidate: GeneratedPlanCandidate;
}

interface RandomSource {
  next(): number;
  int(min: number, maxInclusive: number): number;
}

class Mulberry32Random implements RandomSource {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min: number, maxInclusive: number): number {
    if (maxInclusive <= min) {
      return min;
    }
    const value = this.next();
    return min + Math.floor(value * (maxInclusive - min + 1));
  }
}

function normalizeRequest(request: GeneratePlanRequest): NormalizedGeneratePlanRequest {
  const regions = request.regions.filter((region) =>
    Number.isFinite(region.maxQuantity) &&
    region.maxQuantity > 0 &&
    Number.isFinite(region.averageW) &&
    Array.isArray(region.validStartAngles) &&
    region.validStartAngles.length >= 360 &&
    typeof region.key === "string" &&
    region.key.length > 0
  );

  const targetPointCount = Math.max(0, Math.round(request.targetPointCount));
  const targetAverageW = Number.isFinite(request.targetAverageW) ? request.targetAverageW : 0;
  const populationSize = Math.max(20, Math.min(400, Math.round(request.populationSize ?? 120)));
  const maxGenerations = Math.max(50, Math.min(10000, Math.round(request.maxGenerations ?? 2000)));
  const mutationRate = Math.max(0.01, Math.min(0.8, request.mutationRate ?? 0.12));
  const reportEveryGenerations = Math.max(1, Math.round(request.reportEveryGenerations ?? 8));
  const eliteCount = Math.max(1, Math.min(Math.floor(populationSize / 3), Math.round(request.eliteCount ?? 6)));
  const stallGenerations = Math.max(20, Math.min(maxGenerations, Math.round(request.stallGenerations ?? 400)));

  return {
    regions,
    targetPointCount,
    targetAverageW,
    populationSize,
    maxGenerations,
    mutationRate,
    reportEveryGenerations,
    eliteCount,
    stallGenerations,
  };
}

function buildValidAngles(regions: GeneratePlanRegionInput[]): number[][] {
  return regions.map((region) => {
    const validAngles: number[] = [];
    for (let angle = 0; angle < 360; angle += 1) {
      if (region.validStartAngles[angle]) {
        validAngles.push(angle);
      }
    }
    return validAngles.length > 0 ? validAngles : [0];
  });
}

function createRandomGenome(
  request: NormalizedGeneratePlanRequest,
  validAnglesByRegion: number[][],
  random: RandomSource,
): Genome {
  const quantities = new Array<number>(request.regions.length).fill(0);
  const angles = new Array<number>(request.regions.length).fill(0);

  const activeRegionCount = random.int(1, Math.max(1, Math.min(request.regions.length, 6)));

  for (let i = 0; i < request.regions.length; i += 1) {
    const region = request.regions[i] as GeneratePlanRegionInput;
    const validAngles = validAnglesByRegion[i] as number[];
    angles[i] = validAngles[random.int(0, validAngles.length - 1)] as number;

    if (i < activeRegionCount || random.next() < 0.35) {
      quantities[i] = random.int(0, Math.max(0, region.maxQuantity));
    }
  }

  normalizeGenomeToTarget(quantities, request.regions, request.targetPointCount, random);
  return { quantities, angles };
}

function normalizeGenomeToTarget(
  quantities: number[],
  regions: GeneratePlanRegionInput[],
  targetPointCount: number,
  random: RandomSource,
): void {
  const maxTotal = regions.reduce((sum, region) => sum + region.maxQuantity, 0);
  const target = Math.max(0, Math.min(targetPointCount, maxTotal));
  if (target === 0) {
    quantities.fill(0);
    return;
  }

  let current = quantities.reduce((sum, value) => sum + value, 0);
  if (current === 0) {
    for (let i = 0; i < quantities.length && current < target; i += 1) {
      const room = regions[i]!.maxQuantity - quantities[i]!;
      if (room <= 0) {
        continue;
      }
      const add = Math.min(room, random.int(1, Math.max(1, target - current)));
      quantities[i] = (quantities[i] as number) + add;
      current += add;
    }
  }

  current = quantities.reduce((sum, value) => sum + value, 0);

  if (current > 0 && current !== target) {
    const scale = target / current;
    for (let i = 0; i < quantities.length; i += 1) {
      const scaled = Math.round((quantities[i] as number) * scale);
      quantities[i] = Math.max(0, Math.min(regions[i]!.maxQuantity, scaled));
    }
  }

  current = quantities.reduce((sum, value) => sum + value, 0);
  if (current < target) {
    const indices = [...regions.keys()];
    while (current < target && indices.length > 0) {
      const index = indices[random.int(0, indices.length - 1)] as number;
      const room = regions[index]!.maxQuantity - (quantities[index] as number);
      if (room <= 0) {
        indices.splice(indices.indexOf(index), 1);
        continue;
      }
      quantities[index] = (quantities[index] as number) + 1;
      current += 1;
    }
  } else if (current > target) {
    const nonZero = quantities.map((value, index) => ({ value, index })).filter((item) => item.value > 0);
    while (current > target && nonZero.length > 0) {
      const selection = nonZero[random.int(0, nonZero.length - 1)] as { value: number; index: number };
      if ((quantities[selection.index] as number) <= 0) {
        nonZero.splice(nonZero.indexOf(selection), 1);
        continue;
      }
      quantities[selection.index] = (quantities[selection.index] as number) - 1;
      current -= 1;
      if ((quantities[selection.index] as number) <= 0) {
        nonZero.splice(nonZero.indexOf(selection), 1);
      }
    }
  }
}

function cloneGenome(genome: Genome): Genome {
  return {
    quantities: [...genome.quantities],
    angles: [...genome.angles],
  };
}

function evaluateGenome(
  genome: Genome,
  request: NormalizedGeneratePlanRequest,
): GeneratedPlanCandidate {
  let totalPoints = 0;
  let weightedW = 0;
  let activeItems = 0;

  const items: GeneratedPlanItem[] = [];
  for (let i = 0; i < request.regions.length; i += 1) {
    const region = request.regions[i] as GeneratePlanRegionInput;
    const quantity = Math.max(0, Math.min(region.maxQuantity, Math.round(genome.quantities[i] as number)));
    const angle = Math.max(0, Math.min(359, Math.round(genome.angles[i] as number)));

    if (quantity <= 0) {
      continue;
    }

    totalPoints += quantity;
    weightedW += quantity * region.averageW;
    activeItems += 1;
    items.push({
      regionKey: region.key,
      angle,
      quantity,
    });
  }

  const averageW = totalPoints > 0 ? weightedW / totalPoints : 0;
  const pointError = Math.abs(totalPoints - request.targetPointCount) / Math.max(1, request.targetPointCount);
  const gradeError = Math.abs(averageW - request.targetAverageW) / Math.max(1, Math.abs(request.targetAverageW));
  const sparsityPenalty = activeItems * 0.0005;
  const score = pointError * 1.4 + gradeError + sparsityPenalty;

  return {
    items,
    totalPoints,
    averageW,
    score,
  };
}

function tournamentSelect(
  population: EvaluatedGenome[],
  random: RandomSource,
  size = 4,
): EvaluatedGenome {
  let best: EvaluatedGenome | null = null;
  for (let i = 0; i < size; i += 1) {
    const selected = population[random.int(0, population.length - 1)] as EvaluatedGenome;
    if (!best || selected.candidate.score < best.candidate.score) {
      best = selected;
    }
  }
  return best as EvaluatedGenome;
}

function crossover(
  a: Genome,
  b: Genome,
  random: RandomSource,
): Genome {
  const child: Genome = {
    quantities: new Array<number>(a.quantities.length).fill(0),
    angles: new Array<number>(a.angles.length).fill(0),
  };

  for (let i = 0; i < child.quantities.length; i += 1) {
    child.quantities[i] = random.next() < 0.5 ? (a.quantities[i] as number) : (b.quantities[i] as number);
    child.angles[i] = random.next() < 0.5 ? (a.angles[i] as number) : (b.angles[i] as number);
  }
  return child;
}

function mutate(
  genome: Genome,
  request: NormalizedGeneratePlanRequest,
  validAnglesByRegion: number[][],
  random: RandomSource,
): void {
  for (let i = 0; i < request.regions.length; i += 1) {
    const region = request.regions[i] as GeneratePlanRegionInput;
    const validAngles = validAnglesByRegion[i] as number[];

    if (random.next() < request.mutationRate) {
      const current = genome.quantities[i] as number;
      const maxStep = Math.max(1, Math.round(region.maxQuantity * 0.2));
      const delta = random.int(-maxStep, maxStep);
      genome.quantities[i] = Math.max(0, Math.min(region.maxQuantity, current + delta));
    }

    if (random.next() < request.mutationRate * 1.4) {
      genome.angles[i] = validAngles[random.int(0, validAngles.length - 1)] as number;
    }
  }

  normalizeGenomeToTarget(genome.quantities, request.regions, request.targetPointCount, random);
}

function sortPopulation(population: EvaluatedGenome[]): void {
  population.sort((a, b) => a.candidate.score - b.candidate.score);
}

function shouldEarlyExit(best: GeneratedPlanCandidate, request: NormalizedGeneratePlanRequest): boolean {
  const pointTolerance = Math.max(2, Math.round(request.targetPointCount * 0.01));
  const gradeTolerance = 0.02;
  const pointOk = Math.abs(best.totalPoints - request.targetPointCount) <= pointTolerance;
  const gradeOk = Math.abs(best.averageW - request.targetAverageW) <= gradeTolerance;
  return pointOk && gradeOk;
}

export interface GeneratePlanRuntimeOptions {
  onProgress?: (progress: GeneratePlanProgress) => void;
  shouldStop?: () => boolean;
}

export function generatePlan(
  input: GeneratePlanRequest,
  runtimeOptions?: GeneratePlanRuntimeOptions,
): GeneratedPlanCandidate {
  const request = normalizeRequest(input);
  if (request.regions.length === 0) {
    return {
      items: [],
      totalPoints: 0,
      averageW: 0,
      score: Number.POSITIVE_INFINITY,
    };
  }

  const validAnglesByRegion = buildValidAngles(request.regions);
  const random = new Mulberry32Random(input.randomSeed ?? Date.now());

  const population: EvaluatedGenome[] = [];
  for (let i = 0; i < request.populationSize; i += 1) {
    const genome = createRandomGenome(request, validAnglesByRegion, random);
    population.push({
      genome,
      candidate: evaluateGenome(genome, request),
    });
  }
  sortPopulation(population);

  let best = population[0] as EvaluatedGenome;
  let lastImprovementGeneration = 0;

  runtimeOptions?.onProgress?.({
    generation: 0,
    best: best.candidate,
  });

  for (let generation = 1; generation <= request.maxGenerations; generation += 1) {
    if (runtimeOptions?.shouldStop?.()) {
      break;
    }

    const nextPopulation: EvaluatedGenome[] = [];

    for (let i = 0; i < request.eliteCount; i += 1) {
      const elite = population[i] as EvaluatedGenome;
      nextPopulation.push({
        genome: cloneGenome(elite.genome),
        candidate: elite.candidate,
      });
    }

    while (nextPopulation.length < request.populationSize) {
      const parentA = tournamentSelect(population, random);
      const parentB = tournamentSelect(population, random);
      const childGenome = crossover(parentA.genome, parentB.genome, random);
      mutate(childGenome, request, validAnglesByRegion, random);
      const childCandidate = evaluateGenome(childGenome, request);
      nextPopulation.push({
        genome: childGenome,
        candidate: childCandidate,
      });
    }

    sortPopulation(nextPopulation);

    population.length = 0;
    for (const item of nextPopulation) {
      population.push(item);
    }

    const generationBest = population[0] as EvaluatedGenome;
    if (generationBest.candidate.score < best.candidate.score) {
      best = generationBest;
      lastImprovementGeneration = generation;
    }

    if (generation % request.reportEveryGenerations === 0) {
      runtimeOptions?.onProgress?.({
        generation,
        best: best.candidate,
      });
    }

    if (shouldEarlyExit(best.candidate, request)) {
      break;
    }

    if (generation - lastImprovementGeneration > request.stallGenerations) {
      break;
    }
  }

  return best.candidate;
}
