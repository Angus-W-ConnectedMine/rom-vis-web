import { useEffect, useRef } from "react";
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

interface OverlayProps {
  selectionRect: SelectionRect | null;
  editingRegion: RegionMeta | null;
  onSaveRegionEdit: (key: number, regionId: string) => void;
  onCancelRegionEdit: () => void;
  onRequestRegionEdit: (key: number) => void;
  status: string;
  regions: RegionMeta[];
  selectedRegionKeys: number[];
  onSelectRegion: (key: number) => void;
  onDeleteRegion: (key: number) => void;
  onClearSelections: () => void;
}

function getSummary(regions: RegionMeta[], selectedRegionKeys: number[]) {
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
  } = props;
  const regionItemRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const previousSelectedRegionKeysRef = useRef<number[]>([]);

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

        <div className="card">
          <h4>Selected regions</h4>

          <div className="display-grid">
            <span>Total points: </span>
            <span>{summary.totalPoints}</span>

            <span>Average w: </span>
            <span>{summary.averageW.toFixed(3)}</span>
          </div>
        </div>
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
