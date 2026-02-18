import type { RegionMeta } from "./overlay";

export interface PlanItem {
  id: string;
  regionKey: string;
  angle: number;
  quantity: number;
}

export interface PlanOutcomeItem {
  planItemId: string;
  regionId: string;
  regionPointCount: number;
  regionTotalW: number;
  regionAverageW: number;
  extractedPointCount: number;
  extractedTotalW: number;
  extractedAverageW: number;
}

export interface PlanGrandTotal {
  extractedPointCount: number;
  totalW: number;
  averageW: number;
}

interface OperationalPlanProps {
  regions: RegionMeta[];
  plan: PlanItem[];
  outcomeByItemId: Record<string, PlanOutcomeItem>;
  grandTotal: PlanGrandTotal;
  onAddRegionToPlan: (region: RegionMeta) => void;
  onUpdatePlanAngle: (planItemId: string, angle: number) => void;
  onUpdatePlanQuantity: (planItemId: string, quantity: number) => void;
  onDeletePlanItem: (planItemId: string) => void;
}

export default function OperationalPlan({
  regions,
  plan,
  outcomeByItemId,
  grandTotal,
  onAddRegionToPlan,
  onUpdatePlanAngle,
  onUpdatePlanQuantity,
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
                {(() => {
                  const itemOutcome = outcomeByItemId[item.id];
                  return (
                    <>
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
                <div className="display-grid">
                  <span>Quantity:</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={item.quantity}
                    onChange={(event) => onUpdatePlanQuantity(item.id, Number(event.target.value))}
                  />
                </div>
                {itemOutcome ? (
                  <div className="display-grid">
                    <span>Region grade (avg/total):</span>
                    <span>{itemOutcome.regionAverageW.toFixed(2)} / {itemOutcome.regionTotalW.toFixed(2)}</span>
                    <span>Extracted grade (avg/total):</span>
                    <span>{itemOutcome.extractedAverageW.toFixed(2)} / {itemOutcome.extractedTotalW.toFixed(2)}</span>
                  </div>
                ) : null}
                    </>
                  );
                })()}
              </div>
            ))}
          </div>
        )}
      </div>

      <h3>Outcome:</h3>
      <div className="plan-item">
        <div className="display-grid">
          <span>Extracted points:</span>
          <span>{grandTotal.extractedPointCount}</span>
          <span>Total grade:</span>
          <span>{grandTotal.totalW.toFixed(1)}</span>
          <span>Average grade:</span>
          <span>{grandTotal.averageW.toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
}
