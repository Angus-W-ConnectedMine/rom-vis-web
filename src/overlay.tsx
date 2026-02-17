import type { Point } from "./points";
import { RegionFormModal } from "./regionFormModal";

export interface SelectionRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface RegionMeta {
  key: number;
  regionId: string;
  pointCount: number;
  minW: number;
  maxW: number;
  avgW: number;
  min: Point;
  max: Point;
}

export interface PendingRegionSelection {
  suggestedId: string;
  pointCount: number;
  minW: number;
  maxW: number;
  avgW: number;
}

interface OverlayProps {
  selectionRect: SelectionRect | null;
  pendingSelection: PendingRegionSelection | null;
  onConfirmSelection: (regionId: string) => void;
  onCancelSelection: () => void;
  status: string;
  regions: RegionMeta[];
  selectedRegionKeys: number[];
  onSelectRegion: (key: number) => void;
  onDeleteRegion: (key: number) => void;
  onClearSelections: () => void;
}

export function Overlay(props: OverlayProps) {
  const {
    selectionRect,
    pendingSelection,
    onConfirmSelection,
    onCancelSelection,
    status,
    regions,
    selectedRegionKeys,
    onSelectRegion,
    onDeleteRegion,
    onClearSelections,
  } = props;

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
                <div className="overlay-region-meta">
                  points: {region.pointCount} | W min/max/avg: {region.minW.toFixed(3)} / {region.maxW.toFixed(3)} / {region.avgW.toFixed(3)}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="overlay-toolbar">
          <button
            className="btn"
            type="button"
            onClick={onClearSelections}
            disabled={regions.length === 0}
          >
            Clear
          </button>
        </div>
      </aside>

      {pendingSelection ? (
        <RegionFormModal
          pendingSelection={pendingSelection}
          onConfirmSelection={onConfirmSelection}
          onCancelSelection={onCancelSelection}
        />
      ) : null}
    </>
  );
}
