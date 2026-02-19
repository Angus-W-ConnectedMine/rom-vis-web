import {
  type GeneratePlanRequest,
  type GeneratePlanProgress,
  type GeneratedPlanCandidate,
} from "./generatePlan";

type StartMessage = {
  type: "start";
  runId: number;
  request: GeneratePlanRequest;
};

type StopMessage = {
  type: "stop";
  runId: number;
};

type IncomingMessage = StartMessage | StopMessage;

type ReadyMessage = {
  type: "ready";
  timestamp: number;
};

type ProgressMessage = {
  type: "progress";
  runId: number;
  generation: number;
  candidate: GeneratedPlanCandidate;
};

type DoneMessage = {
  type: "done";
  runId: number;
  candidate: GeneratedPlanCandidate;
  cancelled: boolean;
};

let activeRunId = -1;
let cancelledRunId = -1;
let generatePlanFn: ((request: GeneratePlanRequest, runtimeOptions?: {
  onProgress?: (progress: GeneratePlanProgress) => void;
  shouldStop?: () => boolean;
}) => GeneratedPlanCandidate) | null = null;

async function getGeneratePlanFn(): Promise<NonNullable<typeof generatePlanFn>> {
  if (generatePlanFn) {
    return generatePlanFn;
  }

  const modulePath = "/generatePlan.js";
  const module = await import(modulePath);
  generatePlanFn = module.generatePlan as NonNullable<typeof generatePlanFn>;
  return generatePlanFn;
}

function postReady(message: ReadyMessage): void {
  postMessage(message);
}

function postProgress(message: ProgressMessage): void {
  postMessage(message);
}

function postDone(message: DoneMessage): void {
  postMessage(message);
}

console.log("[generatePlan.worker] script loaded");
postReady({
  type: "ready",
  timestamp: Date.now(),
});

self.onmessage = async (event: MessageEvent<IncomingMessage>) => {
  const message = event.data;
  if (!message) {
    return;
  }

  if (message.type === "stop") {
    console.log("[generatePlan.worker] stop requested", { runId: message.runId });
    cancelledRunId = message.runId;
    return;
  }

  if (message.type !== "start") {
    return;
  }

  const { runId, request } = message;
  console.log("[generatePlan.worker] run started", {
    runId,
    regionCount: request.regions.length,
    targetPointCount: request.targetPointCount,
    targetAverageW: request.targetAverageW,
  });

  activeRunId = runId;
  cancelledRunId = -1;

  const generatePlan = await getGeneratePlanFn();
  const candidate = generatePlan(request, {
    onProgress: (progress) => {
      if (activeRunId !== runId || cancelledRunId === runId) {
        return;
      }

      postProgress({
        type: "progress",
        runId,
        generation: progress.generation,
        candidate: progress.best,
      });

      if (progress.generation % 100 === 0) {
        console.log("[generatePlan.worker] progress", {
          runId,
          generation: progress.generation,
          score: progress.best.score,
          totalPoints: progress.best.totalPoints,
          averageW: progress.best.averageW,
        });
      }
    },
    shouldStop: () => activeRunId !== runId || cancelledRunId === runId,
  });

  console.log("[generatePlan.worker] run finished", {
    runId,
    cancelled: cancelledRunId === runId,
    score: candidate.score,
    totalPoints: candidate.totalPoints,
    averageW: candidate.averageW,
  });

  postDone({
    type: "done",
    runId,
    candidate,
    cancelled: cancelledRunId === runId,
  });
};

export {};
