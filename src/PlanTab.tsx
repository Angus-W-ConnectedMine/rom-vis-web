import OperationalPlan, { type PlanItem } from "./OperationPlan";
import type { RegionMeta } from "./overlay";

interface PlanTabProps {
  regions: RegionMeta[];
  plan: PlanItem[];
  onAddRegionToPlan: (region: RegionMeta) => void;
  onUpdatePlanAngle: (planItemId: string, angle: number) => void;
}

export function PlanTab({
  regions,
  plan,
  onAddRegionToPlan,
  onUpdatePlanAngle,
}: PlanTabProps) {
  return (
    <div className="overlay-tab-content" role="tabpanel" aria-labelledby="overlay-tab-plan">
      <OperationalPlan
        regions={regions}
        plan={plan}
        onAddRegionToPlan={onAddRegionToPlan}
        onUpdatePlanAngle={onUpdatePlanAngle}
      />
    </div>
  );
}
