import OperationalPlan, { type PlanGrandTotal, type PlanItem, type PlanOutcomeItem } from "./OperationPlan";
import type { GeneratePlanProgress } from "./planGenerator";
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
  targetTotalPoints: number;
  targetGrade: number;
  selectedRegionCount: number;
  isGeneratingPlan: boolean;
  planGenerationProgress: GeneratePlanProgress | null;
  onUpdateTargetTotalPoints: (value: number) => void;
  onUpdateTargetGrade: (value: number) => void;
  onGeneratePlan: () => void;
  onStopGeneratePlan: () => void;
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
  targetTotalPoints,
  targetGrade,
  selectedRegionCount,
  isGeneratingPlan,
  planGenerationProgress,
  onUpdateTargetTotalPoints,
  onUpdateTargetGrade,
  onGeneratePlan,
  onStopGeneratePlan,
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
        targetTotalPoints={targetTotalPoints}
        targetGrade={targetGrade}
        selectedRegionCount={selectedRegionCount}
        isGeneratingPlan={isGeneratingPlan}
        planGenerationProgress={planGenerationProgress}
        onUpdateTargetTotalPoints={onUpdateTargetTotalPoints}
        onUpdateTargetGrade={onUpdateTargetGrade}
        onGeneratePlan={onGeneratePlan}
        onStopGeneratePlan={onStopGeneratePlan}
      />
    </div>
  );
}
