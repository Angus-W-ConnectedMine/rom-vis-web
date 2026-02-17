import { useEffect, useRef } from "react";
import type { Point } from "./points";
import { RegionFormModal } from "./regionFormModal";
import OperationalPlan, { type PlanItem } from "./OperationPlan";

export interface SelectionRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface RegionMeta {
  key: string;
  regionId: string;
  pointCount: number;
  minW: number;
  maxW: number;
  avgW: number;
  min: Point;
  max: Point;
}

interface OverlayProps {
  selectionRect: SelectionRect | null;
  editingRegion: RegionMeta | null;
  onSaveRegionEdit: (key: string, regionId: string) => void;
  onCancelRegionEdit: () => void;
  onRequestRegionEdit: (key: string) => void;
  status: string;
  regions: RegionMeta[];
  selectedRegionKeys: string[];
  onSelectRegion: (key: string) => void;
  onDeleteRegion: (key: string) => void;
  onClearSelections: () => void;
  plan: PlanItem[];
  onAddRegionToPlan: (region: RegionMeta) => void;
  onUpdatePlanAngle: (planItemId: string, angle: number) => void;
}

function getSummary(regions: RegionMeta[], selectedRegionKeys: string[]) {
  const selectedRegions = regions.filter((region) => selectedRegionKeys.includes(region.key));
  const totalPoints = selectedRegions.reduce((sum, region) => sum + region.pointCount, 0);
  const averageW =
    totalPoints > 0
      ? selectedRegions.reduce((sum, region) => sum + region.avgW * region.pointCount, 0) / totalPoints
      : 0;

  return { totalPoints, averageW };
}

export function Overlay(props: OverlayProps) {
  const {
    selectionRect,
    editingRegion,
    onSaveRegionEdit,
    onCancelRegionEdit,
    onRequestRegionEdit,
    status,
    regions,
    selectedRegionKeys,
    onSelectRegion,
    onDeleteRegion,
    onClearSelections,
    plan,
    onAddRegionToPlan,
    onUpdatePlanAngle,
  } = props;
  const regionItemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const previousSelectedRegionKeysRef = useRef<string[]>([]);

  useEffect(() => {
    const previousSelectedRegionKeys = previousSelectedRegionKeysRef.current;
    const newlySelectedKey = selectedRegionKeys.find(
      (key) => !previousSelectedRegionKeys.includes(key),
    );

    if (newlySelectedKey !== undefined) {
      const regionItem = regionItemRefs.current.get(newlySelectedKey);
      regionItem?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    previousSelectedRegionKeysRef.current = selectedRegionKeys;
  }, [selectedRegionKeys]);

  const selectedRegions = regions.filter((region) => selectedRegionKeys.includes(region.key));

  const summary = getSummary(regions, selectedRegionKeys);

  return (
    <>
      {selectionRect ? (
        <div
          className="selection-rect"
          style={{
            left: selectionRect.left,
            top: selectionRect.top,
            width: selectionRect.width,
            height: selectionRect.height,
          }}
        />
      ) : null}
      <aside className="overlay-panel">
        <div className="overlay-title">Regions</div>
        <div className="overlay-status">{status}</div>

        {regions.length === 0 ? (
          <div className="overlay-empty">No regions</div>
        ) : (
          <div className="overlay-region-list">
            {regions.map((region) => (
              <div
                key={region.key}
                className={`overlay-region-item${selectedRegionKeys.includes(region.key) ? " is-selected" : ""}`}
                ref={(node) => {
                  if (node) {
                    regionItemRefs.current.set(region.key, node);
                  } else {
                    regionItemRefs.current.delete(region.key);
                  }
                }}
                onClick={() => onSelectRegion(region.key)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectRegion(region.key);
                  }
                }}
              >
                <div className="overlay-region-row">
                  <strong>{region.regionId}</strong>
                  <div>
                    <button
                      className="btn"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onRequestRegionEdit(region.key);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="btn overlay-btn-delete"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteRegion(region.key);
                      }}
                    >
                      x
                    </button>
                  </div>
                </div>
                <div className="overlay-region-meta">
                  points: {region.pointCount} | W min/max/avg: {region.minW.toFixed(3)} / {region.maxW.toFixed(3)} / {region.avgW.toFixed(3)}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="toolbar">
          <button
            type="button"
            onClick={onClearSelections}
            disabled={regions.length === 0}
          >
            Clear
          </button>
        </div>

        <div className="card">
          <h4>Selected regions</h4>

          <div className="display-grid">
            <span>Total points: </span>
            <span>{summary.totalPoints}</span>

            <span>Average w: </span>
            <span>{summary.averageW.toFixed(3)}</span>
          </div>
        </div>

        <OperationalPlan
          addableRegions={selectedRegions}
          allRegions={regions}
          plan={plan}
          onAddRegionToPlan={onAddRegionToPlan}
          onUpdatePlanAngle={onUpdatePlanAngle}
        />
      </aside>

      {editingRegion ? (
        <RegionFormModal
          region={editingRegion}
          onSaveEdit={(regionId) => onSaveRegionEdit(editingRegion.key, regionId)}
          onCancelEdit={onCancelRegionEdit}
        />
      ) : null}
    </>
  );
}
