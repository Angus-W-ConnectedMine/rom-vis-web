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
  onDeletePlanItem: (planItemId: string) => void;
}

export default function OperationalPlan({
  regions,
  plan,
  onAddRegionToPlan,
  onUpdatePlanAngle,
  onDeletePlanItem,
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
                  <div className="toolbar plan-item-actions">
                    <span>{item.angle} deg</span>
                    <button
                      className="btn overlay-btn-icon"
                      type="button"
                      aria-label="Delete plan item"
                      title="Delete plan item"
                      onClick={() => onDeletePlanItem(item.id)}
                    >
                      <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" focusable="false">
                        <path
                          d="M9 3h6l1 2h5v2H3V5h5l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9z"
                          fill="currentColor"
                        />
                        <path d="M6 21h12l1-14H5l1 14z" fill="currentColor" opacity="0.25" />
                      </svg>
                    </button>
                  </div>
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
