import type { MutableRefObject } from "react";
import type { RegionMeta } from "./overlay";

interface RegionTabProps {
  status: string;
  regions: RegionMeta[];
  selectedRegionKeys: string[];
  summary: {
    totalPoints: number;
    averageW: number;
  };
  regionItemRefs: MutableRefObject<Map<string, HTMLDivElement>>;
  onSelectRegion: (key: string) => void;
  onRequestRegionEdit: (key: string) => void;
  onDeleteRegion: (key: string) => void;
  onClearSelections: () => void;
}

export function RegionTab({
  status,
  regions,
  selectedRegionKeys,
  summary,
  regionItemRefs,
  onSelectRegion,
  onRequestRegionEdit,
  onDeleteRegion,
  onClearSelections,
}: RegionTabProps) {
  return (
    <div className="overlay-tab-content" role="tabpanel" aria-labelledby="overlay-tab-regions">
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
                <div className="toolbar">
                  <button
                    className="btn overlay-btn-icon"
                    type="button"
                    aria-label={`Edit region ${region.regionId}`}
                    title="Edit region"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRequestRegionEdit(region.key);
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" focusable="false">
                      <path
                        d="M3 17.25V21h3.75L19.8 7.95l-3.75-3.75L3 17.25zm2.92 2.33H5v-.92l11.05-11.05.92.92L5.92 19.58zM20.7 6.3a1 1 0 0 0 0-1.41l-1.59-1.59a1 1 0 0 0-1.41 0l-1.02 1.02 3.75 3.75L20.7 6.3z"
                        fill="currentColor"
                      />
                    </svg>
                  </button>
                  <button
                    className="btn overlay-btn-icon"
                    type="button"
                    aria-label={`Delete region ${region.regionId}`}
                    title="Delete region"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDeleteRegion(region.key);
                    }}
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
              <div className="overlay-region-meta">
                Points: {region.pointCount} | Avg. grade: {region.avgW.toFixed(1)}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="toolbar">
        <button type="button" onClick={onClearSelections} disabled={regions.length === 0}>
          Clear
        </button>
      </div>

      <div className="card overlay-summary-card">
        <h4>Selected regions</h4>

        <div className="display-grid">
          <span>Total points: </span>
          <span>{summary.totalPoints}</span>

          <span>Average grade: </span>
          <span>{summary.averageW.toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
}
