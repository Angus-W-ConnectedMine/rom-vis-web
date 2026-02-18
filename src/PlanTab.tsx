import OperationalPlan, { type PlanGrandTotal, type PlanItem, type PlanOutcomeItem } from "./OperationPlan";
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
      />
    </div>
  );
}
