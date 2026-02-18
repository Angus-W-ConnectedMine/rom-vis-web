import type { RegionMeta } from "./overlay";

export interface PlanItem {
  id: string;
  regionKey: string;
  angle: number;
}

interface OperationalPlanProps {
  regions: RegionMeta[];
  plan: PlanItem[];
  onAddRegionToPlan: (region: RegionMeta) => void;
  onUpdatePlanAngle: (planItemId: string, angle: number) => void;
}

export default function OperationalPlan({
  regions,
  plan,
  onAddRegionToPlan,
  onUpdatePlanAngle,
}: OperationalPlanProps) {
  return (
    <div className="card plan-card">
      <h4>Plan</h4>

      <p>Add from:</p>

      <div className="toolbar plan-add-region-row">
        {regions.map((region) => (
          <button key={region.key} type="button" onClick={() => onAddRegionToPlan(region)}>
            {region.regionId}
          </button>
        ))}
      </div>

      <div className="plan-list-container">
        {plan.length === 0 ? (
          <p className="plan-empty">No plan items</p>
        ) : (
          <div className="plan-list">
            {plan.map((item) => (
              <div key={item.id} className="plan-item">
                <div className="plan-item-row">
                  <strong>{regions.find((region) => region.key === item.regionKey)?.regionId ?? `region-${item.regionKey}`}</strong>
                  <span>{item.angle} deg</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={360}
                  step={1}
                  value={item.angle}
                  onChange={(event) => onUpdatePlanAngle(item.id, Number(event.target.value))}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
