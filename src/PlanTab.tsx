import OperationalPlan, { type PlanGrandTotal, type PlanItem, type PlanOutcomeItem } from "./OperationPlan";
import type { GeneratedPlanCandidate } from "./generatePlan";
import type { RegionMeta } from "./overlay";

interface PlanTabProps {
  regions: RegionMeta[];
  plan: PlanItem[];
  outcomeByItemId: Record<string, PlanOutcomeItem>;
  grandTotal: PlanGrandTotal;
  onAddRegionToPlan: (region: RegionMeta) => void;
  onUpdatePlanAngle: (planItemId: string, angle: number) => void;
  onUpdatePlanQuantity: (planItemId: string, quantity: number) => void;
  onDeletePlanItem: (planItemId: string) => void;
  generationTargetPointCount: number;
  generationTargetAverageW: number;
  generationRunning: boolean;
  generationBestCandidate: GeneratedPlanCandidate | null;
  generationBestGeneration: number;
  onUpdateGenerationTargetPointCount: (value: number) => void;
  onUpdateGenerationTargetAverageW: (value: number) => void;
  onStartGeneration: () => void;
  onStopGeneration: () => void;
}

export function PlanTab({
  regions,
  plan,
  outcomeByItemId,
  grandTotal,
  onAddRegionToPlan,
  onUpdatePlanAngle,
  onUpdatePlanQuantity,
  onDeletePlanItem,
  generationTargetPointCount,
  generationTargetAverageW,
  generationRunning,
  generationBestCandidate,
  generationBestGeneration,
  onUpdateGenerationTargetPointCount,
  onUpdateGenerationTargetAverageW,
  onStartGeneration,
  onStopGeneration,
}: PlanTabProps) {
  return (
    <div className="overlay-tab-content" role="tabpanel" aria-labelledby="overlay-tab-plan">
      <OperationalPlan
        regions={regions}
        plan={plan}
        outcomeByItemId={outcomeByItemId}
        grandTotal={grandTotal}
        onAddRegionToPlan={onAddRegionToPlan}
        onUpdatePlanAngle={onUpdatePlanAngle}
        onUpdatePlanQuantity={onUpdatePlanQuantity}
        onDeletePlanItem={onDeletePlanItem}
        generationTargetPointCount={generationTargetPointCount}
        generationTargetAverageW={generationTargetAverageW}
        generationRunning={generationRunning}
        generationBestCandidate={generationBestCandidate}
        generationBestGeneration={generationBestGeneration}
        onUpdateGenerationTargetPointCount={onUpdateGenerationTargetPointCount}
        onUpdateGenerationTargetAverageW={onUpdateGenerationTargetAverageW}
        onStartGeneration={onStartGeneration}
        onStopGeneration={onStopGeneration}
      />
    </div>
  );
}
